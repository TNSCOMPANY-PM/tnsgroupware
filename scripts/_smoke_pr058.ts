/**
 * PR058 — 표준 metric 매핑 + LLM fallback + L72/L75 입력 빌더 smoke test.
 * LLM 호출은 ANTHROPIC_API_KEY 미설정 시 graceful skip.
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
  const {
    STANDARD_METRICS,
    assignMetric,
    assignFtcMetric,
    metricLabel,
    ftcRowToMetrics,
  } = await import("../lib/geo/standardSchema");
  const { buildUnifiedFacts, crossCheckDocxVsFtc, mappingStats, parseNumeric } = await import(
    "../lib/geo/depth/unifiedFacts"
  );
  const { llmClassifyMetric } = await import("../lib/geo/prefetch/llmMetricClassifier");

  console.log("\n=== PR058 smoke ===\n");

  // T3.1 STANDARD_METRICS 정의 수
  console.log("[T3.1] STANDARD_METRICS 정의");
  const totalMetrics = Object.keys(STANDARD_METRICS).length;
  check(`STANDARD_METRICS ${totalMetrics}개 정의 (≥30 기대)`, totalMetrics >= 30, `${totalMetrics}`);
  check(
    "metricLabel(franchise_fee) = 가맹비",
    metricLabel("franchise_fee") === "가맹비",
    metricLabel("franchise_fee"),
  );
  check(
    "metricLabel(monthly_avg_sales) = 월평균매출",
    metricLabel("monthly_avg_sales") === "월평균매출",
  );

  // T3.2 assignMetric 휴리스틱
  console.log("\n[T3.2] assignMetric 휴리스틱");
  {
    const r = assignMetric("가맹비");
    check("'가맹비' → franchise_fee high", r?.metric_id === "franchise_fee" && r.confidence === "high", `${r?.metric_id}/${r?.confidence}`);
  }
  {
    const r = assignMetric("월 평균 매출");
    check("'월 평균 매출' → monthly_avg_sales high", r?.metric_id === "monthly_avg_sales" && r.confidence === "high", `${r?.metric_id}/${r?.confidence}`);
  }
  {
    const r = assignMetric("월평균매출");
    check("'월평균매출' → monthly_avg_sales high", r?.metric_id === "monthly_avg_sales", `${r?.metric_id}/${r?.confidence}`);
  }
  {
    const r = assignMetric("초기 가맹비 부담금");
    check("'초기 가맹비 부담금' → franchise_fee medium (contains)", r?.metric_id === "franchise_fee" && r.confidence === "medium", `${r?.metric_id}/${r?.confidence}`);
  }
  {
    const r = assignMetric("창업비용 총액");
    check("'창업비용 총액' → cost_total high", r?.metric_id === "cost_total" && r.confidence === "high", `${r?.metric_id}/${r?.confidence}`);
  }
  {
    const r = assignMetric("프리미엄 패키지 비용");
    check("'프리미엄 패키지 비용' → unmapped (null)", r === null, r === null ? "null" : r.metric_id);
  }
  {
    const r = assignMetric("가맹점 수");
    check("'가맹점 수' → stores_franchise high", r?.metric_id === "stores_franchise" && r.confidence === "high", `${r?.metric_id}/${r?.confidence}`);
  }

  // T3.3 assignFtcMetric
  console.log("\n[T3.3] assignFtcMetric");
  {
    const r = assignFtcMetric("franchise_fee");
    check("ftc col 'franchise_fee' → franchise_fee", r === "franchise_fee", String(r));
  }
  {
    const r = assignFtcMetric("avg_sales_2024_total");
    check("ftc col 'avg_sales_2024_total' → monthly_avg_sales", r === "monthly_avg_sales", String(r));
  }
  {
    const r = assignFtcMetric("nonexistent_column");
    check("ftc col 'nonexistent_column' → null", r === null, String(r));
  }

  // T3.4 ftcRowToMetrics
  console.log("\n[T3.4] ftcRowToMetrics");
  const fakeRow = {
    brand_nm: "오공김밥",
    induty_mlsfc: "분식",
    franchise_fee: 1000,
    avg_sales_2024_total: 5210,
    fin_2024_op_profit: 250000000,
    fin_2024_revenue: 8000000000,
    nonexistent: "ignored",
  };
  const metrics = ftcRowToMetrics(fakeRow);
  check("franchise_fee = 1000", metrics.franchise_fee === 1000, String(metrics.franchise_fee));
  check("monthly_avg_sales = 5210", metrics.monthly_avg_sales === 5210, String(metrics.monthly_avg_sales));
  check("hq_op_profit = 250000000", metrics.hq_op_profit === 250000000, String(metrics.hq_op_profit));
  check("hq_revenue = 8000000000", metrics.hq_revenue === 8000000000, String(metrics.hq_revenue));

  // T6 buildUnifiedFacts + crossCheck
  console.log("\n[T6/T7] buildUnifiedFacts + crossCheckDocxVsFtc");
  const fakeDocx = {
    brand_id: "x",
    brand_name: "오공김밥",
    official_data: null,
    raw_text_chunks: [],
    file_url: null,
    comparison_tables: [
      {
        section: "창업비용",
        area: "startup_cost" as const,
        headers: ["항목", "공정위", "본사"],
        rows: [
          {
            metric: "가맹비",
            official_value: "1,500만원",
            brochure_value: null,
            note: null,
            unit: "만원",
            metric_id: "franchise_fee" as const,
            confidence: "high" as const,
          },
          {
            metric: "월평균매출",
            official_value: "5,210만원",
            brochure_value: "6,000만원",
            note: null,
            unit: "만원",
            metric_id: "monthly_avg_sales" as const,
            confidence: "high" as const,
          },
        ],
      },
    ],
    data_tables: [],
  };
  const fakeStdFtc = {
    brand_nm: "오공김밥",
    reg_no: "20180001",
    industry_sub: "분식",
    metrics: {
      franchise_fee: 1000, // docx 1500 vs ftc 1000 = 33% 차이 → conflict
      monthly_avg_sales: 5210, // docx 5210 vs ftc 5210 = 0% → no conflict
      hq_op_margin_pct: 1.8, // docx 에 없음 → ftc-only
    },
    raw: {},
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const unified = buildUnifiedFacts({ docx: fakeDocx as any, ftc: fakeStdFtc as any });
  check(
    `unified facts 3개 (docx 2 + ftc-only 1)`,
    unified.length === 3,
    `${unified.length}: ${unified.map((u) => u.metric_id).join(",")}`,
  );
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const conflicts = crossCheckDocxVsFtc({ docx: fakeDocx as any, ftc: fakeStdFtc as any });
  check(
    `crossCheck conflict 1건 (가맹비 33% 차이)`,
    conflicts.length === 1 && conflicts[0].metric_id === "franchise_fee",
    `${conflicts.length}: ${conflicts.map((c) => `${c.metric_label}(${c.diff_pct}%)`).join(",")}`,
  );

  // mappingStats
  console.log("\n[T7] mappingStats");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const ms = mappingStats(fakeDocx as any);
  check(
    `total=2 high=2 unmapped=0 high_pct=100`,
    ms.total === 2 && ms.high === 2 && ms.unmapped === 0 && ms.high_pct === 100,
    JSON.stringify(ms),
  );

  // parseNumeric
  console.log("\n[parseNumeric]");
  check("'5,210만원' → 5210", parseNumeric("5,210만원") === 5210);
  check("'21개' → 21", parseNumeric("21개") === 21);
  check("'12.3%' → 12.3", parseNumeric("12.3%") === 12.3);
  check("'-' → null", parseNumeric("-") === null);

  // T8 LLM classifier (graceful skip if no key)
  console.log("\n[T8] llmClassifyMetric (env 없으면 graceful skip)");
  {
    const r = await llmClassifyMetric({
      cell_text: "가맹비",
      context_headers: ["항목", "공정위"],
    });
    if (process.env.ANTHROPIC_API_KEY) {
      check(
        "ANTHROPIC_API_KEY 있음 — '가맹비' → franchise_fee",
        r.metric_id === "franchise_fee",
        `${r.metric_id}/${r.confidence}`,
      );
    } else {
      check(
        "ANTHROPIC_API_KEY 없음 — graceful skip (null + reason)",
        r.metric_id === null && (r.reason ?? "").includes("ANTHROPIC_API_KEY"),
        `${r.metric_id}/${r.reason}`,
      );
    }
  }

  console.log(`\n=== ${okAll ? "ALL PASS" : "SOME FAILED"} ===\n`);
  process.exit(okAll ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
