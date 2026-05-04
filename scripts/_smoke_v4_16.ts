/**
 * v4-16 smoke — A only 분석 모드 (별도 3-step + sysprompt + buildAOnlyFacts + endpoints).
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
  console.log("\n=== v4-16 smoke ===\n");

  // T1 — DB migration 파일 존재
  console.log("[T1] DB migration gen_mode 컬럼");
  const fs = await import("node:fs/promises");
  const migration = await fs
    .readFile("supabase/migrations/20260507_v4_16_a_only_mode.sql", "utf-8")
    .catch(() => "");
  check(`migration 파일 존재`, migration.length > 0);
  check(`gen_mode 컬럼 추가`, migration.includes("ADD COLUMN IF NOT EXISTS gen_mode"));
  check(`gen_mode CHECK 'a_plus_c' / 'a_only'`, migration.includes("'a_plus_c'") && migration.includes("'a_only'"));
  check(
    `stage CHECK 확장 (a_only_analyzed/structured/written)`,
    migration.includes("'a_only_analyzed'") &&
      migration.includes("'a_only_structured'") &&
      migration.includes("'a_only_written'"),
  );

  // T2 — LLM1 analyze A only sysprompt
  console.log("\n[T2] sysprompts/llm1_analyze_a_only.ts");
  const llm1 = await import("../lib/geo/v4/sysprompts/llm1_analyze_a_only");
  const sp1 = llm1.buildLlm1AnalyzeAOnlySysprompt();
  check(`selected_metrics 명시`, sp1.includes("selected_metrics"));
  check(`key_angle 명시`, sp1.includes("key_angle"));
  check(`analysis_axes 명시`, sp1.includes("analysis_axes"));
  check(`★ valid JSON 만`, sp1.includes("valid JSON 만"));
  check(`property name double-quoted`, sp1.includes("double-quoted"));
  check(`ftc_column_catalog 포함`, sp1.includes("ftc_column_catalog") || sp1.includes("ftc_brands_2024"));
  check(`본사 데이터 인용 금지`, sp1.includes("본사 데이터") && sp1.includes("X"));

  // T3 — build_a_only_facts
  console.log("\n[T3] build_a_only_facts.ts");
  const { buildAOnlyFacts } = await import("../lib/geo/v4/build_a_only_facts");

  const ftc_row = {
    period: "2024-12",
    frcs_cnt_2024_total: 55,
    frcs_cnt_2023_total: 45,
    chg_2024_new_open: 12,
    chg_2023_new_open: 8,
    fin_2024_revenue: 280000, // 천원 → 28,000 만원 (KW transform)
    fin_2023_revenue: 250000,
    avg_sales_2024_total: 625170,
    induty_lclas: "외식",
    induty_mlsfc: "분식",
  };

  const r = buildAOnlyFacts({
    brand_label: "오공김밥",
    industry: "분식",
    industry_sub: "분식",
    topic: "오공김밥 정보공개서 종합 분석",
    ftc_brand_id: "2295",
    selected_metrics: [
      "frcs_cnt_2024_total",
      "chg_2024_new_open",
      "fin_2024_revenue",
      "avg_sales_2024_total",
    ],
    key_angle: "분식 평균 대비 매출 우위 + 본사 수익성 약점",
    analysis_axes: [
      "시장 포지션",
      "본사 재무 건전성",
      "성장 추세 (시계열)",
    ],
    ftc_row,
    industry_facts: [],
  });

  check(`brand_label preserved`, r.brand_label === "오공김밥");
  check(`analysis_axes 3건`, r.analysis_axes.length === 3);
  check(`fact_groups 다중`, Object.keys(r.fact_groups).length >= 3);

  // timeseries 검증
  check(`timeseries.frcs_cnt_2024_total 존재`, !!r.timeseries.frcs_cnt_2024_total);
  const ts1 = r.timeseries.frcs_cnt_2024_total;
  check(`frcs_cnt current=55 prev=45`, ts1?.current === 55 && ts1?.prev === 45);
  check(`frcs_cnt delta=10 / direction=up`, ts1?.delta === 10 && ts1?.direction === "up");
  check(
    `frcs_cnt pct ≈ 22.2%`,
    !!ts1 && Math.abs((ts1.pct ?? 0) - 22.222222222222225) < 0.01,
    String(ts1?.pct),
  );
  check(`frcs_cnt current_display = "55개"`, ts1?.current_display === "55개");

  check(`timeseries.fin_2024_revenue 존재 (KW transform 적용)`, !!r.timeseries.fin_2024_revenue);
  const ts2 = r.timeseries.fin_2024_revenue;
  // 천원 280000 → ÷10 = 만원 28000
  check(`fin_revenue current=28000 (만원)`, ts2?.current === 28000, String(ts2?.current));
  check(`fin_revenue prev=25000 (만원)`, ts2?.prev === 25000, String(ts2?.prev));
  check(`fin_revenue delta_display = "3,000만원"`, ts2?.delta_display === "3,000만원", ts2?.delta_display ?? "");

  // 미선택 metric 의 timeseries 는 X
  check(`avg_sales 는 timeseries pair 없음`, !r.timeseries.avg_sales_2024_total);

  // T4 — writer_a_only sysprompt
  console.log("\n[T4] sysprompts/writer_a_only.ts");
  const writer = await import("../lib/geo/v4/sysprompts/writer_a_only");
  const wsp = writer.buildWriterAOnlySysprompt({
    brand_label: "오공김밥",
    industry: "분식",
    industry_sub: "분식",
    topic: "test",
    today: "2026-05-04",
  });
  check(`★ C 데이터 인용 절대 X`, wsp.includes("C 데이터 인용 절대 X"));
  check(`★ A vs C 비교표 출력 X`, wsp.includes("A vs C 비교표 출력 X"));
  check(`분석 톤 강제`, wsp.includes("분석 톤 강제"));
  check(`본문 3블럭 / 4,000자`, wsp.includes("3블럭") && wsp.includes("4,000자"));
  check(`블럭 D / E 등장 X (3블럭만)`, !wsp.includes("[블럭 D]") && !wsp.includes("[블럭 E]"));
  check(`timeseries 활용 명시`, wsp.includes("timeseries"));
  check(`frontmatter / FAQ 출력 금지`, wsp.includes("frontmatter / FAQ 출력 금지"));
  check(`물결 ～ 룰`, wsp.includes("전각 물결"));

  // T5 — endpoints
  console.log("\n[T5] 3 endpoint 파일 존재");
  const ep1 = await fs.readFile("app/api/geo/a-only/analyze/route.ts", "utf-8").catch(() => "");
  const ep2 = await fs.readFile("app/api/geo/a-only/structure/[draft_id]/route.ts", "utf-8").catch(() => "");
  const ep3 = await fs.readFile("app/api/geo/a-only/write/[draft_id]/route.ts", "utf-8").catch(() => "");
  check(`/a-only/analyze 존재`, ep1.length > 0 && ep1.includes("runStep1AnalyzeAOnly"));
  check(`/a-only/structure/[draft_id] 존재`, ep2.length > 0 && ep2.includes("runStep2StructureAOnly"));
  check(`/a-only/write/[draft_id] 존재`, ep3.length > 0 && ep3.includes("runStep3WriteAOnly"));
  check(`각 route maxDuration 60`, ep1.includes("maxDuration = 60") && ep2.includes("maxDuration = 60") && ep3.includes("maxDuration = 60"));

  // T6 — pipeline 함수 export
  console.log("\n[T6] pipeline runStep1/2/3AnalyzeAOnly export");
  const pipeline = await import("../lib/geo/v4/pipeline");
  check(`runStep1AnalyzeAOnly exported`, typeof pipeline.runStep1AnalyzeAOnly === "function");
  check(`runStep2StructureAOnly exported`, typeof pipeline.runStep2StructureAOnly === "function");
  check(`runStep3WriteAOnly exported`, typeof pipeline.runStep3WriteAOnly === "function");

  const pipelineSrc = await fs.readFile("lib/geo/v4/pipeline.ts", "utf-8");
  check(`v4-16 마커`, pipelineSrc.includes("v4-16"));
  check(`gen_mode='a_only' INSERT`, pipelineSrc.includes('gen_mode: "a_only"'));
  check(`stage='a_only_analyzed' INSERT`, pipelineSrc.includes('stage: "a_only_analyzed"'));

  // T7 — editor 탭 UI
  console.log("\n[T7] editor page — 탭 UI + chain 분기");
  const editorSrc = await fs.readFile("app/(groupware)/content/editor/page.tsx", "utf-8");
  check(`genMode state`, editorSrc.includes("genMode") && editorSrc.includes("a_plus_c"));
  check(`탭 — 팩트 콘텐츠 (A+C)`, editorSrc.includes("팩트 콘텐츠 (A+C)"));
  check(`탭 — 분석 콘텐츠 (A only)`, editorSrc.includes("분석 콘텐츠 (A only)"));
  check(`chain 분기 — /a-only/analyze`, editorSrc.includes("/api/geo/a-only/analyze"));
  check(`chain 분기 — /a-only/structure`, editorSrc.includes("/api/geo/a-only/structure"));
  check(`chain 분기 — /a-only/write`, editorSrc.includes("/api/geo/a-only/write"));
  check(`기존 facts-a chain 유지`, editorSrc.includes("/api/geo/facts-a"));

  console.log(`\n=== ${okAll ? "ALL PASS" : "SOME FAILED"} ===\n`);
  process.exit(okAll ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
