/* GEO T1 — geo_brand_alias 시딩
 * 입력: docs/geo/top50_search_volume_v2.json
 * 처리: brand 이름으로 geo_brands 조회/생성 → 120 alias upsert
 */
import * as fs from "fs";
import * as path from "path";
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

type AliasItem = { alias: string; total: number; pc: number; mobile: number };
type BrandItem = {
  brand: string;
  category: string;
  pc: number;
  mobile: number;
  total: number;
  compIdx: string;
  usedAlias: string;
  aliasBreakdown: AliasItem[];
};
type Json = { dataAsOf: string; source: string; method: string; brandCount: number; top50: BrandItem[]; all: BrandItem[] };

async function ensureBrand(supa: SupabaseClient, name: string, category: string): Promise<string | null> {
  const { data: found } = await supa
    .from("geo_brands")
    .select("id")
    .eq("name", name)
    .maybeSingle();
  if ((found as { id?: string } | null)?.id) return (found as { id: string }).id;
  const payload: Record<string, string> = { name };
  if (category) payload.category = category;
  const { data: inserted, error } = await supa
    .from("geo_brands")
    .insert(payload)
    .select("id")
    .single();
  if (error) {
    console.warn(`[brand insert 실패] ${name}: ${error.message}`);
    return null;
  }
  return (inserted as { id: string }).id;
}

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Supabase env 누락");
  const supa = createClient(url, key, { auth: { persistSession: false } });

  const jsonPath = path.resolve(__dirname, "..", "docs", "geo", "top50_search_volume_v2.json");
  const data: Json = JSON.parse(fs.readFileSync(jsonPath, "utf8"));

  let brandOk = 0, brandSkip = 0, aliasUp = 0;
  for (const b of data.all) {
    const brandId = await ensureBrand(supa, b.brand, b.category);
    if (!brandId) { brandSkip++; continue; }
    brandOk++;

    const rows = b.aliasBreakdown.map((a) => ({
      brand_id: brandId,
      alias: a.alias,
      is_canonical: a.alias === b.brand,
    }));

    const { error } = await supa
      .from("geo_brand_alias")
      .upsert(rows, { onConflict: "brand_id,alias" });
    if (error) {
      console.warn(`[alias upsert 실패] ${b.brand}: ${error.message}`);
    } else {
      aliasUp += rows.length;
    }
  }

  console.log(`[seed:alias] 브랜드 ${brandOk}/${data.all.length} 처리 (skip ${brandSkip})`);
  console.log(`[seed:alias] alias upsert ${aliasUp}건`);
}

main().catch(e => { console.error(e); process.exit(1); });
