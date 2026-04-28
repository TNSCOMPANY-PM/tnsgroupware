/**
 * FTC connector 진단 스크립트.
 * 1. 컬럼 152개 카테고리별 grep
 * 2. 오공김밥 row raw dump (가맹점수·매출·창업비용 정확 매핑)
 * 3. 분식 업종 평균 산출 가능성 점검
 *
 * 실행: npx tsx scripts/_dump-ftc-diagnose.ts
 */

import * as fs from "node:fs";
import * as path from "node:path";

// ─────────────────────────────────────────────
// .env.local 직접 로드 (npx tsx 단독 실행 시 Next.js 자동 로드 안 됨)
// ─────────────────────────────────────────────
const envPath = path.resolve(process.cwd(), ".env.local");
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const m = line.match(/^([A-Z0-9_]+)=([\s\S]*)$/);
    if (!m) continue;
    let v = m[2];
    if (v.startsWith("'") && v.endsWith("'")) v = v.slice(1, -1);
    if (v.startsWith('"') && v.endsWith('"')) v = v.slice(1, -1);
    if (!process.env[m[1]]) process.env[m[1]] = v;
  }
}

async function main() {
  // dynamic import — env 로드 후 client 생성
  const { isFrandoorConfigured, createFrandoorClient } = await import(
    "../utils/supabase/frandoor"
  );

  if (!isFrandoorConfigured()) {
    console.error("FRANDOOR_SUPABASE_URL / FRANDOOR_SUPABASE_SERVICE_ROLE_KEY 미설정");
    process.exit(1);
  }

  const sb = createFrandoorClient();

  // ─────────────────────────────────────────────
  // [1] 컬럼 152개 카테고리별 grep
  // ─────────────────────────────────────────────
  console.log("=".repeat(80));
  console.log("[1] 컬럼 카테고리별 dump");
  console.log("=".repeat(80));

  const sample = await sb.from("ftc_brands_2024").select("*").limit(1);
  if (sample.error || !sample.data?.length) {
    console.error("sample fetch error:", sample.error);
    return;
  }
  const cols = Object.keys(sample.data[0]);
  console.log(`\n총 ${cols.length} 컬럼\n`);

  const grep = (...kws: string[]) =>
    cols.filter((c) => kws.some((kw) => c.toLowerCase().includes(kw)));

  console.log("[가맹점·점포]", grep("store", "frcs", "shop", "branch"));
  console.log("[매출]", grep("sale", "revenue", "avg"));
  console.log("[창업비용]", grep("fee", "cost", "deposit", "interior"));
  console.log("[변동]", grep("open", "terminate", "end", "change", "new"));
  console.log("[재무]", grep("fin_", "asset", "equity", "debt", "profit", "income"));
  console.log("[광고·판촉]", grep("ad_", "promo", "marketing"));
  console.log("[지역]", grep("seoul", "busan", "_avg_"));
  console.log("[법위반·인증]", grep("violation", "law", "haccp", "cert"));
  console.log("[기간·연도]", grep("year", "period", "duration"));

  // ─────────────────────────────────────────────
  // [2] 오공김밥 row raw dump
  // ─────────────────────────────────────────────
  console.log("\n" + "=".repeat(80));
  console.log("[2] 오공김밥 row raw dump");
  console.log("=".repeat(80));

  const { data: ogong, error } = await sb
    .from("ftc_brands_2024")
    .select("*")
    .eq("brand_nm", "오공김밥")
    .limit(1);

  if (error) {
    console.error("fetch error:", error);
    return;
  }

  if (!ogong?.length) {
    console.log("오공김밥 row 없음 — fuzzy 시도");
    const { data: fuzzy } = await sb
      .from("ftc_brands_2024")
      .select("brand_nm, corp_nm, induty_mlsfc")
      .ilike("brand_nm", "%오공김밥%")
      .limit(5);
    console.log("fuzzy 결과:", fuzzy);
    return;
  }

  // null/undefined/빈 문자열 컬럼은 제외 (가독성)
  const filled: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(ogong[0])) {
    if (v !== null && v !== undefined && v !== "") filled[k] = v;
  }
  console.log(`\n채워진 컬럼 ${Object.keys(filled).length}개:\n`);
  console.log(JSON.stringify(filled, null, 2));

  // ─────────────────────────────────────────────
  // [3] 분식 업종 평균 산출 가능성 점검
  // ─────────────────────────────────────────────
  console.log("\n" + "=".repeat(80));
  console.log("[3] 분식 업종 평균 산출 가능성 점검");
  console.log("=".repeat(80));

  const candidates = [
    "fin_2024_revenue",
    "fin_2024_op_profit",
    "fin_2024_total_asset",
    "fin_2024_total_equity",
    "fin_2024_total_debt",
    "avg_sales_2024_total",
    "monthly_avg_sales",
    "total_stores",
    "frcs_cnt",
    "stores_total",
    "cost_total",
    "joining_fee",
    "franchise_fee",
    "education_fee",
    "deposit",
    "interior_cost",
  ];

  for (const col of candidates) {
    if (!cols.includes(col)) {
      console.log(`  ${col}: ✗ 컬럼 부재`);
      continue;
    }
    const { data: vals, error: vErr } = await sb
      .from("ftc_brands_2024")
      .select(col)
      .eq("induty_mlsfc", "분식")
      .not(col, "is", null);
    if (vErr) {
      console.log(`  ${col}: query error ${vErr.message}`);
      continue;
    }
    const nums = (vals ?? [])
      .map((r: any) => Number(r[col]))
      .filter((n) => Number.isFinite(n) && n > 0);
    if (nums.length === 0) {
      console.log(`  ${col}: ✗ 분식 brand 중 양수 값 0건`);
      continue;
    }
    const avg = nums.reduce((s, n) => s + n, 0) / nums.length;
    console.log(`  ${col}: n=${nums.length} avg=${Math.round(avg).toLocaleString()}`);
  }
}

main().catch((e) => {
  console.error("실패:", e);
  process.exit(1);
});
