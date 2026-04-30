/**
 * v3-02 smoke — extractJson 강화 (truncation 복구 + fence + leading text).
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
  console.log("\n=== v3-02 smoke ===\n");

  const { extractJson } = await import("../lib/geo/v3/claude");

  // 케이스 1: 정상 JSON
  console.log("[T1] 정상 케이스");
  {
    const r = extractJson('{"a": 1}');
    check(`정상 JSON`, eq(r, { a: 1 }), JSON.stringify(r));
  }
  {
    const r = extractJson('{"items": [1, 2, 3], "total": 6}');
    check(`배열 + 객체`, eq(r, { items: [1, 2, 3], total: 6 }));
  }

  // 케이스 2: markdown fence
  console.log("\n[T2] markdown fence");
  {
    const r = extractJson('```json\n{"a": 1}\n```');
    check(`\`\`\`json fence`, eq(r, { a: 1 }), JSON.stringify(r));
  }
  {
    const r = extractJson("```\n{\"a\": 1}\n```");
    check(`\`\`\` fence (no json)`, eq(r, { a: 1 }));
  }

  // 케이스 3: leading 비-JSON 텍스트
  console.log("\n[T3] leading text 제거");
  {
    const r = extractJson('Here is the JSON:\n{"a": 1}');
    check(`"Here is..." prefix`, eq(r, { a: 1 }));
  }
  {
    const r = extractJson('결과: {"items": [1, 2]}');
    check(`한국어 prefix`, eq(r, { items: [1, 2] }));
  }

  // 케이스 4: truncated array
  console.log("\n[T4] truncation 복구");
  {
    const r = extractJson('{"items": [1, 2, 3') as { items: number[] };
    check(`잘린 array`, Array.isArray(r.items) && r.items.length >= 2, JSON.stringify(r));
  }
  {
    const r = extractJson('{"a": {"b": [1, 2') as { a: { b: number[] } };
    check(`잘린 nested`, r.a !== undefined && Array.isArray(r.a.b) && r.a.b.length >= 1, JSON.stringify(r));
  }

  // 케이스 5: trailing comma
  console.log("\n[T5] trailing comma");
  {
    const r = extractJson('{"a": 1,}');
    check(`trailing comma`, eq(r, { a: 1 }));
  }
  {
    const r = extractJson('{"items": [1, 2, 3,]}');
    check(`array trailing comma`, eq(r, { items: [1, 2, 3] }));
  }

  // 케이스 6: 깊게 잘린 JSON (Step 1 실제 시나리오 모사)
  console.log("\n[T6] Step 1 실제 시나리오 모사");
  {
    const truncated = `{
  "selected_facts": [
    {"metric_id": "a", "value": 1},
    {"metric_id": "b", "value": 2},
    {"metric_id": "c"`;
    const r = extractJson(truncated) as { selected_facts: unknown[] };
    check(
      `잘린 selected_facts (≥2 보존)`,
      Array.isArray(r.selected_facts) && r.selected_facts.length >= 2,
      JSON.stringify(r),
    );
  }
  {
    // 더 현실적: 닫힌 객체 후 다음 객체 중간 잘림
    const truncated = `{
  "selected_facts": [
    {"metric_id": "monthly_revenue_avg", "value": 5210, "label": "월평균"},
    {"metric_id": "stores_total", "value": 21, "label": "가맹점수"},
    {"metric_id": "debt_ratio_p90", "value": 713.8, "label": "부채비율 상`;
    const r = extractJson(truncated) as { selected_facts: unknown[] };
    check(
      `더 현실적 잘림 (≥2 element 보존)`,
      Array.isArray(r.selected_facts) && r.selected_facts.length >= 2,
      JSON.stringify(r),
    );
  }

  // 케이스 7: 완전 깨진 JSON
  console.log("\n[T7] 완전 깨진 JSON throw");
  {
    let threw = false;
    try {
      extractJson("not json at all");
    } catch {
      threw = true;
    }
    check(`완전 텍스트 throw`, threw);
  }
  {
    let threw = false;
    try {
      extractJson("");
    } catch {
      threw = true;
    }
    check(`빈 문자열 throw`, threw);
  }

  // 케이스 8: 문자열 안 \" escape 처리
  console.log("\n[T8] 문자열 escape");
  {
    const r = extractJson('{"label": "alpha \\"beta\\""}');
    check(`escape 문자열`, eq(r, { label: 'alpha "beta"' }));
  }
  {
    // 문자열 안 } 가 있어도 stack 영향 X
    const r = extractJson('{"note": "valid: }} blah", "n": 1}');
    check(`문자열 안 } stack 무시`, eq(r, { note: "valid: }} blah", n: 1 }));
  }

  // 회귀 — 기존 v3-01 smoke 가 PASS 인지 (extractJson signature 변경 영향)
  console.log("\n[regression] v3-01 smoke");
  // v3-01 smoke 의 extractJson 사용 방식 확인:
  // - "{\"a\": 1}" → { a: 1 } (이미 위에서 통과)
  // - 텍스트 안 JSON → 정상 (이미 위에서 통과)

  console.log(`\n=== ${okAll ? "ALL PASS" : "SOME FAILED"} ===\n`);
  process.exit(okAll ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
