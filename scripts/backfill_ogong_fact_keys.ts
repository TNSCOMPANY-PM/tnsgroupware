/* PR025 — 오공김밥 gold input 의 fact_key·source_tier·period_month 를
 * brand_fact_data 에 upsert. 브랜드 없으면 먼저 insert.
 */
import * as fs from "fs";
import * as path from "path";
import { createClient, SupabaseClient } from "@supabase/supabase-js";

type GoldFact = {
  fact_key: string;
  source_tier: "A" | "B" | "C";
  name: string;
  value: string;
  year_month: string;
  source: string;
  source_url: string;
};

type GoldInput = {
  brandInput: { brand: string; brandId: string; slug: string };
  facts: { facts: GoldFact[] };
};

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

async function ensureBrand(supa: SupabaseClient, name: string): Promise<string | null> {
  const { data: found } = await supa
    .from("geo_brands")
    .select("id")
    .eq("name", name)
    .maybeSingle();
  if ((found as { id?: string } | null)?.id) return (found as { id: string }).id;
  const { data: inserted, error } = await supa
    .from("geo_brands")
    .insert({ name, category: "분식" })
    .select("id")
    .single();
  if (error) {
    console.warn(`[brand insert 실패] ${name}: ${error.message}`);
    return null;
  }
  console.warn(`[brand insert] ${name} 신규 생성 — geo_brands 에 없던 브랜드였음`);
  return (inserted as { id: string }).id;
}

function ymToPeriodMonth(ym: string): string {
  return /^\d{4}-\d{2}$/.test(ym) ? ym : "";
}

function sourceTypeFromTier(tier: "A" | "B" | "C"): string {
  if (tier === "A") return "공정위";
  if (tier === "B") return "정부_통계";
  return "POS_실거래";
}

function unitOf(value: string): string {
  if (value.includes("%")) return "%";
  if (value.includes("배")) return "없음";
  if (value.includes("만원") || value.includes("억")) return "만원";
  if (value.includes("개")) return "개";
  if (value.includes("건")) return "없음";
  return "없음";
}

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Supabase env 누락");
  const supa = createClient(url, key, { auth: { persistSession: false } });

  const jsonPath = path.resolve(__dirname, "..", "docs", "geo", "gold", "ogong_d3_input.json");
  const data: GoldInput = JSON.parse(fs.readFileSync(jsonPath, "utf8"));
  const brandName = data.brandInput.brand;

  const brandId = await ensureBrand(supa, brandName);
  if (!brandId) {
    console.error(`[backfill] ${brandName} 브랜드 확보 실패 — 중단`);
    process.exit(1);
  }

  let upserted = 0;
  for (const f of data.facts.facts) {
    const period = ymToPeriodMonth(f.year_month);
    const provenance = f.source_tier === "C" ? "docx" : "public_fetch";
    const row = {
      brand_id: brandId,
      label: f.name,
      value: f.value,
      value_normalized: null,
      unit: unitOf(f.value),
      source_type: sourceTypeFromTier(f.source_tier),
      source_note: f.source,
      source_url: f.source_url,
      provenance,
      confidence: f.source_tier === "A" ? 0.95 : f.source_tier === "B" ? 0.85 : 0.8,
      fact_key: f.fact_key,
      source_tier: f.source_tier,
      period_month: period,
    };

    // idempotent: 같은 brand_id + fact_key + source_tier + period_month 조합은 교체
    const { data: existing } = await supa
      .from("brand_fact_data")
      .select("id")
      .eq("brand_id", brandId)
      .eq("fact_key", f.fact_key)
      .eq("source_tier", f.source_tier)
      .eq("period_month", period)
      .maybeSingle();

    if ((existing as { id?: string } | null)?.id) {
      const { error } = await supa
        .from("brand_fact_data")
        .update(row)
        .eq("id", (existing as { id: string }).id);
      if (error) {
        console.warn(`[update 실패] ${f.fact_key} ${f.source_tier}: ${error.message}`);
        continue;
      }
    } else {
      const { error } = await supa.from("brand_fact_data").insert(row);
      if (error) {
        console.warn(`[insert 실패] ${f.fact_key} ${f.source_tier}: ${error.message}`);
        continue;
      }
    }
    upserted++;
  }

  console.log(`[backfill:ogong] brand=${brandName} id=${brandId} upserted=${upserted}/${data.facts.facts.length}`);
}

main().catch(e => { console.error(e); process.exit(1); });
