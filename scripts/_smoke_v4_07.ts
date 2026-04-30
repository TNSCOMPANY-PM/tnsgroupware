/**
 * v4-07 smoke — Phase 분할 (runPhaseA / runPhaseBPart1 / runPhaseBPart2) + sysprompt parts.
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
  console.log("[T1] pipeline 모듈 surface");
  const pipeline = await import("../lib/geo/v4/pipeline");
  check(`runPhaseA exported`, typeof pipeline.runPhaseA === "function");
  check(`runPhaseBPart1 exported`, typeof pipeline.runPhaseBPart1 === "function");
  check(`runPhaseBPart2 exported`, typeof pipeline.runPhaseBPart2 === "function");
  check(`DraftNotFoundError exported`, typeof pipeline.DraftNotFoundError === "function");
  check(`InvalidStageError exported`, typeof pipeline.InvalidStageError === "function");
  check(`generateV4 제거 (Phase 분할)`, !("generateV4" in pipeline));

  // T2 — Error class shape
  console.log("\n[T2] Error class shape");
  {
    const e = new pipeline.DraftNotFoundError("draft-123");
    check(`DraftNotFoundError code`, e.code === "DRAFT_NOT_FOUND");
    check(`DraftNotFoundError draftId`, e.draftId === "draft-123");
  }
  {
    const e = new pipeline.InvalidStageError("draft-123", "plan_done", "write_done");
    check(`InvalidStageError code`, e.code === "INVALID_STAGE");
    check(`InvalidStageError expected/actual`, e.expected === "plan_done" && e.actual === "write_done");
  }

  // T3 — sysprompt Part 1/2 빌더
  console.log("\n[T3] sysprompt Part 1/2 빌더");
  const sp = await import("../lib/geo/v4/sysprompt");
  const args = {
    brand_label: "오공김밥",
    industry: "외식",
    industry_sub: "분식",
    topic: "분식 평균 매출",
    today: "2026-04-30",
    hasDocx: true,
  };
  const part1 = sp.buildSyspromptPart1(args);
  const part2 = sp.buildSyspromptPart2(args);

  check(`Part1 — Part 1/2 헤더`, part1.includes("★ Part 1/2"));
  check(`Part1 — frontmatter 작성`, part1.includes("frontmatter"));
  check(`Part1 — [블럭 A]+[B]+[C]`, part1.includes("[블럭 A]") && part1.includes("[블럭 B]") && part1.includes("[블럭 C]"));
  check(`Part1 — [블럭 D]/[E] 다음 호출`, part1.includes("다음 호출"));
  check(`Part1 — ~2,700자 한도`, part1.includes("~2,700자"));

  check(`Part2 — Part 2/2 헤더`, part2.includes("★ Part 2/2"));
  check(`Part2 — [블럭 D]+[E]`, part2.includes("[블럭 D]") && part2.includes("[블럭 E]"));
  check(`Part2 — frontmatter 다시 X`, part2.includes("frontmatter / [A]/[B]/[C] 다시 쓰지"));
  check(`Part2 — "## 진입 전 확인할 리스크" 시작`, part2.includes("## 진입 전 확인할 리스크"));

  // ★ 절대 룰 8개 양쪽 다 포함 (voice spec)
  check(`Part1 — ★ 절대 룰`, part1.includes("★ 절대 룰"));
  check(`Part2 — ★ 절대 룰`, part2.includes("★ 절대 룰"));

  // T4 — buildPart2UserPrompt
  console.log("\n[T4] buildPart2UserPrompt");
  const userP = sp.buildPart2UserPrompt({
    topic: "test",
    ftc_row: { id: 1 },
    docx_facts: [],
    industry_facts: [],
    content_part1: "## [블럭 A] 훅\n\n본문 시작...",
  });
  check(`Part2 user — Part 1 본문 포함`, userP.includes("Part 1 본문"));
  check(`Part2 user — content_part1 인용`, userP.includes("본문 시작..."));
  check(`Part2 user — "## 진입 전 확인할 리스크" 부터 시작 안내`, userP.includes("## 진입 전 확인할 리스크"));

  // T5 — types V4PlanJson + V4PartResult
  console.log("\n[T5] types");
  const types = await import("../lib/geo/v4/types");
  check(`types module loaded`, typeof types === "object");

  console.log(`\n=== ${okAll ? "ALL PASS" : "SOME FAILED"} ===\n`);
  process.exit(okAll ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
