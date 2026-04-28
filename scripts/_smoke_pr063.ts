/**
 * PR063 — 시나리오 변수 facts pool register hotfix smoke test.
 *
 * 검증: crosscheck.buildAllowedPool 이 시나리오에서 push 한 deriveds
 * 의 value + inputs.* 를 정상 픽업하는지.
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
  console.log(`  ${ok ? "✓" : "✗"} ${label}${detail ? ` — ${detail}` : ""}`);
  if (!ok) okAll = false;
}

async function main() {
  const { numberCrossCheck } = await import("../lib/geo/gates/crosscheck");

  console.log("\n=== PR063 smoke ===\n");

  // 시나리오 등록 시뮬레이션 — facts.deriveds 에 값 푸시 후 본문 검증
  console.log("[T1] crosscheck pool — 시나리오 deriveds 캡처 검증");
  const factsBase = {
    facts: [
      {
        claim: "오공김밥 월평균매출 5,210만원",
        value: 5210,
        unit: "만원",
        source_url: "https://franchise.ftc.go.kr/",
        source_title: "공정위 정보공개서 2024 (frandoor 적재본)",
        year_month: "2024-12",
        period_month: "2024-12",
        authoritativeness: "primary" as const,
        tier: "A" as const,
        source_tier: "A" as const,
        fact_key: "docx_avg_monthly_revenue",
        derived: false,
      },
    ],
    deriveds: [
      // 시나리오 등록 시뮬: industry n=524, avg=2126, ratio=2.45, ratio_pct=245, diff=3084
      {
        key: "industry_position",
        label: "분식 프랜차이즈 수",
        value: 524,
        unit: "개",
        basis: "ftc 2024",
        formula: "ftc count",
        inputs: { industry: "분식" },
        period: "2024",
        confidence: "high",
      },
      {
        key: "industry_position",
        label: "분식 평균 월매출",
        value: 2126,
        unit: "만원",
        basis: "ftc trimmed",
        formula: "trimmed-mean",
        inputs: { n: 524 },
        period: "2024",
        confidence: "high",
      },
      {
        key: "industry_multiplier_restaurant",
        label: "오공김밥 매출 ÷ 분식 평균",
        value: 2.45,
        unit: "배",
        basis: "ratio",
        formula: "brand / industry",
        inputs: { brand_revenue: 5210, industry_avg: 2126 },
        period: "2024",
        confidence: "high",
      },
      {
        key: "industry_multiplier_restaurant",
        label: "오공김밥 매출 비율 백분율",
        value: 245,
        unit: "%",
        basis: "× 100",
        formula: "ratio × 100",
        inputs: { ratio: 2.45 },
        period: "2024",
        confidence: "high",
      },
      {
        key: "net_margin",
        label: "오공김밥 매출 - 분식 평균",
        value: 3084,
        unit: "만원",
        basis: "subtract",
        formula: "brand - industry_avg",
        inputs: { brand: 5210, industry_avg: 2126 },
        period: "2024",
        confidence: "high",
      },
    ],
    category: "분식",
  };

  // 시나리오 본문 시뮬 (LLM 출력에 등장할 수 있는 모든 산출값)
  const body = `
오공김밥은 분식 프랜차이즈 524개 평균 2,126만원의 2.45배 수준입니다.
분식 시장에서 오공김밥 매출은 평균 대비 +3084만원 차이가 있습니다.
백분율로는 245% 수준입니다.
`;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const r = numberCrossCheck(body, factsBase as any);
  check(
    `unmatched 0 (시나리오 산출값 전부 pool 매칭)`,
    r.unmatched.length === 0,
    `unmatched=${r.unmatched.length}: ${r.unmatched.slice(0, 3).join(" | ")}`,
  );
  check(`matched ≥ 5 (524 + 2126 + 2.45 + 3084 + 245)`, r.matchedCount >= 5, `matched=${r.matchedCount}`);

  // T3 — strict 임계 검증 (시뮬, 실제 D3.ts 코드와 일치 확인)
  console.log("\n[T3] D3 strict 임계 (코드 직접 확인)");
  const fs = await import("node:fs");
  const path = await import("node:path");
  const d3Source = fs.readFileSync(
    path.resolve(process.cwd(), "lib/geo/depth/D3.ts"),
    "utf8",
  );
  check(
    "D3.ts strict 임계 ≥ 35 (PR063)",
    /unmatched\.length\s*>=\s*35/.test(d3Source),
    /unmatched\.length\s*>=\s*\d+/.exec(d3Source)?.[0] ?? "?",
  );

  // T4 — ctx 윈도우 ±16
  console.log("\n[T4] crosscheck ctx 윈도우 ±16");
  const ccSource = fs.readFileSync(
    path.resolve(process.cwd(), "lib/geo/gates/crosscheck.ts"),
    "utf8",
  );
  check(
    "crosscheck ctx 윈도우 ±16 (PR063)",
    /raw\.length \+ 16/.test(ccSource),
    /raw\.length \+ \d+/.exec(ccSource)?.[0] ?? "?",
  );

  // 추가: 부정확한 본문에 대한 unmatched 검출 (regression — 너무 관대해지면 안됨)
  console.log("\n[regression] 무관한 숫자는 여전히 unmatched");
  const wrongBody = "오공김밥은 분식 999개 평균 8888만원의 9.99배 수준입니다.";
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rWrong = numberCrossCheck(wrongBody, factsBase as any);
  check(
    "잘못된 숫자 (999 / 8888 / 9.99) → unmatched ≥ 3",
    rWrong.unmatched.length >= 3,
    `unmatched=${rWrong.unmatched.length}`,
  );

  console.log(`\n=== ${okAll ? "ALL PASS" : "SOME FAILED"} ===\n`);
  process.exit(okAll ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
