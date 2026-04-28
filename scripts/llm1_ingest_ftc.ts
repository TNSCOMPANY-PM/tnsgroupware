/**
 * v2-02 LLM1 batch — ftc_brands_2024 → brand_facts (provenance='ftc') + industry_facts.
 *
 * Deterministic 코드 (LLM 호출 없음). 9,552 brand × 평균 25~40 metric → ~250~380k row.
 * + 외식 15 업종 × 9 metric × 5 agg_method ≈ 675 row industry_facts.
 *
 * 사용:
 *   npx tsx scripts/llm1_ingest_ftc.ts
 *   npx tsx scripts/llm1_ingest_ftc.ts --dry-run        (실제 적재 X, 통계만)
 *   npx tsx scripts/llm1_ingest_ftc.ts --industry "분식" (특정 업종만)
 *   npx tsx scripts/llm1_ingest_ftc.ts --reset          (provenance='ftc' 전부 삭제 후 재적재)
 *   npx tsx scripts/llm1_ingest_ftc.ts --limit 50       (테스트 — 50 brand 만)
 */

import * as fs from "node:fs";
import * as path from "node:path";

// ─── .env.local 직접 로드 ───
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

type MetricId = string;

type Args = {
  dryRun: boolean;
  industry: string | null;
  reset: boolean;
  limit: number | null;
};

function parseArgs(): Args {
  const a: Args = { dryRun: false, industry: null, reset: false, limit: null };
  const argv = process.argv.slice(2);
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--dry-run") a.dryRun = true;
    else if (arg === "--reset") a.reset = true;
    else if (arg === "--industry") a.industry = argv[++i];
    else if (arg === "--limit") a.limit = parseInt(argv[++i], 10);
  }
  return a;
}

// ─── ftc 컬럼명 → metric_id 매핑 (PR059 실측 컬럼명 기반) ───
type ColMapping = { metric_id: MetricId; transform?: (v: number) => number };

const FTC_COL_TO_METRIC: Record<string, ColMapping> = {
  // 기본
  induty_mlsfc: { metric_id: "industry_sub" },

  // 매출 (천원/연 → 만원/연. monthly_avg_revenue 는 derived ÷12)
  avg_sales_2024_total: { metric_id: "annual_revenue", transform: (v) => Math.round(v / 10) },

  // 가맹점
  frcs_cnt_2024_total: { metric_id: "stores_total" },
  chg_2024_new_open: { metric_id: "stores_new_open" },
  chg_2024_contract_end: { metric_id: "stores_close_terminate" },
  chg_2024_contract_cancel: { metric_id: "stores_close_cancel" },
  chg_2024_name_change: { metric_id: "stores_ownership_change" },

  // 창업 비용 (천원 → 만원 ÷10)
  startup_cost_total: { metric_id: "cost_total", transform: (v) => Math.round(v / 10) },
  startup_fee: { metric_id: "cost_franchise_fee", transform: (v) => Math.round(v / 10) },
  education_fee: { metric_id: "cost_education_fee", transform: (v) => Math.round(v / 10) },
  deposit_fee: { metric_id: "cost_deposit", transform: (v) => Math.round(v / 10) },
  other_fee: { metric_id: "cost_other", transform: (v) => Math.round(v / 10) },
  interior_cost_total: { metric_id: "cost_interior", transform: (v) => Math.round(v / 10) },
  interior_std_area: { metric_id: "cost_store_area" },

  // 본사 재무 (천원 → 만원)
  fin_2024_revenue: { metric_id: "hq_revenue", transform: (v) => Math.round(v / 10) },
  fin_2024_op_profit: { metric_id: "hq_op_profit", transform: (v) => Math.round(v / 10) },
  fin_2024_net_income: { metric_id: "hq_net_profit", transform: (v) => Math.round(v / 10) },
  fin_2024_total_asset: { metric_id: "hq_total_asset", transform: (v) => Math.round(v / 10) },
  fin_2024_total_equity: { metric_id: "hq_total_equity", transform: (v) => Math.round(v / 10) },
  fin_2024_total_debt: { metric_id: "hq_total_debt", transform: (v) => Math.round(v / 10) },
  staff_cnt: { metric_id: "hq_employees" },

  // 컴플라이언스
  violation_correction: { metric_id: "law_violations" },
  violation_civil: { metric_id: "disputes_count" },
};

