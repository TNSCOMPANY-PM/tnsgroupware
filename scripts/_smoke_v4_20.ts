/**
 * v4-20 smoke — Supabase 1000 cap 해제 + selective 컬럼 + ranking_metric SAFE_COLUMNS 제약.
 *
 * 정적 source-level 검증 (실제 fetch 는 vercel logs 에서 별도 확인).
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
  console.log("\n=== v4-20 smoke ===\n");

  const fs = await import("node:fs/promises");
  const pipelineSrc = await fs.readFile("lib/geo/v4/pipeline.ts", "utf-8");

  // T1 — A_ONLY_SAFE_COLUMNS export + selective fetch
  console.log("[T1] A_ONLY_SAFE_COLUMNS export + selective fetch");
  const pipeline = await import("../lib/geo/v4/pipeline");
  check(`A_ONLY_SAFE_COLUMNS export`, Array.isArray(pipeline.A_ONLY_SAFE_COLUMNS));
  check(
    `A_ONLY_SAFE_COLUMNS 30+ 컬럼`,
    pipeline.A_ONLY_SAFE_COLUMNS.length >= 30,
    `len=${pipeline.A_ONLY_SAFE_COLUMNS.length}`,
  );
  // 핵심 컬럼 포함
  const required = [
    "id",
    "brand_nm",
    "induty_mlsfc",
    "induty_lclas",
    "avg_sales_2024_total",
    "frcs_cnt_2024_total",
    "startup_cost_total",
    "fin_2024_revenue",
    "fin_2024_op_profit",
    "chg_2024_contract_cancel",
  ];
  for (const col of required) {
    check(`SAFE_COLUMNS 포함 — ${col}`, pipeline.A_ONLY_SAFE_COLUMNS.includes(col));
  }
  // 152 컬럼 전체 select 안 함
  check(
    `fetchAOnlyBundle 에서 select("*") 미사용`,
    !pipelineSrc.includes('.from("ftc_brands_2024")\n    .select("*")'),
  );
  check(`A_ONLY_SAFE_COLUMNS.join(", ") 사용`, pipelineSrc.includes("A_ONLY_SAFE_COLUMNS.join"));

  // T1b — pagination
  console.log("\n[T1b] pagination — 1000 cap 해제");
  check(`PAGE 상수 1000`, pipelineSrc.includes("const PAGE = 1000"));
  check(`SAFE_CAP 상수 (10000 권장)`, pipelineSrc.includes("SAFE_CAP"));
  check(`.range(from, from + PAGE - 1) page-by-page`, pipelineSrc.includes(".range(from, from + PAGE - 1)"));
  check(`.order("id", { ascending: true })`, pipelineSrc.includes('.order("id", { ascending: true })'));
  check(`for loop pagination (from += PAGE)`, pipelineSrc.includes("from += PAGE"));
  check(`v4-20 마커`, pipelineSrc.includes("v4-20"));

  // T2 — LLM1 sysprompt ranking_metric SAFE_COLUMNS 제약
  console.log("\n[T2] LLM1 sysprompt — ranking_metric SAFE_COLUMNS 제약");
  const llm1 = await import("../lib/geo/v4/sysprompts/llm1_analyze_a_only");
  const sp1 = llm1.buildLlm1AnalyzeAOnlySysprompt();
  check(`★ ranking_metric 제약 헤더`, sp1.includes("★ ranking_metric 제약"));
  check(`SAFE list — avg_sales_2024_total`, sp1.includes("avg_sales_2024_total"));
  check(`SAFE list — frcs_cnt_2024_total`, sp1.includes("frcs_cnt_2024_total"));
  check(`SAFE list — startup_cost_total`, sp1.includes("startup_cost_total"));
  check(`SAFE list — fin_2024_revenue`, sp1.includes("fin_2024_revenue"));
  check(`SAFE list — chg_2024_contract_cancel`, sp1.includes("chg_2024_contract_cancel"));
  check(`fallback 안내 (avg_sales_2024_total)`, sp1.includes('fallback "avg_sales_2024_total"'));

  // T3 — runStep1AnalyzeAOnly ranking_metric 검증 + fallback
  console.log("\n[T3] runStep1AnalyzeAOnly — ranking_metric 검증 + fallback");
  check(
    `A_ONLY_SAFE_COLUMNS_SET 검증`,
    pipelineSrc.includes("A_ONLY_SAFE_COLUMNS_SET.has(rawRankingMetric)"),
  );
  check(
    `fallback DEFAULT_RANKING_METRIC`,
    pipelineSrc.includes("? rawRankingMetric") &&
      pipelineSrc.includes(": DEFAULT_RANKING_METRIC"),
  );
  check(
    `fallback warn log (SAFE_COLUMNS 외)`,
    pipelineSrc.includes("SAFE_COLUMNS 외 → fallback"),
  );

  // T4 — DEFAULT_RANKING_METRIC 일치
  console.log("\n[T4] DEFAULT_RANKING_METRIC = avg_sales_2024_total ∈ SAFE_COLUMNS");
  const { DEFAULT_RANKING_METRIC } = await import("../lib/geo/v4/build_industry_analysis");
  check(`DEFAULT_RANKING_METRIC = "avg_sales_2024_total"`, DEFAULT_RANKING_METRIC === "avg_sales_2024_total");
  check(
    `DEFAULT_RANKING_METRIC ∈ SAFE_COLUMNS`,
    pipeline.A_ONLY_SAFE_COLUMNS.includes(DEFAULT_RANKING_METRIC),
  );

  console.log(`\n=== ${okAll ? "ALL PASS" : "SOME FAILED"} ===\n`);
  process.exit(okAll ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
