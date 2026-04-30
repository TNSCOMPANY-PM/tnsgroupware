/**
 * v4-06 smoke — post_process 소수점 변환 + lint L11 mixed.
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
  console.log("\n=== v4-06 smoke ===\n");

  // T1 — post_process 억 단위 변환 + 소수점
  console.log("[T1] post_process 억단위 변환 + 소수점");
  const { postProcess } = await import("../lib/geo/v4/post_process");

  {
    const r = postProcess("월매출 5,210만원입니다.");
    check(`5,210만원 → 그대로 (10000 미만)`, r.body.includes("5,210만원"));
  }
  {
    const r = postProcess("연매출 62,517만원");
    check(`62,517만원 → 6억 2,517만원`, r.body.includes("6억 2,517만원"), r.body);
  }
  {
    const r = postProcess("연매출 50,000만원");
    check(`50,000만원 → 5억원`, r.body.includes("5억원"), r.body);
  }
  {
    const r = postProcess("연매출 62,517.8만원");
    check(`62,517.8만원 → 6억 2,517만 8,000원`, r.body.includes("6억 2,517만 8,000원"), r.body);
  }
  {
    const r = postProcess("연매출 62,517.85만원");
    check(`62,517.85만원 → 6억 2,517만 8,500원`, r.body.includes("6억 2,517만 8,500원"), r.body);
  }
  {
    // 만 부분 0 + 소수점 → "X억 Y원"
    const r = postProcess("연매출 50000.5만원");
    check(`50000.5만원 → 5억 5,000원`, r.body.includes("5억 5,000원"), r.body);
  }

  // T2 — max_tokens 2200 (pipeline.ts 검증)
  console.log("\n[T2] pipeline max_tokens 2200");
  const fs = await import("node:fs/promises");
  const pipelineSrc = await fs.readFile("lib/geo/v4/pipeline.ts", "utf-8");
  check(`maxTokens: 2200`, pipelineSrc.includes("maxTokens: 2200"));
  check(`v4-06 주석 명시`, pipelineSrc.includes("v4-06"));

  // T3 — lint L11 mixed detector
  console.log("\n[T3] lint L11 자릿수 mixed");
  const { lintV4 } = await import("../lib/geo/v4/lint");

  {
    // 정상 — 일관 표기
    const r = lintV4("연매출 6억 2,517만 8,000원입니다. 월환산 5,210만원.");
    check(`일관 표기 → L11 warning X`, !r.warnings.some((w) => w.startsWith("L11")));
  }
  {
    // mixed — 잘못된 "X만 Y원" + 정상 "Z억 X만 Y원" 혼재
    const r = lintV4(
      "연매출은 **6,251만 7,800원**(월환산 5,210만원)입니다. 정확히는 6억 2,517만 8,000원입니다.",
    );
    check(`mixed 표기 → L11 warning`, r.warnings.some((w) => w.startsWith("L11")), r.warnings.join(" | "));
  }
  {
    // 정상 — "X만 Y원" 만 있음 (작은 금액)
    const r = lintV4("정확값은 1,234만 5,678원입니다.");
    check(`소금액 단독 → L11 warning X`, !r.warnings.some((w) => w.startsWith("L11")));
  }

  console.log(`\n=== ${okAll ? "ALL PASS" : "SOME FAILED"} ===\n`);
  process.exit(okAll ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
