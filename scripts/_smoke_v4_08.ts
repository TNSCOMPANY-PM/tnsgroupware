/**
 * v4-08 smoke — extractJson 강화 (truncation 복구) + LLM2 sysprompt 절대 룰.
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

function eq(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

async function main() {
  console.log("\n=== v4-08 smoke ===\n");

  // T1 — extractJson 강화
  console.log("[T1] extractJson 강화");
  const { extractJson } = await import("../lib/geo/v4/claude");

  // 정상
  {
    const r = extractJson('{"a": 1}');
    check(`정상 JSON`, eq(r, { a: 1 }));
  }
  // markdown fence
  {
    const r = extractJson('```json\n{"a": 1}\n```');
    check(`markdown fence 제거`, eq(r, { a: 1 }));
  }
  // leading text
  {
    const r = extractJson('결과:\n{"items": [1, 2]}');
    check(`leading text 제거`, eq(r, { items: [1, 2] }));
  }
  // truncated array
  {
    const r = extractJson('{"items": [1, 2, 3') as { items: number[] };
    check(`잘린 array 복구`, Array.isArray(r.items) && r.items.length >= 2, JSON.stringify(r));
  }
  // truncated nested
  {
    const r = extractJson('{"a": {"b": [1, 2') as { a: { b: number[] } };
    check(`잘린 nested 복구`, r.a !== undefined && Array.isArray(r.a.b), JSON.stringify(r));
  }
  // trailing comma
  {
    const r = extractJson('{"a": 1, }');
    check(`trailing comma`, eq(r, { a: 1 }));
  }
  // 깊게 잘린 (LLM2 시나리오 모사)
  {
    const truncated = `{
  "fact_groups": {
    "rev": { "label": "매출", "C": { "raw_value": 5210 } },
    "cost": { "label": "창업비용`;
    const r = extractJson(truncated) as { fact_groups: Record<string, unknown> };
    check(
      `LLM2 c_facts 잘림 복구`,
      typeof r.fact_groups === "object" && Object.keys(r.fact_groups).length >= 1,
      JSON.stringify(r).slice(0, 100),
    );
  }
  // 완전 깨짐 throw
  {
    let threw = false;
    try {
      extractJson("not json at all");
    } catch {
      threw = true;
    }
    check(`완전 깨짐 throw`, threw);
  }
  // balanced 뒤 trailing junk
  {
    const r = extractJson('{"a": 1} 입니다.');
    check(`trailing junk trim`, eq(r, { a: 1 }));
  }
  // 문자열 안 } 무시
  {
    const r = extractJson('{"note": "valid: }} blah", "n": 1}');
    check(`문자열 안 } stack 무시`, eq(r, { note: "valid: }} blah", n: 1 }));
  }

  // T2 — LLM2 sysprompt ★ 절대 룰
  console.log("\n[T2] LLM2 sysprompt ★ 절대 룰");
  const { buildLlm2Sysprompt } = await import("../lib/geo/v4/sysprompts/llm2_facts_c");
  const sp = buildLlm2Sysprompt();
  check(`★ 절대 룰 헤더`, sp.includes("★ 절대 룰"));
  check(`valid JSON 만`, sp.includes("valid JSON 만"));
  check(`fact_groups 매칭만`, sp.includes("매칭되는 docx_fact 만"));
  check(`property name double-quoted`, sp.includes("double-quoted"));
  check(`trailing comma 금지`, sp.includes("trailing comma"));
  check(`최대 30개 제한`, sp.includes("최대 30개"));

  // T3 — v4-09 에서 LLM2 폐기됨 → buildLlm2Sysprompt 는 import 안 됨 (legacy 만 보존)
  console.log("\n[T3] pipeline LLM2 폐기 (v4-09 supersede)");
  const fs = await import("node:fs/promises");
  const pipelineSrc = await fs.readFile("lib/geo/v4/pipeline.ts", "utf-8");
  check(`buildLlm2Sysprompt import 제거`, !pipelineSrc.includes("buildLlm2Sysprompt"));
  check(`matchAndDiff import (v4-09)`, pipelineSrc.includes("matchAndDiff"));

  console.log(`\n=== ${okAll ? "ALL PASS" : "SOME FAILED"} ===\n`);
  process.exit(okAll ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
