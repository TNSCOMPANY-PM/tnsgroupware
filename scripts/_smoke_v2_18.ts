/**
 * v2-18 smoke — industry-only 모드 sysprompt + INDUSTRIES_15 + discriminated union 검증.
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
  const { INDUSTRIES_15, isValidIndustry } = await import("../lib/geo/v2/industries");
  const { buildSystemPrompt, buildIndustrySystemPrompt } = await import(
    "../lib/geo/v2/sysprompt"
  );

  console.log("\n=== v2-18 smoke ===\n");

  // T1 INDUSTRIES_15
  console.log("[T1] INDUSTRIES_15");
  check(`15개 업종 정의`, INDUSTRIES_15.length === 15, `len=${INDUSTRIES_15.length}`);
  check(`"한식" / "분식" / "치킨" / "피자" 포함`,
    INDUSTRIES_15.includes("한식") && INDUSTRIES_15.includes("분식") &&
    INDUSTRIES_15.includes("치킨") && INDUSTRIES_15.includes("피자"));
  check(`isValidIndustry("한식") = true`, isValidIndustry("한식"));
  check(`isValidIndustry("XYZ") = false`, !isValidIndustry("XYZ"));

  // T3 buildIndustrySystemPrompt
  console.log("\n[T3] buildIndustrySystemPrompt");
  const today = "2026-04-29";
  const sp = buildIndustrySystemPrompt({
    industry: "한식",
    factsPool: [
      {
        metric_id: "monthly_avg_revenue",
        metric_label: "월평균매출",
        value_num: 5000,
        value_text: null,
        unit: "만원",
        period: "2024-12",
        source_tier: "A",
        source_label: "공정거래위원회 정보공개서 2024-12",
        industry: "한식",
        n: 1234,
        agg_method: "median",
      },
    ],
    topic: "한식 프랜차이즈 매출액 평균",
    today,
  });

  check(`"업종 단위 분석" 명시`, sp.includes("업종 단위 분석"));
  check(`industry "한식" 명시`, sp.includes("한식"));
  check(`표본 brand 수 (n=1234)`, sp.includes("1234"));
  check(`brand 명 자제 가이드`, sp.includes("brand 명 자제") || sp.includes("brand명 자제"));
  check(`industry_facts 만 가이드`, sp.includes("industry_facts"));
  check(`특정 brand 매출/본사 정보 X`, sp.includes("특정 brand"));
  check(`5블럭 [A]~[E]`, sp.includes("[블럭 A]") && sp.includes("[블럭 B]") && sp.includes("[블럭 C]") && sp.includes("[블럭 D]") && sp.includes("[블럭 E]"));
  check(`[B] 업종 개관`, sp.includes("업종 개관"));
  check(`[C] 분포 분석`, sp.includes("분포 분석"));
  check(`체크리스트 H2`, sp.includes("## 결론 체크리스트"));
  check(`출처·집계 H2`, sp.includes("## 출처 · 집계 방식"));
  check(`category: "업종 분석"`, sp.includes(`category: "업종 분석"`));
  check(`tags: ["한식", ...]`, sp.includes(`tags: ["한식"`));
  check(`slug 한식 → "korean-..."`, sp.includes(`korean-{topic-slug}`));
  check(`date "${today}"`, sp.includes(`date: "${today}"`));

  // 톤 가이드 (v2-17 일관)
  console.log("\n[T3] 톤 가이드 (v2-17 일관)");
  check(`~입니다 / ~요 / ~죠`, sp.includes("~입니다 / ~요 / ~죠"));
  check(`90%+ 친근 톤`, sp.includes("90%+"));
  check(`~다 / ~이다 거의 X`, sp.includes("~다 / ~이다") && sp.includes("거의 X"));
  check(`호명·비유 권장`, sp.includes("# 호명·비유"));

  // 슬러그 헬퍼 (15 업종 모두 매핑)
  console.log("\n[T3] slugifyIndustry 15 업종");
  for (const ind of INDUSTRIES_15) {
    const sp2 = buildIndustrySystemPrompt({
      industry: ind,
      factsPool: [],
      topic: "test",
      today,
    });
    // slug 영문 매핑이 있어야 함 (industry-{topic-slug} 형태)
    check(
      `${ind} slug 영문 매핑`,
      /[a-z]+-{topic-slug}/.test(sp2),
      ind,
    );
  }

  // brand sysprompt 무영향 (regression)
  console.log("\n[regression] brand sysprompt 무영향");
  const bsp = buildSystemPrompt({
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
    topic: "오공김밥",
    today,
  });
  check(`brand sysprompt 정상 동작 (Brand 정보 포함)`, bsp.includes("Brand 정보"));
  check(`brand sysprompt 5블럭`, bsp.includes("[블럭 A]") && bsp.includes("[블럭 E]"));

  // sysprompt 길이 (5,000자 이내)
  console.log("\n[T7] sysprompt 길이");
  console.log(`   industry sysprompt = ${sp.length} 자`);
  check(`industry sysprompt < 5,500자`, sp.length < 5500);

  console.log(`\n=== ${okAll ? "ALL PASS" : "SOME FAILED"} ===\n`);
  process.exit(okAll ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
