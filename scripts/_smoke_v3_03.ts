/**
 * v3-03 smoke — 2단계 분할 파이프라인 (LLM/DB 호출 없이 module 로드 + 타입 sanity).
 * runPhaseA / runPhaseB 의 실제 흐름은 통합 테스트 (editor에서 골든 샘플) 로 검증.
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
  console.log(`  ${ok ? "✓" : "✗"} ${label}${detail ? ` — ${detail.slice(0, 120)}` : ""}`);
  if (!ok) okAll = false;
}

async function main() {
  console.log("\n=== v3-03 smoke ===\n");

  // T1 — pipeline 모듈 로드 + public surface
  console.log("[T1] pipeline 모듈 surface");
  const pipeline = await import("../lib/geo/v3/pipeline");
  check(`runPhaseA exported`, typeof pipeline.runPhaseA === "function");
  check(`runPhaseB exported`, typeof pipeline.runPhaseB === "function");
  check(`InsufficientDataError exported`, typeof pipeline.InsufficientDataError === "function");
  check(`HallucinationDetectedError exported`, typeof pipeline.HallucinationDetectedError === "function");
  check(`LintErrorV3 exported`, typeof pipeline.LintErrorV3 === "function");
  check(`DraftNotFoundError exported`, typeof pipeline.DraftNotFoundError === "function");
  check(`InvalidStageError exported`, typeof pipeline.InvalidStageError === "function");

  // generateV3 는 v3-03 에서 제거됨 — Phase 분할로 대체
  const hasGenerateV3 = "generateV3" in pipeline;
  check(`generateV3 제거됨 (Phase 분할로 대체)`, !hasGenerateV3);

  // T2 — Error class shape
  console.log("\n[T2] Error class shape");
  {
    const e = new pipeline.InsufficientDataError({ factsCount: 3, required: 5 });
    check(`InsufficientDataError code`, e.code === "INSUFFICIENT_DATA");
    check(`InsufficientDataError stats`, e.stats.factsCount === 3 && e.stats.required === 5);
  }
  {
    const e = new pipeline.HallucinationDetectedError(["a", "b"]);
    check(`HallucinationDetectedError code`, e.code === "HALLUCINATION_DETECTED");
    check(`HallucinationDetectedError unmatched`, e.unmatched.length === 2);
  }
  {
    const e = new pipeline.LintErrorV3(["L8 percentile 잔존"]);
    check(`LintErrorV3 code`, e.code === "LINT_V3_FAILED");
    check(`LintErrorV3 lintErrors`, e.lintErrors.length === 1);
  }
  {
    const e = new pipeline.DraftNotFoundError("abc-123");
    check(`DraftNotFoundError code`, e.code === "DRAFT_NOT_FOUND");
    check(`DraftNotFoundError draftId`, e.draftId === "abc-123");
  }
  {
    const e = new pipeline.InvalidStageError("abc-123", "write_done");
    check(`InvalidStageError code`, e.code === "INVALID_STAGE");
    check(`InvalidStageError currentStage`, e.currentStage === "write_done");
  }

  // T3 — types 모듈
  console.log("\n[T3] types 모듈");
  const types = await import("../lib/geo/v3/types");
  // types only exports types — runtime check that import works
  check(`types 모듈 로드`, typeof types === "object");

  // T4 — claude / sysprompts / steps 모듈 로드 (간접)
  console.log("\n[T4] sysprompts / claude 로드");
  const claude = await import("../lib/geo/v3/claude");
  check(`extractJson 함수`, typeof claude.extractJson === "function");
  const planSp = await import("../lib/geo/v3/sysprompts/plan");
  const structSp = await import("../lib/geo/v3/sysprompts/structure");
  const writeSp = await import("../lib/geo/v3/sysprompts/write");
  // v3-05: buildPolishSysprompt 폐기 (Step 4-B haiku 제거)
  check(`buildPlanSysprompt`, typeof planSp.buildPlanSysprompt === "function");
  check(`buildStructureSysprompt`, typeof structSp.buildStructureSysprompt === "function");
  check(`buildWriteSysprompt`, typeof writeSp.buildWriteSysprompt === "function");

  // T5 — post_process / crosscheck / lint 무영향 (v3-01 기능 보존)
  console.log("\n[T5] post_process / crosscheck / lint 무영향");
  const { postProcess } = await import("../lib/geo/v3/post_process");
  {
    const r = postProcess("연매출 34,704만원");
    check(`postProcess 억단위 변환 보존`, r.body.includes("3억 4,704만원"));
  }
  const { crosscheckV3 } = await import("../lib/geo/v3/crosscheck");
  {
    const r = crosscheckV3("연매출 3억 4,704만원입니다.", [
      {
        metric_id: "rev",
        metric_label: "rev",
        value_num: 34704,
        value_text: null,
        unit: "만원",
        period: "2024-12",
        source_tier: "A",
        source_label: "공정위",
      },
    ]);
    check(`crosscheckV3 억단위 매칭 보존`, r.ok);
  }
  const { lintV3 } = await import("../lib/geo/v3/lint");
  {
    const r = lintV3("p75 기준선이 8,123만원입니다.");
    check(`lintV3 L8 percentile 잔존 보존`, r.errors.some((e) => e.startsWith("L8")));
  }

  console.log(`\n=== ${okAll ? "ALL PASS" : "SOME FAILED"} ===\n`);
  process.exit(okAll ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
