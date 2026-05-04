/**
 * v4-16 smoke — A only 분석 모드 (별도 3-step + sysprompt + endpoints).
 * 기존 buildAOnlyFacts (brand-based) 는 v4-17 에서 buildIndustryAnalysisFacts (industry-based) 로 대체됨.
 * 이 smoke 는 v4-16 의 핵심 인프라 (migration / sysprompt 이름 / endpoint 경로 / pipeline export) 만 검증.
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

  // T2 — LLM1 analyze A only sysprompt (v4-17 에서 industry 단위로 진화)
  console.log("\n[T2] sysprompts/llm1_analyze_a_only.ts");
  const llm1 = await import("../lib/geo/v4/sysprompts/llm1_analyze_a_only");
  const sp1 = llm1.buildLlm1AnalyzeAOnlySysprompt();
  check(`selected_metrics 명시`, sp1.includes("selected_metrics"));
  check(`key_angle 명시`, sp1.includes("key_angle"));
  check(`analysis_axes 명시`, sp1.includes("analysis_axes"));
  check(`★ valid JSON 만`, sp1.includes("valid JSON 만"));
  check(`property name double-quoted`, sp1.includes("double-quoted"));
  check(`ftc_column_catalog 포함`, sp1.includes("ftc_column_catalog") || sp1.includes("ftc_brands_2024"));

  // T5 — endpoints 존재
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
