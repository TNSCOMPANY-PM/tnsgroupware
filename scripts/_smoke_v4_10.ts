/**
 * v4-10 smoke — LLM1 단순화 (selected_metrics + key_angle) + buildAFactsFromMetrics 코드 후처리.
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
  console.log("\n=== v4-10 smoke ===\n");

  // T1 — LLM1 sysprompt 단순화
  console.log("[T1] LLM1 sysprompt 단순화 (selected_metrics + key_angle 만)");
  const llm1 = await import("../lib/geo/v4/sysprompts/llm1_facts_a");
  const sp = llm1.buildLlm1Sysprompt();
  check(`selected_metrics 명시`, sp.includes("selected_metrics"));
  check(`key_angle 명시`, sp.includes("key_angle"));
  check(`fact_groups 출력 X (코드 후처리)`, !sp.includes('"fact_groups": {'));
  check(`display 변환 룰 제거`, !sp.includes("만원 ≥ 10,000 → "));
  check(`brand_position 출력 X`, sp.includes("출력 X") || !sp.includes('"brand_position":'));
  check(`★ 절대 룰 (valid JSON 만)`, sp.includes("valid JSON 만"));
  check(`property name double-quoted`, sp.includes("double-quoted"));

  // user prompt — ftc_row 의존 제거 가능 (선별 hint 만)
  const up = llm1.buildLlm1User({
    brand_label: "오공김밥",
    industry: "한식",
    industry_sub: "분식",
    topic: "분식 평균 매출 비교",
    ftc_brand_id: "2295",
  });
  check(`user prompt — brand/industry/topic 포함`, up.includes("오공김밥") && up.includes("분식"));
  check(`user prompt — JSON 출력 지시`, up.includes("JSON 만 출력"));

  // T2 — callLLM1 (Sonnet) export
  console.log("\n[T2] claude.ts callLLM1 (Sonnet)");
  const claude = await import("../lib/geo/v4/claude");
  check(`callLLM1 exported`, typeof claude.callLLM1 === "function");
  check(`SONNET_MODEL = claude-sonnet-4-6`, claude.SONNET_MODEL === "claude-sonnet-4-6");

  // T3 — buildAFactsFromMetrics
  console.log("\n[T3] buildAFactsFromMetrics 결정론 후처리");
  const { buildAFactsFromMetrics } = await import("../lib/geo/v4/build_a_facts");

  // ftc_brands_2024 의 실제 storage 단위 (천원). KW transform (÷10) 으로 만원 정규화.
  const ftc_row = {
    period: "2024-12",
    frcs_cnt_2024_total: 55,
    avg_sales_2024_total: 625170, // 천원 → 62,517 만원
    fin_2024_revenue: 280000, // 천원 → 28,000 만원
    induty_lclas: "외식",
    induty_mlsfc: "분식",
  };
  const industry_facts = [
    { metric_id: "avg_sales_2024_total", agg_method: "p25", value_num: 20297, n: 238, unit: "만원" },
    { metric_id: "avg_sales_2024_total", agg_method: "p50", value_num: 34704, n: 238, unit: "만원" },
    { metric_id: "avg_sales_2024_total", agg_method: "p75", value_num: 54548, n: 238, unit: "만원" },
    { metric_id: "avg_sales_2024_total", agg_method: "p90", value_num: 79036, n: 238, unit: "만원" },
    { metric_id: "frcs_cnt_2024_total", agg_method: "p50", value_num: 30, n: 2000, unit: "개" },
  ];

  const a = buildAFactsFromMetrics({
    brand_label: "오공김밥",
    industry: "외식",
    industry_sub: "분식",
    topic: "분식 평균 매출 비교",
    ftc_brand_id: "2295",
    selected_metrics: [
      "avg_sales_2024_total",
      "frcs_cnt_2024_total",
      "fin_2024_revenue",
      "missing_metric_should_skip",
    ],
    key_angle: "분식 평균 대비 우위",
    ftc_row,
    industry_facts,
  });

  check(`brand_label preserved`, a.brand_label === "오공김밥");
  check(`industry_sub preserved`, a.industry_sub === "분식");
  check(`topic preserved`, a.topic === "분식 평균 매출 비교");
  check(`key_angle preserved`, a.key_angle === "분식 평균 대비 우위");
  check(`selected_metrics preserved`, a.selected_metrics.length === 4);
  check(
    `fact_groups 갯수 = 3 (missing 1건 skip)`,
    Object.keys(a.fact_groups).length === 3,
    `keys=${Object.keys(a.fact_groups).join(",")}`,
  );

  // avg_sales — display + distribution + brand_position
  const sales = a.fact_groups.avg_sales_2024_total;
  check(
    `avg_sales A.display = "6억 2,517만원"`,
    sales?.A?.display === "6억 2,517만원",
    sales?.A?.display,
  );
  check(`avg_sales A.unit = 만원`, sales?.A?.unit === "만원");
  check(`avg_sales A.raw_value = 62517`, sales?.A?.raw_value === 62517);
  check(`avg_sales A.source 공정위`, sales?.A?.source.includes("공정위") ?? false);
  check(`avg_sales distribution.p25 raw=20297`, sales?.distribution?.p25?.raw === 20297);
  check(
    `avg_sales distribution.p25.display = "2억 297만원"`,
    sales?.distribution?.p25?.display === "2억 297만원",
    sales?.distribution?.p25?.display,
  );
  check(`avg_sales distribution.n_population = 238`, sales?.distribution?.n_population === 238);
  check(
    `avg_sales brand_position 자연어 (상위)`,
    typeof sales?.distribution?.brand_position === "string" &&
      sales.distribution.brand_position.includes("상위"),
    sales?.distribution?.brand_position,
  );

  // frcs_cnt — distribution 1개만 (p25/p75 없음 → 그래도 build)
  const stores = a.fact_groups.frcs_cnt_2024_total;
  check(`frcs_cnt A.display = "55개"`, stores?.A?.display === "55개", stores?.A?.display);
  check(`frcs_cnt distribution exists`, !!stores?.distribution);
  check(`frcs_cnt distribution.p50.raw = 30`, stores?.distribution?.p50?.raw === 30);

  // fin_2024_revenue — KW transform (천원 → 만원, ÷10)
  const finRev = a.fact_groups.fin_2024_revenue;
  check(`fin_revenue transform 적용 (raw 28000)`, finRev?.A?.raw_value === 28000, String(finRev?.A?.raw_value));
  check(`fin_revenue display = "2억 8,000만원"`, finRev?.A?.display === "2억 8,000만원", finRev?.A?.display);

  // population_info
  check(`population_info.avg_sales = 238`, a.population_info.avg_sales_2024_total === 238);
  check(`population_info.frcs_cnt = 2000`, a.population_info.frcs_cnt_2024_total === 2000);

  // T4 — 빈 selected_metrics
  console.log("\n[T4] 빈 selected_metrics");
  {
    const a2 = buildAFactsFromMetrics({
      brand_label: "X",
      industry: "Y",
      industry_sub: null,
      topic: "t",
      ftc_brand_id: "1",
      selected_metrics: [],
      key_angle: "k",
      ftc_row,
      industry_facts: [],
    });
    check(`fact_groups 0건`, Object.keys(a2.fact_groups).length === 0);
    check(`industry_sub null 보존`, a2.industry_sub === null);
  }

  // T5 — distribution 없으면 distribution undefined
  console.log("\n[T5] industry_facts 없으면 distribution 미생성");
  {
    const a3 = buildAFactsFromMetrics({
      brand_label: "X",
      industry: "Y",
      industry_sub: null,
      topic: "t",
      ftc_brand_id: "1",
      selected_metrics: ["frcs_cnt_2024_total"],
      key_angle: "k",
      ftc_row: { frcs_cnt_2024_total: 10 },
      industry_facts: [],
    });
    const g = a3.fact_groups.frcs_cnt_2024_total;
    check(`A 존재`, !!g?.A);
    check(`distribution 없음`, !g?.distribution);
  }

  // T6 — pipeline 모듈 — buildAFactsFromMetrics 사용 + Haiku 호출 제거
  console.log("\n[T6] pipeline 모듈 surface (LLM1 Sonnet 전환)");
  const fs = await import("node:fs/promises");
  const pipelineSrc = await fs.readFile("lib/geo/v4/pipeline.ts", "utf-8");
  check(`callLLM1 import`, pipelineSrc.includes("callLLM1"));
  check(`buildAFactsFromMetrics import`, pipelineSrc.includes("buildAFactsFromMetrics"));
  check(`callHaiku import 제거`, !pipelineSrc.includes("callHaiku"));
  check(`v4-10 마커`, pipelineSrc.includes("v4-10"));
  check(
    `pipeline_version "v4-10"`,
    pipelineSrc.includes('pipeline_version: "v4-10"'),
  );

  console.log(`\n=== ${okAll ? "ALL PASS" : "SOME FAILED"} ===\n`);
  process.exit(okAll ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
