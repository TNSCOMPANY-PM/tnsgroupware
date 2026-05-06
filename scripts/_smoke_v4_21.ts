/**
 * v4-21 smoke — A_ONLY_SAFE_COLUMNS 실제 schema 정정 + injectDerivedMetrics 코드 계산.
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
  console.log(`  ${ok ? "✓" : "✗"} ${label}${detail ? ` — ${detail.slice(0, 200)}` : ""}`);
  if (!ok) okAll = false;
}

async function main() {
  console.log("\n=== v4-21 smoke ===\n");

  const fs = await import("node:fs/promises");
  const pipelineSrc = await fs.readFile("lib/geo/v4/pipeline.ts", "utf-8");
  const pipeline = await import("../lib/geo/v4/pipeline");

  // T1 — SAFE_COLUMNS 실제 schema 만 (존재 X 컬럼 제거)
  console.log("[T1] A_ONLY_SAFE_COLUMNS — 실제 schema 만");
  const safe = new Set<string>(pipeline.A_ONLY_SAFE_COLUMNS);
  // 제거 대상 (DB 에 없음)
  const removed = [
    "avg_sales_2023_total",
    "joining_fee",
    "deposit",
    "escrow_amount",
    "brand_cnt",
    "affiliate_cnt",
    "law_violation_cnt",
    "business_year_cnt",
    "frcs_cnt_2023_total",
    "fin_2024_total_asset", // 보존 (T1c 에서 확인)
  ];
  // ※ fin_2024_total_asset 은 그대로 유지해야 함. 실제로 schema 에 있음.
  // 위 list 에서 fin_2024_total_asset 빼고 검증.
  const realRemoved = removed.filter((c) => c !== "fin_2024_total_asset");
  for (const col of realRemoved) {
    check(`SAFE_COLUMNS 제거 — "${col}" 없음`, !safe.has(col));
  }
  // 추가 (실제 schema 에 있는 것)
  const added = [
    "avg_sales_2024_seoul",
    "avg_sales_2024_gyeonggi",
    "frcs_cnt_2024_seoul",
    "frcs_cnt_2024_gyeonggi",
    "stores_2023_franchise",
    "stores_2022_franchise",
    "chg_2023_new_open",
    "chg_2023_contract_end",
    "fin_2023_revenue",
    "fin_2023_op_profit",
    "fin_2023_net_income",
    "contract_initial_years",
    "contract_renewal_years",
    "violation_civil",
    "violation_correction",
    "violation_criminal",
    "deposit_fee",
    "other_fee",
  ];
  for (const col of added) {
    check(`SAFE_COLUMNS 추가 — "${col}"`, safe.has(col));
  }
  // T1c — 보존 컬럼
  const preserved = [
    "id",
    "brand_nm",
    "induty_mlsfc",
    "induty_lclas",
    "biz_start_dt",
    "avg_sales_2024_total",
    "frcs_cnt_2024_total",
    "startup_cost_total",
    "startup_fee",
    "education_fee",
    "interior_cost_total",
    "fin_2024_revenue",
    "fin_2024_op_profit",
    "fin_2024_net_income",
    "fin_2024_total_asset",
    "fin_2024_total_debt",
    "fin_2024_total_equity",
    "staff_cnt",
    "exec_cnt",
    "ad_cost_2024",
    "promo_cost_2024",
  ];
  for (const col of preserved) {
    check(`SAFE_COLUMNS 보존 — "${col}"`, safe.has(col));
  }

  // T2 — DERIVED_METRICS export
  console.log("\n[T2] A_ONLY_DERIVED_METRICS export (4건)");
  check(`A_ONLY_DERIVED_METRICS export`, Array.isArray(pipeline.A_ONLY_DERIVED_METRICS));
  check(
    `derived 4건 — hq_op_margin_pct / hq_debt_ratio / hq_net_margin_pct / hq_equity_ratio`,
    pipeline.A_ONLY_DERIVED_METRICS.length === 4 &&
      pipeline.A_ONLY_DERIVED_METRICS.includes("hq_op_margin_pct") &&
      pipeline.A_ONLY_DERIVED_METRICS.includes("hq_debt_ratio") &&
      pipeline.A_ONLY_DERIVED_METRICS.includes("hq_net_margin_pct") &&
      pipeline.A_ONLY_DERIVED_METRICS.includes("hq_equity_ratio"),
  );

  // T3 — RANKING_METRIC_ALLOWED 사용 + fallback
  console.log("\n[T3] runStep1AnalyzeAOnly — RANKING_METRIC_ALLOWED");
  check(`RANKING_METRIC_ALLOWED set`, pipelineSrc.includes("RANKING_METRIC_ALLOWED = new Set"));
  check(
    `RANKING_METRIC_ALLOWED.has(rawRankingMetric)`,
    pipelineSrc.includes("RANKING_METRIC_ALLOWED.has(rawRankingMetric)"),
  );
  check(`v4-21 마커`, pipelineSrc.includes("v4-21"));

  // T4 — injectDerivedMetrics 함수
  console.log("\n[T4] injectDerivedMetrics — derived metric 코드 계산");
  const { injectDerivedMetrics, buildIndustryAnalysisFacts, DEFAULT_RANKING_METRIC } = await import(
    "../lib/geo/v4/build_industry_analysis"
  );
  check(`injectDerivedMetrics export`, typeof injectDerivedMetrics === "function");
  check(`DEFAULT_RANKING_METRIC = avg_sales_2024_total`, DEFAULT_RANKING_METRIC === "avg_sales_2024_total");

  // 영업이익률 = 5040 / 50400 * 100 = 10
  const r1 = injectDerivedMetrics({
    fin_2024_revenue: 50400,
    fin_2024_op_profit: 5040,
    fin_2024_net_income: 3024,
    fin_2024_total_debt: 8000,
    fin_2024_total_equity: 12000,
    fin_2024_total_asset: 20000,
  });
  check(`hq_op_margin_pct = 10`, r1.hq_op_margin_pct === 10, String(r1.hq_op_margin_pct));
  // 부채비율 = 8000 / 12000 * 100 ≈ 66.667
  check(
    `hq_debt_ratio ≈ 66.67`,
    typeof r1.hq_debt_ratio === "number" && Math.abs((r1.hq_debt_ratio as number) - 66.66666666) < 0.01,
    String(r1.hq_debt_ratio),
  );
  // 순이익률 = 3024 / 50400 * 100 = 6
  check(`hq_net_margin_pct = 6`, r1.hq_net_margin_pct === 6, String(r1.hq_net_margin_pct));
  // 자본비율 = 12000 / 20000 * 100 = 60
  check(`hq_equity_ratio = 60`, r1.hq_equity_ratio === 60, String(r1.hq_equity_ratio));

  // null / 0 처리
  const r2 = injectDerivedMetrics({
    fin_2024_revenue: 0,
    fin_2024_op_profit: 100,
    fin_2024_total_debt: 100,
    fin_2024_total_equity: null,
  });
  check(`revenue=0 → hq_op_margin_pct = null`, r2.hq_op_margin_pct === null);
  check(`equity=null → hq_debt_ratio = null`, r2.hq_debt_ratio === null);

  const r3 = injectDerivedMetrics({});
  check(`raw 모두 missing → derived 모두 null`, r3.hq_op_margin_pct === null && r3.hq_debt_ratio === null);

  // T5 — buildIndustryAnalysisFacts 가 derived metric 으로 ranking 정렬 가능
  console.log("\n[T5] buildIndustryAnalysisFacts — derived ranking_metric");
  const brands = [
    { brand_nm: "A", fin_2024_revenue: 100, fin_2024_op_profit: 30, induty_mlsfc: "분식" }, // 30%
    { brand_nm: "B", fin_2024_revenue: 100, fin_2024_op_profit: 10, induty_mlsfc: "분식" }, // 10%
    { brand_nm: "C", fin_2024_revenue: 100, fin_2024_op_profit: 20, induty_mlsfc: "분식" }, // 20%
    { brand_nm: "D", fin_2024_revenue: 100, fin_2024_op_profit: 5, induty_mlsfc: "분식" }, //  5%
    { brand_nm: "E", fin_2024_revenue: 100, fin_2024_op_profit: 1, induty_mlsfc: "분식" }, //  1%
    { brand_nm: "F", fin_2024_revenue: 100, fin_2024_op_profit: 15, induty_mlsfc: "분식" }, // 15%
  ];
  const r = buildIndustryAnalysisFacts({
    industry: "분식",
    topic: "test",
    selected_metrics: [],
    key_angle: "k",
    analysis_axes: [],
    ranking_metric: "hq_op_margin_pct",
    brands,
    industry_facts: [],
  });
  check(`ranking_metric "hq_op_margin_pct" 정렬 동작`, r.ranking.top10.length >= 5);
  // 1위는 30% 영업이익률의 A
  check(`top1 = A (30% 영업이익률)`, r.ranking.top10[0]?.brand_label === "A", r.ranking.top10[0]?.brand_label);
  // top1 display "%" 단위
  check(
    `top1 display 포함 "%"`,
    !!r.ranking.top10[0] && r.ranking.top10[0].value.display.includes("%"),
    r.ranking.top10[0]?.value.display,
  );

  // T6 — LLM1 sysprompt — 실제 schema list
  console.log("\n[T6] llm1_analyze_a_only sysprompt — 실제 schema list");
  const llm1 = await import("../lib/geo/v4/sysprompts/llm1_analyze_a_only");
  const sp1 = llm1.buildLlm1AnalyzeAOnlySysprompt();
  // 실제 schema only
  check(`v4-21 마커`, sp1.includes("v4-21"));
  check(`avg_sales_2024_seoul list`, sp1.includes("avg_sales_2024_seoul"));
  check(`stores_2023_franchise (시계열)`, sp1.includes("stores_2023_franchise"));
  check(`fin_2023_revenue (시계열)`, sp1.includes("fin_2023_revenue"));
  check(`hq_op_margin_pct derived list`, sp1.includes("hq_op_margin_pct"));
  check(`hq_debt_ratio derived list`, sp1.includes("hq_debt_ratio"));
  check(`contract_initial_years`, sp1.includes("contract_initial_years"));
  // 제거된 영문/없는 컬럼 — ranking_metric 제약 섹션 (ftc_column_catalog 앞부분) 만 검증.
  // (catalog 는 FTC_COLUMN_META 의 152 컬럼 전체 라 그 안에 있는 건 OK)
  const rankSection = sp1.split("# ftc_column_catalog")[0];
  check(`ranking 섹션 — avg_sales_2023_total 제거`, !rankSection.includes("avg_sales_2023_total"));
  check(`ranking 섹션 — joining_fee 제거`, !rankSection.includes("joining_fee"));
  check(`ranking 섹션 — law_violation_cnt 제거`, !rankSection.includes("law_violation_cnt"));
  check(`ranking 섹션 — brand_cnt 제거`, !rankSection.includes("brand_cnt"));

  // T7 — fetchAOnlyBundle select string 사용
  console.log("\n[T7] fetchAOnlyBundle — selective 컬럼만");
  check(
    `select(A_ONLY_SAFE_COLUMNS.join(", "))`,
    pipelineSrc.includes("A_ONLY_SAFE_COLUMNS.join"),
  );
  check(`SAFE_COLUMNS 약 45개`, pipeline.A_ONLY_SAFE_COLUMNS.length >= 40 && pipeline.A_ONLY_SAFE_COLUMNS.length <= 55, `len=${pipeline.A_ONLY_SAFE_COLUMNS.length}`);

  console.log(`\n=== ${okAll ? "ALL PASS" : "SOME FAILED"} ===\n`);
  process.exit(okAll ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
