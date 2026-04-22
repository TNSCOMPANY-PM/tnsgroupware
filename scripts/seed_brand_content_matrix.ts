/* GEO T1 — geo_brand_content_matrix 시딩
 * 입력: docs/geo/브랜드콘텐츠활용매트릭스.xlsx
 * 처리:
 *   - Sheet 1 (가맹불가·제한 브랜드 카탈로그) → rule/reason 보강
 *   - Sheet 3 (87 브랜드 × 7 콘텐츠) → rule 매트릭스 upsert
 */
import * as fs from "fs";
import * as path from "path";
import * as XLSX from "xlsx";
import { createClient, SupabaseClient } from "@supabase/supabase-js";

function loadEnv() {
  const envPath = path.resolve(__dirname, "..", ".env.local");
  if (!fs.existsSync(envPath)) return;
  const text = fs.readFileSync(envPath, "utf8");
  let inQuote = false, buf = "";
  const lines: string[] = [];
  for (const ch of text) {
    if (ch === '"') inQuote = !inQuote;
    if (ch === "\n" && !inQuote) { lines.push(buf); buf = ""; continue; }
    buf += ch;
  }
  if (buf) lines.push(buf);
  for (const line of lines) {
    const m = line.match(/^([A-Z0-9_]+)=([\s\S]*)$/);
    if (!m) continue;
    let v = m[2];
    if (v.startsWith("'") && v.endsWith("'")) v = v.slice(1, -1);
    if (v.startsWith('"') && v.endsWith('"')) v = v.slice(1, -1);
    if (!process.env[m[1]]) process.env[m[1]] = v;
  }
}
loadEnv();

type Rule = "INCLUDE" | "CONDITIONAL" | "EXCLUDE";

const CONTENT_TYPE_MAP: Record<string, string> = {
  "관심도": "관심도 랭킹",
  "점포수": "점포수 랭킹",
  "시장규모": "시장 규모",
  "매출비교": "매출 분석",
  "창업비용": "창업비용",
  "월수익": "수익 시뮬레이션",
  "가맹계약": "가맹 계약",
};

function normalizeRule(cell: unknown): Rule | null {
  if (cell == null) return null;
  const s = String(cell).trim();
  if (!s) return null;
  if (s.includes("❌")) return "EXCLUDE";
  if (s.includes("⚠️") || s.includes("조건")) return "CONDITIONAL";
  if (s.includes("✅")) return "INCLUDE";
  if (/INCLUDE/i.test(s)) return "INCLUDE";
  if (/EXCLUDE/i.test(s)) return "EXCLUDE";
  if (/CONDITIONAL/i.test(s)) return "CONDITIONAL";
  return null;
}

async function ensureBrand(supa: SupabaseClient, name: string, category: string): Promise<string | null> {
  const { data: found } = await supa
    .from("geo_brands").select("id").eq("name", name).maybeSingle();
  if ((found as { id?: string } | null)?.id) return (found as { id: string }).id;
  const payload: Record<string, string> = { name };
  if (category) payload.category = category;
  const { data: inserted, error } = await supa
    .from("geo_brands").insert(payload).select("id").single();
  if (error) { console.warn(`[brand ins] ${name}: ${error.message}`); return null; }
  return (inserted as { id: string }).id;
}

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Supabase env 누락");
  const supa = createClient(url, key, { auth: { persistSession: false } });

  const xlsxPath = path.resolve(__dirname, "..", "docs", "geo", "브랜드콘텐츠활용매트릭스.xlsx");
  const wb = XLSX.readFile(xlsxPath);

  const sheet1Name = wb.SheetNames.find(n => n.includes("가맹불가")) ?? wb.SheetNames[0];
  const sheet3Name = wb.SheetNames.find(n => n.includes("87브랜드")) ?? wb.SheetNames[2];

  // Sheet 1: 창업불가 브랜드 사유 수집
  const reasonByBrand = new Map<string, string>();
  {
    const ws = wb.Sheets[sheet1Name];
    const rows = XLSX.utils.sheet_to_json<(string | null)[]>(ws, { header: 1, raw: false, defval: null });
    const header = rows[2] as (string | null)[];
    const idxBrand = header.indexOf("브랜드");
    const idxReason = header.indexOf("이유 (근거)");
    for (let i = 3; i < rows.length; i++) {
      const r = rows[i] as (string | null)[];
      const b = r[idxBrand] ? String(r[idxBrand]).trim() : "";
      const reason = r[idxReason] ? String(r[idxReason]).trim() : "";
      if (b && reason) reasonByBrand.set(b, reason);
    }
  }
  console.log(`[seed:matrix] 창업불가 사유 ${reasonByBrand.size}건 수집`);

  // Sheet 3: 브랜드 × 콘텐츠 매트릭스
  const ws = wb.Sheets[sheet3Name];
  const raw = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, raw: false, defval: null });
  const header = raw[2] as (string | null)[];
  const idxBrand = header.indexOf("브랜드");
  const idxCategory = header.indexOf("업종");
  const idxStatus = header.indexOf("구분");
  const contentCols: { name: string; idx: number }[] = [];
  for (let i = idxStatus + 1; i < header.length; i++) {
    const h = header[i];
    if (!h) continue;
    const typeName = CONTENT_TYPE_MAP[String(h).trim()] ?? String(h).trim();
    contentCols.push({ name: typeName, idx: i });
  }
  console.log(`[seed:matrix] 콘텐츠 컬럼 ${contentCols.length}개: ${contentCols.map(c => c.name).join(", ")}`);

  let brandCnt = 0, rowsUp = 0, skip = 0;
  const matrixRows: Array<{
    brand_id: string; content_type: string; rule: Rule;
    reason: string | null; updated_by: string; updated_at: string;
  }> = [];

  for (let i = 3; i < raw.length; i++) {
    const row = raw[i] as (string | null)[];
    const brandName = row[idxBrand] ? String(row[idxBrand]).trim() : "";
    if (!brandName) continue;
    const category = row[idxCategory] ? String(row[idxCategory]).trim() : "";
    const status = row[idxStatus] ? String(row[idxStatus]).trim() : "";

    const brandId = await ensureBrand(supa, brandName, category);
    if (!brandId) { skip++; continue; }
    brandCnt++;

    const baseReason = reasonByBrand.get(brandName) ?? null;

    for (const col of contentCols) {
      const rule = normalizeRule(row[col.idx]);
      if (!rule) continue;
      const reason = rule === "EXCLUDE" || rule === "CONDITIONAL"
        ? (baseReason ?? status ?? null)
        : null;
      matrixRows.push({
        brand_id: brandId,
        content_type: col.name,
        rule,
        reason,
        updated_by: "seed",
        updated_at: new Date().toISOString(),
      });
    }
  }

  // 배치 upsert
  const chunkSize = 200;
  for (let i = 0; i < matrixRows.length; i += chunkSize) {
    const chunk = matrixRows.slice(i, i + chunkSize);
    const { error } = await supa
      .from("geo_brand_content_matrix")
      .upsert(chunk, { onConflict: "brand_id,content_type" });
    if (error) { console.warn(`[matrix upsert 실패] ${error.message}`); }
    else { rowsUp += chunk.length; }
  }

  console.log(`[seed:matrix] 브랜드 ${brandCnt} 처리 (skip ${skip}) / 매트릭스 upsert ${rowsUp}건`);
}

main().catch(e => { console.error(e); process.exit(1); });
