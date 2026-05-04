/**
 * v4-07 smoke — 3-step pipeline (facts-a / facts-c / write) module surface + sysprompts.
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
  console.log("\n=== v4-07 smoke ===\n");

  // T1 — pipeline 모듈 surface
  console.log("[T1] pipeline 3-step surface");
  const pipeline = await import("../lib/geo/v4/pipeline");
  check(`runStep1FactsA exported`, typeof pipeline.runStep1FactsA === "function");
  check(`runStep2FactsC exported`, typeof pipeline.runStep2FactsC === "function");
  check(`runStep3Write exported`, typeof pipeline.runStep3Write === "function");
  check(`DraftNotFoundError exported`, typeof pipeline.DraftNotFoundError === "function");
  check(`InvalidStageError exported`, typeof pipeline.InvalidStageError === "function");
  check(`generateV4 제거`, !("generateV4" in pipeline));

  // T2 — Error class shape
  console.log("\n[T2] Error class shape");
  {
    const e = new pipeline.DraftNotFoundError("draft-123");
    check(`DraftNotFoundError code`, e.code === "DRAFT_NOT_FOUND");
  }
  {
    const e = new pipeline.InvalidStageError("d-1", "facts_a_done", "facts_c_done");
    check(`InvalidStageError expected/actual`, e.expected === "facts_a_done" && e.actual === "facts_c_done");
  }

  // T3 — sysprompts 3 빌더
  console.log("\n[T3] sysprompts 3 builders");
  const llm1 = await import("../lib/geo/v4/sysprompts/llm1_facts_a");
  const llm2 = await import("../lib/geo/v4/sysprompts/llm2_facts_c");
  const writer = await import("../lib/geo/v4/sysprompts/writer");
  check(`buildLlm1Sysprompt exported`, typeof llm1.buildLlm1Sysprompt === "function");
  check(`buildLlm1User exported`, typeof llm1.buildLlm1User === "function");
  check(`buildLlm2Sysprompt exported`, typeof llm2.buildLlm2Sysprompt === "function");
  check(`buildLlm2User exported`, typeof llm2.buildLlm2User === "function");
  check(`buildWriterSysprompt exported`, typeof writer.buildWriterSysprompt === "function");
  check(`buildWriterUserPrompt exported`, typeof writer.buildWriterUserPrompt === "function");

  const llm1Sp = llm1.buildLlm1Sysprompt();
  // v4-10: LLM1 output 단순화 — selected_metrics + key_angle 만 (display·distribution → 코드 후처리)
  check(`llm1 sysprompt — selected_metrics 명시`, llm1Sp.includes("selected_metrics"));
  check(`llm1 sysprompt — key_angle 명시`, llm1Sp.includes("key_angle"));
  check(`llm1 sysprompt — JSON 만`, llm1Sp.includes("JSON 만"));
  check(`llm1 sysprompt — ftc 카탈로그 포함`, llm1Sp.includes("ftc_column_catalog") || llm1Sp.includes("ftc_brands_2024"));

  const llm2Sp = llm2.buildLlm2Sysprompt();
  check(`llm2 sysprompt — A vs C 매칭`, llm2Sp.includes("a_facts 의 metric_id"));
  check(`llm2 sysprompt — ac_diff_analysis`, llm2Sp.includes("ac_diff_analysis"));
  check(`llm2 sysprompt — c_only_facts`, llm2Sp.includes("c_only_facts"));
  check(`llm2 sysprompt — value_text 보존`, llm2Sp.includes("value_text"));

  const writerSp = writer.buildWriterSysprompt({
    brand_label: "오공김밥",
    industry: "외식",
    industry_sub: "분식",
    topic: "분식 평균 매출",
    today: "2026-05-04",
    hasDocx: true,
  });
  check(`writer — ★ 절대 룰 (paste)`, writerSp.includes("display 그대로 paste"));
  check(`writer — 톤 60%/25%/5%/10%`, writerSp.includes("60%") && writerSp.includes("25%"));
  // v4-13: "C급 활용 강제" → "본사 데이터 활용 ★ 강제"
  check(`writer — 본사 데이터 활용 강제`, writerSp.includes("본사 데이터 활용 ★ 강제"));
  check(`writer — A vs C 비교표 룰`, writerSp.includes("A vs C 비교표"));
  check(`writer — ac_diff_analysis 그대로`, writerSp.includes("ac_diff_analysis 그대로 paste"));
  check(`writer — brand_position paste`, writerSp.includes("brand_position 그대로 paste"));

  const writerNoDocx = writer.buildWriterSysprompt({
    brand_label: "테스트",
    industry: "치킨",
    topic: "test",
    today: "2026-05-04",
    hasDocx: false,
  });
  check(`writer hasDocx=false → 본사 데이터 활용 섹션 X`, !writerNoDocx.includes("본사 데이터 활용 ★ 강제"));

  // T4 — types
  console.log("\n[T4] types V4Step1Response / V4Step2Response / AFactsResult / CFactsResult");
  const types = await import("../lib/geo/v4/types");
  check(`types module loaded`, typeof types === "object");

  console.log(`\n=== ${okAll ? "ALL PASS" : "SOME FAILED"} ===\n`);
  process.exit(okAll ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