const SOURCE_LABEL_FTC = "공정거래위원회 정보공개서 2024 (frandoor 적재본)";
const SOURCE_URL_FTC = "https://franchise.ftc.go.kr/";
const PERIOD = "2024-12";

type BrandFactRow = {
  brand_id: string;
  metric_id: string;
  metric_label: string;
  value_num: number | null;
  value_text: string | null;
  unit: string;
  period: string;
  provenance: "ftc" | "frandoor_derived";
  source_tier: "A" | "B" | "C";
  source_url: string;
  source_label: string;
  confidence: "high" | "medium" | "low";
  formula?: string | null;
  inputs?: Record<string, unknown> | null;
};

// 외식 15 업종 (induty_mlsfc 의 distinct 값 — 실측 후 정정 가능)
const RESTAURANT_INDUSTRIES = new Set([
  "한식", "중식", "일식", "양식", "분식", "치킨", "피자", "햄버거",
  "커피·음료", "주점", "베이커리", "디저트", "아이스크림", "도시락·죽", "기타외식",
]);

const INDUSTRY_AGG_METRICS: MetricId[] = [
  "monthly_avg_revenue", "annual_revenue", "stores_total",
  "cost_total", "cost_franchise_fee", "cost_interior", "cost_per_pyung",
  "hq_op_margin_pct", "hq_debt_ratio_pct",
];
const AGG_METHODS = ["trimmed_mean_5pct", "median", "p25", "p75", "p90"] as const;

function trimmedMean(values: number[], trimPct = 0.05): number | null {
  if (values.length === 0) return null;
  if (values.length < 10) {
    return values.reduce((s, v) => s + v, 0) / values.length;
  }
  const sorted = [...values].sort((a, b) => a - b);
  const trim = Math.floor(sorted.length * trimPct);
  const trimmed = sorted.slice(trim, sorted.length - trim);
  if (trimmed.length === 0) return null;
  return trimmed.reduce((s, v) => s + v, 0) / trimmed.length;
}

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

function percentile(values: number[], p: number): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.floor(sorted.length * p);
  return sorted[Math.min(idx, sorted.length - 1)];
}

function aggregate(values: number[], method: (typeof AGG_METHODS)[number]): number | null {
  if (values.length === 0) return null;
  switch (method) {
    case "trimmed_mean_5pct":
      return trimmedMean(values, 0.05);
    case "median":
      return median(values);
    case "p25":
      return percentile(values, 0.25);
    case "p75":
      return percentile(values, 0.75);
    case "p90":
      return percentile(values, 0.9);
  }
}

