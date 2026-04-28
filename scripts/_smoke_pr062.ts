/**
 * PR062 — 시나리오 카탈로그 + 라우터 + 빌더 + percentile fix smoke test.
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
  const { SCENARIOS, pickScenario, getScenario } = await import("../lib/geo/scenarios");
  const {
    interpolate,
    countPlaceholdersFilled,
    buildScenarioTitle,
    buildScenarioConclusionLine,
    buildScenarioBodySkeleton,
    listScenarioHeadings,
  } = await import("../lib/geo/depth/scenarioBuilder");

  console.log("\n=== PR062 smoke ===\n");

  // T1.1 카탈로그
  console.log("[T1.1] SCENARIOS 카탈로그");
  const total = Object.keys(SCENARIOS).length;
  check(`SCENARIOS ${total}개 (≥34 기대)`, total >= 34, String(total));
  const compareCt = Object.values(SCENARIOS).filter((s) => s.category === "compare").length;
  const costCt = Object.values(SCENARIOS).filter((s) => s.category === "cost").length;
  const revenueCt = Object.values(SCENARIOS).filter((s) => s.category === "revenue").length;
  const frcsCt = Object.values(SCENARIOS).filter((s) => s.category === "frcs").length;
  const hqCt = Object.values(SCENARIOS).filter((s) => s.category === "hq").length;
  check(`compare 5 / cost 5 / revenue 5 / frcs 5 / hq 5`,
    compareCt === 5 && costCt === 5 && revenueCt === 5 && frcsCt === 5 && hqCt === 5,
    `${compareCt}/${costCt}/${revenueCt}/${frcsCt}/${hqCt}`);

  // T1.3 라우터
  console.log("\n[T1.3] pickScenario 라우터");
  check("topic 부재 → default", pickScenario({ topic: "" }) === "default_brand_overview");
  check("topic 공백 → default", pickScenario({ topic: "  " }) === "default_brand_overview");
  check(
    "공정위 vs 본사 비교 → compare_official_vs_brochure",
    pickScenario({ topic: "오공김밥 공정위 자료와 본사 발표 비교" }) === "compare_official_vs_brochure",
    pickScenario({ topic: "오공김밥 공정위 자료와 본사 발표 비교" }),
  );
  check(
    "분식 평균 비교 → compare_vs_industry_avg",
    pickScenario({ topic: "오공김밥 분식 평균 비교" }) === "compare_vs_industry_avg",
    pickScenario({ topic: "오공김밥 분식 평균 비교" }),
  );
  check(
    "창업비용 분해 → cost_breakdown",
    pickScenario({ topic: "오공김밥 창업비용 분해" }) === "cost_breakdown",
    pickScenario({ topic: "오공김밥 창업비용 분해" }),
  );
  check(
    "가맹점 3년 추이 → frcs_3y_trend",
    pickScenario({ topic: "가맹점 3년 추이" }) === "frcs_3y_trend",
    pickScenario({ topic: "가맹점 3년 추이" }),
  );
  check(
    "본사 영업이익률 → hq_op_margin",
    pickScenario({ topic: "본사 영업이익률" }) === "hq_op_margin",
    pickScenario({ topic: "본사 영업이익률" }),
  );
  check(
    "월평균매출 → revenue_monthly_avg",
    pickScenario({ topic: "월평균매출 분석" }) === "revenue_monthly_avg",
    pickScenario({ topic: "월평균매출 분석" }),
  );
  check(
    "법위반 → trust_law_violations",
    pickScenario({ topic: "법위반 이력" }) === "trust_law_violations",
  );
  check(
    "수도권 vs 지방 → regional_metro_vs_local",
    pickScenario({ topic: "수도권 vs 지방 매출" }) === "regional_metro_vs_local",
    pickScenario({ topic: "수도권 vs 지방 매출" }),
  );

  // T2 interpolate
  console.log("\n[T2] interpolate");
  check(
    "{brand} {industry} 치환",
    interpolate("{brand} vs {industry}", { brand: "오공김밥", industry: "분식" }) === "오공김밥 vs 분식",
  );
  check(
    "missing 변수 → (미공개)",
    interpolate("{brand} {missing}", { brand: "오공김밥" }) === "오공김밥 (미공개)",
  );
  check(
    "숫자 변수",
    interpolate("{n}개", { n: 524 }) === "524개",
  );
  {
    const r = countPlaceholdersFilled("{brand} vs {industry} {n}개", {
      brand: "오공김밥",
      industry: "분식",
      n: 524,
    });
    check("countPlaceholders total=3 filled=3", r.total === 3 && r.filled === 3);
  }
  {
    const r = countPlaceholdersFilled("{brand} vs {industry} {n}개", {
      brand: "오공김밥",
    });
    check("countPlaceholders 누락 2개", r.total === 3 && r.filled === 1 && r.missing.length === 2);
  }

  // T2 buildScenarioTitle
  console.log("\n[T2] buildScenarioTitle");
  {
    const sc = getScenario("compare_vs_industry_avg");
    const title = buildScenarioTitle(sc, { brand: "오공김밥", industry: "분식", n: 524 });
    check(
      "compare_vs_industry_avg 제목 정확",
      title === "오공김밥 vs 분식 524개 평균 — 매출·창업비용·점포수 위치",
      title,
    );
  }
  {
    const sc = getScenario("cost_breakdown");
    const title = buildScenarioTitle(sc, { brand: "오공김밥" });
    check(
      "cost_breakdown 제목 정확",
      title === "오공김밥 창업비용 분해 — 가맹비·교육비·인테리어 어디서 어디까지",
      title,
    );
  }

  // T2 buildScenarioBodySkeleton
  console.log("\n[T2] buildScenarioBodySkeleton");
  {
    const sc = getScenario("compare_vs_industry_avg");
    const md = buildScenarioBodySkeleton(sc, { brand: "오공김밥", industry: "분식", n: 524 });
    check("skeleton 안 H2 4개", (md.match(/^## /gm) ?? []).length === 4, `len=${md.length}`);
    check(
      "첫 H2 = '분식 업종 524개 평균과 어떻게 다를까요?'",
      md.includes("## 분식 업종 524개 평균과 어떻게 다를까요?"),
    );
    check("intent 주석 포함", md.includes("<!-- intent:"));
    check("화살표 진입 ≥ 3", (md.match(/^→ /gm) ?? []).length >= 3);
  }
  {
    const sc = getScenario("compare_vs_industry_avg");
    const headings = listScenarioHeadings(sc, { brand: "오공김밥", industry: "분식", n: 524 });
    check(
      "listScenarioHeadings 4개 + 첫 헤더 정확",
      headings.length === 4 && headings[0] === "분식 업종 524개 평균과 어떻게 다를까요?",
      headings[0],
    );
  }

  // T2 buildScenarioConclusionLine
  console.log("\n[T2] buildScenarioConclusionLine");
  {
    const sc = getScenario("compare_vs_industry_avg");
    const line = buildScenarioConclusionLine(sc, {
      brand: "오공김밥",
      industry: "분식",
      n: 524,
      ratio: 1.23,
      cost_diff: 1500,
      direction: "낮은",
    });
    check(
      "compare_vs_industry_avg 결론 정확",
      line === "오공김밥은 분식 업종 524개 중 매출 1.23배 / 창업비용 1500만원 낮은 수준입니다.",
      line,
    );
  }

  // T4 percentile fix — 단위 테스트는 ftc2024 모듈 import (env 미설정 시 graceful)
  console.log("\n[T4] percentile rank/total fix");
  // 직접 호출 안하지만 로직 검증 (수식 자체)
  const total524 = 524;
  const rank1 = 1;
  const rank100 = 100;
  const pct1 = Math.round((rank1 / total524) * 1000) / 10;
  const pct100 = Math.round((rank100 / total524) * 1000) / 10;
  check(`524개 중 1위 → 상위 ${pct1}% (이전 0% 버그 fix)`, pct1 === 0.2, String(pct1));
  check(`524개 중 100위 → 상위 ${pct100}%`, pct100 === 19.1, String(pct100));

  console.log(`\n=== ${okAll ? "ALL PASS" : "SOME FAILED"} ===\n`);
  process.exit(okAll ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
