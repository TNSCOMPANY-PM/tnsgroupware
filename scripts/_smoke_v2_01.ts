/**
 * v2-01 smoke test — metric_ids 정의 + 헬퍼 함수 검증.
 * schema 적용은 별도 스크립트 (v2_01_apply_schema.ts) 필요.
 */
import Module from "node:module";
const ModAny = Module as unknown as { _load: (req: string, ...rest: unknown[]) => unknown };
const origLoad = ModAny._load;
ModAny._load = function (req: string, ...rest: unknown[]) {
  if (req === "server-only") return {};
  return origLoad.call(this, req, ...rest);
};

let okAll = true;
function check(label: string, ok: boolean, detail?: string) {
  console.log(`  ${ok ? "✓" : "✗"} ${label}${detail ? ` — ${detail}` : ""}`);
  if (!ok) okAll = false;
}

async function main() {
  const { METRIC_IDS, isValidMetricId, getMetricLabel, getMetricUnit } = await import(
    "../lib/geo/v2/metric_ids"
  );

  console.log("\n=== v2-01 smoke ===\n");

  console.log("[T2] METRIC_IDS 정의");
  const total = Object.keys(METRIC_IDS).length;
  check(`${total}개 metric 정의 (47 기대)`, total === 47, String(total));

  // 카테고리 정확 매핑 (prefix 휴리스틱이 derived 와 겹치므로 명시 리스트 사용)
  const basic = ["industry_sub"];
  const revenue = [
    "monthly_avg_revenue", "annual_revenue", "revenue_per_area",
    "top3_revenue_avg", "bottom3_revenue_avg", "revenue_top_bottom_ratio",
  ];
  const stores = [
    "stores_total", "stores_total_hq_announced", "stores_new_open",
    "stores_close_terminate", "stores_close_cancel", "stores_ownership_change",
    "stores_3y_growth_rate", "stores_avg_open_pace_per_month",
  ];
  const cost = [
    "cost_total", "cost_franchise_fee", "cost_education_fee", "cost_deposit",
    "cost_other", "cost_interior", "cost_per_pyung", "cost_store_area",
  ];
  const hqStd = [
    "hq_revenue", "hq_op_profit", "hq_op_margin_pct", "hq_net_profit",
    "hq_total_asset", "hq_total_equity", "hq_total_debt", "hq_debt_ratio_pct",
    "hq_employees", "hq_stores_per_employee",
  ];
  const hqAnn = ["hq_announced_net_margin_pct", "hq_announced_payback_months"];
  const compliance = ["law_violations", "disputes_count", "haccp_certified", "business_age_years"];
  const region = ["region_metro_pct", "region_top1_share_pct"];
  const derived = [
    "ratio_to_industry_avg", "diff_to_industry_avg", "industry_percentile",
    "cost_payback_months_estimate", "hq_vs_industry_op_margin_diff_pp", "stores_growth_factor",
  ];

  const allDefined = [
    ...basic, ...revenue, ...stores, ...cost,
    ...hqStd, ...hqAnn, ...compliance, ...region, ...derived,
  ];
  const unique = new Set(allDefined);
  check(
    `카테고리 정의 합계 = 47 + 중복 0`,
    allDefined.length === 47 && unique.size === 47,
    `len=${allDefined.length}/unique=${unique.size}`,
  );

  // 모든 카테고리 metric 이 실제로 METRIC_IDS 에 등록됐는지
  const missing = allDefined.filter((k) => !(k in METRIC_IDS));
  check(`정의된 47 모두 METRIC_IDS 에 등록`, missing.length === 0, missing.join(",") || "OK");

  // 역방향 — METRIC_IDS 에 있는데 카테고리 분류 안 된 것 0건
  const orphan = Object.keys(METRIC_IDS).filter((k) => !unique.has(k));
  check(`고아 metric 0건`, orphan.length === 0, orphan.join(",") || "OK");

  console.log(
    `   분포: basic 1 / revenue 6 / stores 8 / cost 8 / hq_std 10 / hq_announced 2 / compliance 4 / region 2 / derived 6 = 47`,
  );

  // 헬퍼 함수
  console.log("\n[T2] helper 함수");
  check("isValidMetricId('monthly_avg_revenue') = true", isValidMetricId("monthly_avg_revenue"));
  check("isValidMetricId('nonexistent') = false", !isValidMetricId("nonexistent"));
  check(
    "getMetricLabel('monthly_avg_revenue') = '가맹점 월평균매출'",
    getMetricLabel("monthly_avg_revenue") === "가맹점 월평균매출",
  );
  check(
    "getMetricUnit('hq_op_margin_pct') = '%'",
    getMetricUnit("hq_op_margin_pct") === "%",
  );
  check(
    "getMetricUnit('haccp_certified') = '' (boolean)",
    getMetricUnit("haccp_certified") === "",
  );

  // SQL 파일 확인
  console.log("\n[T1] migration SQL 파일 확인");
  const fs = await import("node:fs");
  const path = await import("node:path");
  const sqlPath = path.resolve(process.cwd(), "db/migrations/v2_01_brand_facts.sql");
  check("db/migrations/v2_01_brand_facts.sql 존재", fs.existsSync(sqlPath));
  if (fs.existsSync(sqlPath)) {
    const content = fs.readFileSync(sqlPath, "utf8");
    check("brand_facts CREATE", /CREATE TABLE IF NOT EXISTS brand_facts/.test(content));
    check("industry_facts CREATE", /CREATE TABLE IF NOT EXISTS industry_facts/.test(content));
    check("provenance CHECK 4종", /provenance.*ftc.*docx.*kosis.*frandoor_derived/.test(content));
    check("source_tier CHECK A/B/C", /source_tier.*A.*B.*C/.test(content));
    check("agg_method CHECK", /trimmed_mean_5pct.*mean.*median/.test(content));
    check("brand_facts 3 인덱스", (content.match(/CREATE INDEX IF NOT EXISTS idx_brand_facts/g) ?? []).length === 3);
    check("industry_facts 2 인덱스", (content.match(/CREATE INDEX IF NOT EXISTS idx_industry_facts/g) ?? []).length === 2);
    check("updated_at trigger", /trg_brand_facts_updated_at/.test(content));
  }

  // apply 스크립트 존재
  const applyPath = path.resolve(process.cwd(), "scripts/v2_01_apply_schema.ts");
  check("scripts/v2_01_apply_schema.ts 존재", fs.existsSync(applyPath));

  console.log(`\n=== ${okAll ? "ALL PASS" : "SOME FAILED"} ===\n`);
  process.exit(okAll ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