async function main() {
  const args = parseArgs();
  console.log(`\n=== LLM1 ingest ftc ===`);
  console.log(`옵션: dryRun=${args.dryRun} industry=${args.industry ?? "전체"} reset=${args.reset} limit=${args.limit ?? "-"}\n`);

  const { isFrandoorConfigured, createFrandoorClient } = await import("../utils/supabase/frandoor");
  const { createAdminClient } = await import("../utils/supabase/admin");
  const metricMod = await import("../lib/geo/v2/metric_ids");
  const METRIC_IDS = metricMod.METRIC_IDS;
  type TypedMetricId = keyof typeof METRIC_IDS;

  if (!isFrandoorConfigured()) {
    console.error("❌ FRANDOOR env 미설정");
    process.exit(1);
  }
  const fra = createFrandoorClient();
  const tns = createAdminClient();

  // (0) reset
  if (args.reset && !args.dryRun) {
    console.log("[reset] brand_facts WHERE provenance='ftc' OR 'frandoor_derived' 삭제 중...");
    const { error: rErr } = await fra.from("brand_facts").delete().in("provenance", ["ftc", "frandoor_derived"]);
    if (rErr) {
      console.error("[reset] 실패:", rErr.message);
      process.exit(1);
    }
    console.log("[reset] 완료\n");
  }

  // (1) tnsgroupware geo_brands → brand_id 매핑 (brand_nm 으로 join 시도)
  const { data: geoBrands, error: gbErr } = await tns
    .from("geo_brands")
    .select("id, name");
  if (gbErr) {
    console.error("[geo_brands] 조회 실패:", gbErr.message);
    process.exit(1);
  }
  const geoBrandMap = new Map<string, string>();
  for (const b of geoBrands ?? []) {
    if (typeof b.name === "string") geoBrandMap.set(b.name.replace(/\s+/g, ""), b.id);
  }
  console.log(`[geo_brands] ${geoBrandMap.size} brand`);

  // (2) ftc_brands_2024 fetch
  const ftcCols = Object.keys(FTC_COL_TO_METRIC).concat(["brand_nm"]);
  let q = fra.from("ftc_brands_2024").select(ftcCols.join(", "));
  if (args.industry) q = q.eq("induty_mlsfc", args.industry);
  if (args.limit) q = q.limit(args.limit);
  const { data: ftcRows, error: fErr } = await q;
  if (fErr) {
    console.error("[ftc_brands_2024] 조회 실패:", fErr.message);
    process.exit(1);
  }
  const rows = (ftcRows ?? []) as unknown as Record<string, unknown>[];
  console.log(`[ftc_brands_2024] ${rows.length} row\n`);

  // (3) brand_facts 빌드
  const allFacts: BrandFactRow[] = [];
  let matchedBrands = 0;
  let unmatchedBrandsExample: string[] = [];

  for (const row of rows) {
    const brandNm = String(row.brand_nm ?? "").replace(/\s+/g, "");
    if (!brandNm) continue;
    const brandId = geoBrandMap.get(brandNm);
    if (!brandId) {
      if (unmatchedBrandsExample.length < 5) unmatchedBrandsExample.push(brandNm);
      continue;
    }
    matchedBrands++;

    const localFacts: BrandFactRow[] = [];
    const metricsByCol: Record<MetricId, number | string | null> = {};

    // (3a) raw 매핑
    for (const [col, mapping] of Object.entries(FTC_COL_TO_METRIC)) {
      const raw = row[col];
      if (raw == null || raw === "") continue;
      const metricMeta = METRIC_IDS[mapping.metric_id as TypedMetricId];
      if (!metricMeta) continue;

      let value_num: number | null = null;
      let value_text: string | null = null;
      if (typeof raw === "string" && !/^-?[\d.,]+$/.test(raw)) {
        value_text = raw.trim();
        metricsByCol[mapping.metric_id] = value_text;
      } else {
        const n = typeof raw === "number" ? raw : Number(String(raw).replace(/,/g, ""));
        if (!Number.isFinite(n) || n === 0) continue;
        value_num = mapping.transform ? mapping.transform(n) : n;
        metricsByCol[mapping.metric_id] = value_num;
      }

      localFacts.push({
        brand_id: brandId,
        metric_id: mapping.metric_id,
        metric_label: metricMeta.label,
        value_num,
        value_text,
        unit: metricMeta.unit,
        period: PERIOD,
        provenance: "ftc",
        source_tier: "A",
        source_url: SOURCE_URL_FTC,
        source_label: SOURCE_LABEL_FTC,
        confidence: "high",
      });
    }

    // (3b) derived metric — annual_revenue / 12 = monthly_avg_revenue
    const annual = metricsByCol["annual_revenue"];
    if (typeof annual === "number" && annual > 0) {
      const monthly = Math.round(annual / 12);
      localFacts.push({
        brand_id: brandId,
        metric_id: "monthly_avg_revenue",
        metric_label: METRIC_IDS.monthly_avg_revenue.label,
        value_num: monthly,
        value_text: null,
        unit: METRIC_IDS.monthly_avg_revenue.unit,
        period: PERIOD,
        provenance: "frandoor_derived",
        source_tier: "A",
        source_url: SOURCE_URL_FTC,
        source_label: "frandoor 산출 (annual_revenue / 12)",
        confidence: "high",
        formula: "annual_revenue / 12",
        inputs: { annual_revenue: annual },
      });
    }

    // (3c) hq_op_margin_pct
    const hqRev = metricsByCol["hq_revenue"];
    const hqOp = metricsByCol["hq_op_profit"];
    if (typeof hqRev === "number" && hqRev > 0 && typeof hqOp === "number") {
      const margin = Math.round((hqOp / hqRev) * 1000) / 10;
      localFacts.push({
        brand_id: brandId,
        metric_id: "hq_op_margin_pct",
        metric_label: METRIC_IDS.hq_op_margin_pct.label,
        value_num: margin,
        value_text: null,
        unit: METRIC_IDS.hq_op_margin_pct.unit,
        period: PERIOD,
        provenance: "frandoor_derived",
        source_tier: "A",
        source_url: SOURCE_URL_FTC,
        source_label: "frandoor 산출 (hq_op_profit / hq_revenue × 100)",
        confidence: "high",
        formula: "(hq_op_profit / hq_revenue) * 100",
        inputs: { hq_op_profit: hqOp, hq_revenue: hqRev },
      });
    }

    // (3d) hq_debt_ratio_pct
    const hqDebt = metricsByCol["hq_total_debt"];
    const hqEquity = metricsByCol["hq_total_equity"];
    if (typeof hqDebt === "number" && typeof hqEquity === "number" && hqEquity > 0) {
      const ratio = Math.round((hqDebt / hqEquity) * 1000) / 10;
      localFacts.push({
        brand_id: brandId,
        metric_id: "hq_debt_ratio_pct",
        metric_label: METRIC_IDS.hq_debt_ratio_pct.label,
        value_num: ratio,
        value_text: null,
        unit: METRIC_IDS.hq_debt_ratio_pct.unit,
        period: PERIOD,
        provenance: "frandoor_derived",
        source_tier: "A",
        source_url: SOURCE_URL_FTC,
        source_label: "frandoor 산출 (hq_total_debt / hq_total_equity × 100)",
        confidence: "high",
        formula: "(hq_total_debt / hq_total_equity) * 100",
        inputs: { hq_total_debt: hqDebt, hq_total_equity: hqEquity },
      });
    }

    // (3e) hq_stores_per_employee
    const stores = metricsByCol["stores_total"];
    const employees = metricsByCol["hq_employees"];
    if (typeof stores === "number" && typeof employees === "number" && employees > 0) {
      const perEmp = Math.round((stores / employees) * 10) / 10;
      localFacts.push({
        brand_id: brandId,
        metric_id: "hq_stores_per_employee",
        metric_label: METRIC_IDS.hq_stores_per_employee.label,
        value_num: perEmp,
        value_text: null,
        unit: METRIC_IDS.hq_stores_per_employee.unit,
        period: PERIOD,
        provenance: "frandoor_derived",
        source_tier: "A",
        source_url: SOURCE_URL_FTC,
        source_label: "frandoor 산출 (stores_total / hq_employees)",
        confidence: "high",
        formula: "stores_total / hq_employees",
        inputs: { stores_total: stores, hq_employees: employees },
      });
    }

    // (3f) cost_per_pyung — interior_cost / (store_area / 3.3)
    const interiorCost = metricsByCol["cost_interior"];
    const storeArea = metricsByCol["cost_store_area"];
    if (typeof interiorCost === "number" && typeof storeArea === "number" && storeArea > 0) {
      const perPy = Math.round(interiorCost / (storeArea / 3.3));
      if (Number.isFinite(perPy) && perPy > 0) {
        localFacts.push({
          brand_id: brandId,
          metric_id: "cost_per_pyung",
          metric_label: METRIC_IDS.cost_per_pyung.label,
          value_num: perPy,
          value_text: null,
          unit: METRIC_IDS.cost_per_pyung.unit,
          period: PERIOD,
          provenance: "frandoor_derived",
          source_tier: "A",
          source_url: SOURCE_URL_FTC,
          source_label: "frandoor 산출 (cost_interior / (store_area / 3.3))",
          confidence: "high",
          formula: "cost_interior / (cost_store_area / 3.3)",
          inputs: { cost_interior: interiorCost, cost_store_area: storeArea },
        });
      }
    }

    allFacts.push(...localFacts);
  }

  console.log(`[brand_facts] 매칭 brand=${matchedBrands} / 미매칭=${rows.length - matchedBrands}`);
  if (unmatchedBrandsExample.length > 0) {
    console.log(`  미매칭 예시: ${unmatchedBrandsExample.join(", ")}`);
  }
  console.log(`[brand_facts] 총 row=${allFacts.length} (brand 평균 ${(allFacts.length / matchedBrands || 0).toFixed(1)} metric)\n`);

  // (4) industry_facts 빌드
  // brand 별 metric 값 그룹핑 → 업종별 집계
  const industryGroups = new Map<string, Map<MetricId, number[]>>();
  for (const f of allFacts) {
    if (f.value_num == null) continue;
    if (!INDUSTRY_AGG_METRICS.includes(f.metric_id)) continue;
    // 해당 brand 의 industry_sub 조회
    const brandRow = rows.find((r) => {
      const nm = String(r.brand_nm ?? "").replace(/\s+/g, "");
      return nm && geoBrandMap.get(nm) === f.brand_id;
    });
    const industry = String(brandRow?.induty_mlsfc ?? "");
    if (!industry) continue;
    if (!industryGroups.has(industry)) industryGroups.set(industry, new Map());
    const m = industryGroups.get(industry)!;
    if (!m.has(f.metric_id)) m.set(f.metric_id, []);
    m.get(f.metric_id)!.push(f.value_num);
  }

  const industryFactRows: Array<{
    industry: string;
    metric_id: string;
    metric_label: string;
    value_num: number;
    unit: string;
    period: string;
    n: number;
    agg_method: (typeof AGG_METHODS)[number];
    source_label: string;
  }> = [];
  for (const [industry, metricMap] of industryGroups.entries()) {
    for (const [mid, values] of metricMap.entries()) {
      if (values.length === 0) continue;
      const meta = METRIC_IDS[mid as TypedMetricId];
      if (!meta) continue;
      for (const method of AGG_METHODS) {
        const v = aggregate(values, method);
        if (v == null) continue;
        industryFactRows.push({
          industry,
          metric_id: mid,
          metric_label: meta.label,
          value_num: Math.round(v * 10) / 10,
          unit: meta.unit,
          period: PERIOD,
          n: values.length,
          agg_method: method,
          source_label: `공정위 정보공개서 2024 (${industry} ${values.length} brand 집계, ${method})`,
        });
      }
    }
  }
  console.log(`[industry_facts] ${industryFactRows.length} row (${industryGroups.size} 업종)\n`);

  // 업종 목록 미리보기
  const industriesPreview = [...industryGroups.keys()].slice(0, 15);
  console.log(`  업종: ${industriesPreview.join(", ")}\n`);

  if (args.dryRun) {
    console.log("✓ dry-run 모드 — 적재 skip\n");
    process.exit(0);
  }

  // (5) brand_facts 적재 (배치 1000)
  console.log("[brand_facts] upsert 시작...");
  const BATCH = 1000;
  let upserted = 0;
  for (let i = 0; i < allFacts.length; i += BATCH) {
    const slice = allFacts.slice(i, i + BATCH);
    const { error: insErr } = await fra
      .from("brand_facts")
      .upsert(slice, { onConflict: "brand_id,metric_id,period,provenance" });
    if (insErr) {
      console.error(`[brand_facts] batch ${i}: ${insErr.message}`);
      process.exit(1);
    }
    upserted += slice.length;
    if ((i / BATCH) % 10 === 0) console.log(`  ${upserted}/${allFacts.length}`);
  }
  console.log(`✓ brand_facts ${upserted} row upsert 완료\n`);

  // (6) industry_facts 적재
  console.log("[industry_facts] upsert 시작...");
  for (let i = 0; i < industryFactRows.length; i += BATCH) {
    const slice = industryFactRows.slice(i, i + BATCH);
    const { error: ifErr } = await fra
      .from("industry_facts")
      .upsert(slice, { onConflict: "industry,metric_id,period,agg_method" });
    if (ifErr) {
      console.error(`[industry_facts] batch ${i}: ${ifErr.message}`);
      process.exit(1);
    }
  }
  console.log(`✓ industry_facts ${industryFactRows.length} row upsert 완료\n`);

  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
