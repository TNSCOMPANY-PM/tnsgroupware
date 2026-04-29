/**
 * v2-20 smoke — L3 헤지 regex 정밀화 + industry sysprompt round number 금지.
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
  console.log(`  ${ok ? "✓" : "✗"} ${label}${detail ? ` — ${detail.slice(0, 100)}` : ""}`);
  if (!ok) okAll = false;
}

async function main() {
  console.log("\n=== v2-20 smoke ===\n");

  // T1 — L3 헤지 regex 정밀화
  const { lintV2 } = await import("../lib/geo/v2/lint");

  console.log("[T1] L3 헤지 regex — 통과 케이스 (통상 표기)");
  const passCases = [
    { body: "p90이 약 2배입니다.", label: "약 2배" },
    { body: "본사 영업이익률 약 100% 입니다.", label: "약 100%" },
    { body: "표본은 약 30개입니다.", label: "약 30개" },
    { body: "월매출 약 5,000만원입니다.", label: "약 5,000만원 (단독)" },
  ];
  for (const c of passCases) {
    const r = lintV2(c.body + " ✅ 진입 가능");
    const hedgeErr = r.errors.find((e) => e.startsWith("L3"));
    check(`PASS: "${c.label}"`, !hedgeErr, hedgeErr ?? "");
  }

  console.log("\n[T1] L3 헤지 regex — 차단 케이스 (진짜 헤지)");
  const blockCases = [
    { body: "수익률은 약 50개 정도입니다.", label: "약 50개 정도" },
    { body: "월매출 50개 가량입니다.", label: "50개 가량" },
    { body: "대략 50건의 사례가 있습니다.", label: "대략 50" },
    { body: "수익률이 감소할 수도 있습니다.", label: "할 수도 있" },
    { body: "비용이 약 2,500만원 가량 듭니다.", label: "약 2,500만원 가량" },
    { body: "아마도 100명일 것입니다.", label: "아마도 100" },
  ];
  for (const c of blockCases) {
    const r = lintV2(c.body + " ✅ 진입 가능");
    const hedgeErr = r.errors.find((e) => e.startsWith("L3"));
    check(`BLOCK: "${c.label}"`, !!hedgeErr, hedgeErr ?? "(no L3 error)");
  }

  // T2 — industry sysprompt round number 금지
  console.log("\n[T2] industry sysprompt round number 금지 룰");
  const { buildIndustrySystemPrompt, buildSystemPrompt } = await import("../lib/geo/v2/sysprompt");
  const sp = buildIndustrySystemPrompt({
    industry: "분식",
    factsPool: [
      {
        metric_id: "x",
        metric_label: "y",
        value_num: 100,
        value_text: null,
        unit: "개",
        period: "2024-12",
        source_tier: "A",
        source_label: "공정위",
        n: 21,
      },
    ],
    topic: "분식 평균",
    today: "2026-04-29",
  });

  check(`섹션 제목 "round number 임의 사용"`, sp.includes("round number 임의 사용"));
  check(`❌ 예 "최대 10000만원을 넘길 수 있습니다"`, sp.includes("최대 10000만원을 넘길 수 있습니다"));
  check(`❌ 예 "약 1억원"`, sp.includes("약 1억원"));
  check(`❌ 예 "약 1,000개"`, sp.includes("약 1,000개"));
  check(`✅ 예 "facts 에 등록된 p90 = 50,991만원"`, sp.includes("facts 에 등록된 p90 = 50,991만원"));
  check(
    `✅ 예 "최대값은 facts 에 명시되지 않습니다"`,
    sp.includes("최대값은 facts 에 명시되지 않습니다"),
  );
  check(`상한·범위·예측 추정 금지`, sp.includes("상한") && sp.includes("범위") && sp.includes("추정"));

  // brand sysprompt 는 건드리지 않음
  console.log("\n[T2] brand sysprompt 변경 없음 (round number 룰 미포함)");
  const brandSp = buildSystemPrompt({
    brand: { id: "1", name: "오공김밥", industry_main: "외식", industry_sub: "분식" },
    factsPool: [],
    topic: "test",
    today: "2026-04-29",
  });
  check(`brand sysprompt round number 섹션 없음`, !brandSp.includes("round number 임의 사용"));

  // regression — 기존 lint 룰 보존
  console.log("\n[regression] 기존 lint 룰 보존");
  {
    const r = lintV2("데이터 부재 / 산출 불가 ✅ 진입 가능");
    check(`L2 시스템 누출 보존`, r.errors.some((e) => e.startsWith("L2")));
  }
  {
    const r = lintV2("국내 대표 브랜드입니다. ✅ 진입 가능");
    check(`L4 본사 홍보 보존`, r.errors.some((e) => e.startsWith("L4")));
  }
  {
    // v2-21: L7 입장 강제 폐기 — 입장 키워드 없어도 errors 비어야 함
    const r = lintV2("월매출 5,000만원입니다.");
    check(`L7 입장 강제 폐기 (errors 에 L7 X)`, !r.errors.some((e) => e.startsWith("L7")));
  }

  console.log(`\n=== ${okAll ? "ALL PASS" : "SOME FAILED"} ===\n`);
  process.exit(okAll ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
