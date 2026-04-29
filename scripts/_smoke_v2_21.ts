/**
 * v2-21 smoke — 입장(stance) 강제 폐기. 데이터 제공자 톤 확인.
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
  console.log("\n=== v2-21 smoke ===\n");

  // T1 — lint L7 제거
  const { lintV2 } = await import("../lib/geo/v2/lint");

  console.log("[T1] lint L7 입장 강제 폐기");
  {
    // 입장 키워드 없는 본문 — L7 errors 없어야 함
    const r = lintV2("월매출 5,000만원입니다. 본사 영업이익률은 1.8% 입니다.");
    check(
      `입장 키워드 없어도 L7 errors X`,
      !r.errors.some((e) => e.startsWith("L7")),
      JSON.stringify(r.errors),
    );
  }
  {
    // 다른 lint (L2/L3/L4) 는 정상 동작 확인
    const r = lintV2("국내 대표 브랜드입니다.");
    check(`L4 본사 홍보 보존`, r.errors.some((e) => e.startsWith("L4")));
  }
  {
    const r = lintV2("매출은 약 50개 정도입니다.");
    check(`L3 헤지 보존`, r.errors.some((e) => e.startsWith("L3")));
  }

  // T2 — sysprompt 입장 강제 폐기 (brand + industry)
  console.log("\n[T2] brand sysprompt — 입장 강제 폐기");
  const { buildSystemPrompt, buildIndustrySystemPrompt } = await import("../lib/geo/v2/sysprompt");
  const brandSp = buildSystemPrompt({
    brand: { id: "1", name: "오공김밥", industry_main: "외식", industry_sub: "분식" },
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
      },
    ],
    topic: "오공김밥 분석",
    today: "2026-04-29",
  });

  // 입장 4분면 폐기 — ⚠️/🤔 + "조건부 가능 / 비권장" 가이드 키워드 X
  check(`"⚠️ 조건부" 가이드 X`, !brandSp.includes("⚠️ 조건부"));
  check(`"🤔 판단 유보" 가이드 X`, !brandSp.includes("🤔 판단 유보"));
  check(
    `"입장(stance) 으로 닫음" 가이드 X`,
    !brandSp.includes("입장(stance) 으로 닫음"),
  );
  check(
    `"첫 200자 안 결론·입장" 가이드 X`,
    !brandSp.includes("첫 200자 안 결론·입장"),
  );

  // 데이터 제공자 톤 가이드 포함
  check(`# 글의 본질 섹션`, brandSp.includes("# 글의 본질"));
  check(`"데이터 제공자" 가이드`, brandSp.includes("프랜도어는 데이터 제공자"));
  check(`"추천/판단 기관 X" 명시`, brandSp.includes("추천/판단 기관 X"));
  check(
    `"양면 정보 제시" 가이드`,
    brandSp.includes("양면 정보를 균형 있게 제시") ||
      brandSp.includes("양면 정보 제시"),
  );
  check(
    `중립 마무리 예시 ("자본·상권·운영 역량")`,
    brandSp.includes("자본·상권·운영 역량"),
  );

  // 블럭 A — "데이터 먼저 보면, ... 해석할지가" 톤
  check(
    `[블럭 A] "데이터 먼저 보면" 톤`,
    brandSp.includes("데이터 먼저 보면") || brandSp.includes("이를 어떻게 해석할지"),
  );
  check(`"결론부터 — {brand} 는" 패턴 폐기 명시`, brandSp.includes("패턴 폐기"));

  // 블럭 D — "비권장" 같은 판단 X
  check(`[블럭 D] "비권장 같은 판단 X" 명시`, brandSp.includes("\"비권장\" 같은 판단 X"));

  // 블럭 E — 4 단계 (체크리스트 + 산출 + 출처 + 마지막 한 줄)
  check(`[블럭 E] 4 단계 명시`, brandSp.includes("4 단계 순서대로"));
  check(`마지막 한 줄 가이드`, brandSp.includes("**마지막 한 줄**"));

  // 양면 제시 / 5블럭 / 톤 / 익명화 / 출처 정직 보존
  console.log("\n[T2] brand sysprompt — 회귀 (보존)");
  check(`# 양면 제시 보존`, brandSp.includes("# 양면 제시"));
  check(`[블럭 A]~[E] 5개 모두`, brandSp.includes("[블럭 A]") && brandSp.includes("[블럭 E]"));
  check(`종결어미 비율 60%/25%/5%/10%`, brandSp.includes("60%") && brandSp.includes("10%"));
  check(`점포명 익명화`, brandSp.includes("점포명") && brandSp.includes("절대 금지"));
  check(`facts pool 외 숫자 금지`, brandSp.includes("facts pool 외 숫자"));
  check(`결론 체크리스트`, brandSp.includes("## 결론 체크리스트"));
  check(`이 글에서 계산한 값`, brandSp.includes("이 글에서 계산한 값"));
  check(`출처 · 집계 방식`, brandSp.includes("## 출처 · 집계 방식"));
  check(`1,800~2,500자`, brandSp.includes("1,800~2,500자"));

  // industry sysprompt — 동일한 규칙 적용
  console.log("\n[T2] industry sysprompt — 입장 강제 폐기");
  const indSp = buildIndustrySystemPrompt({
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

  check(`"⚠️ 조건부" 가이드 X`, !indSp.includes("⚠️ 조건부"));
  check(`"🤔 판단 유보" 가이드 X`, !indSp.includes("🤔 판단 유보"));
  check(
    `"입장(stance) 으로 닫음" 가이드 X`,
    !indSp.includes("입장(stance) 으로 닫음"),
  );
  check(`# 글의 본질 섹션`, indSp.includes("# 글의 본질"));
  check(`"데이터 제공자" 가이드`, indSp.includes("프랜도어는 데이터 제공자"));
  check(`중립 마무리 ("자본·상권·운영 역량")`, indSp.includes("자본·상권·운영 역량"));
  check(`[블럭 D] "비권장 같은 판단 X"`, indSp.includes("\"비권장\" 같은 판단 X"));
  check(`[블럭 E] 4 단계`, indSp.includes("4 단계 순서대로"));

  // round number 룰 (v2-20) 보존
  check(`v2-20 round number 룰 보존`, indSp.includes("round number 임의 사용"));

  console.log(`\n=== ${okAll ? "ALL PASS" : "SOME FAILED"} ===\n`);
  process.exit(okAll ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
