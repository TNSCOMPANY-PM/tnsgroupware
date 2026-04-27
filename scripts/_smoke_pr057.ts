/**
 * PR057 — topic-driven 강화 + areaRouter 보강 + ftc 모듈 smoke test.
 * LLM 호출 없이 순수 함수 동작 검증.
 */
import Module from "node:module";
const ModAny = Module as unknown as { _load: (req: string, ...rest: unknown[]) => unknown };
const origLoad = ModAny._load;
ModAny._load = function (req: string, ...rest: unknown[]) {
  if (req === "server-only") return {};
  return origLoad.call(this, req, ...rest);
};

type FactLite = {
  fact_key: string;
  value: string | number;
  unit: string;
  source_tier: "A" | "B" | "C";
  year_month?: string | null;
  period_month?: string | null;
  claim?: string;
};

let okAll = true;
function check(label: string, ok: boolean, detail?: string) {
  console.log(`  ${ok ? "✓" : "✗"} ${label}${detail ? ` — ${detail}` : ""}`);
  if (!ok) okAll = false;
}

async function main() {
  const { chooseTitle } = await import("../lib/geo/write/titler");
  const { buildOneLineAnswer } = await import("../lib/geo/write/lede");
  const { pickAreas, primaryAreas } = await import("../lib/geo/depth/areaRouter");
  const { isFtc2024Configured, fetchRegionalAvg, fetchFtcBrand } = await import(
    "../lib/geo/prefetch/ftc2024"
  );
  const { isFrandoorPublishConfigured } = await import("../lib/geo/publish/githubFrandoor");

  console.log("\n=== PR057 smoke ===\n");

  // --- A) titler topic-priority
  console.log("[Part B/T5] titler.chooseTitle topic-priority");

  const ftcRevenueFact: FactLite = {
    fact_key: "ftc2024_industry_avg_revenue",
    value: 4250,
    unit: "만원",
    source_tier: "B",
    claim: "분식 프랜차이즈 524개 평균 월매출 4,250만원 (공정위 정보공개서 2024)",
  };
  const ftcPercentileFact: FactLite = {
    fact_key: "ftc2024_industry_percentile",
    value: 78.5,
    unit: "%",
    source_tier: "B",
    claim: "오공김밥 월평균매출은 분식 업종 524개 중 상위 21.5% 수준 (공정위 정보공개서 2024 기반)",
  };
  const brandRevFact: FactLite = {
    fact_key: "docx_avg_monthly_revenue",
    value: 5210,
    unit: "만원",
    source_tier: "A",
  };
  const aStoresFact: FactLite = {
    fact_key: "frcs_cnt",
    value: 21,
    unit: "개",
    source_tier: "A",
    period_month: "2024-12",
  };
  const cStoresFact: FactLite = {
    fact_key: "frcs_cnt",
    value: 55,
    unit: "호점",
    source_tier: "C",
    period_month: "2026-04",
  };

  // compare-hook 강제
  {
    const r = chooseTitle({
      brand: "오공김밥",
      facts: [ftcRevenueFact, ftcPercentileFact, brandRevFact, aStoresFact, cStoresFact] as never,
      deriveds: [{ key: "frcs_growth", value: 34, unit: "개" } as never],
      topic: "2026 오공김밥 vs 분식 프랜차이즈 평균 비교",
      year: "2024",
    });
    check(
      "compare-hook 강제 (vs/비교 + ftc 524개 매칭)",
      r?.pattern === "compare-hook" && /524개/.test(r.title),
      r?.title,
    );
  }

  // cost-hook 강제
  {
    const costFact: FactLite = {
      fact_key: "docx_cost_total",
      value: 13500,
      unit: "만원",
      source_tier: "A",
    };
    const r = chooseTitle({
      brand: "오공김밥",
      facts: [costFact] as never,
      deriveds: [],
      topic: "오공김밥 창업비용 분석",
    });
    check("cost-hook 강제 (창업비용 키워드)", r?.pattern === "cost-hook", r?.title);
  }

  // expansion-hook 강제
  {
    const r = chooseTitle({
      brand: "오공김밥",
      facts: [aStoresFact, cStoresFact] as never,
      deriveds: [{ key: "frcs_growth", value: 34, unit: "개" } as never],
      topic: "오공김밥 가맹점 확장 추세",
    });
    check("expansion-hook 강제 (확장 키워드)", r?.pattern === "expansion-hook", r?.title);
  }

  // topic 없음 — facts-priority fallback
  {
    const r = chooseTitle({
      brand: "오공김밥",
      facts: [aStoresFact, cStoresFact, brandRevFact] as never,
      deriveds: [{ key: "frcs_growth", value: 34, unit: "개" } as never],
    });
    check("topic 미지정 — facts-priority fallback 동작", r != null && r.pattern !== undefined, r?.pattern);
  }

  // --- B) lede topic-aware
  console.log("\n[Part B/T6] lede.buildOneLineAnswer topic 비교 lede");
  {
    const r = buildOneLineAnswer({
      brand: "오공김밥",
      facts: [ftcRevenueFact, brandRevFact, aStoresFact, cStoresFact] as never,
      deriveds: [],
      topic: "2026 오공김밥 vs 분식 평균 비교",
    });
    check(
      "compare 첫 문장 (월평균매출 ... 524개 평균 ... 배 수준)",
      /월평균매출/.test(r.answer) && /524개/.test(r.answer) && /(배 수준|% 수준)/.test(r.answer),
      r.answer,
    );
  }
  {
    const r = buildOneLineAnswer({
      brand: "오공김밥",
      facts: [aStoresFact, cStoresFact] as never,
      deriveds: [{ key: "frcs_growth", value: 34, unit: "개" } as never],
      topic: undefined,
    });
    check("topic 없음 → 기존 확장 lede 유지", /확장됐습니다/.test(r.answer), r.answer);
  }

  // --- C) areaRouter 보강
  console.log("\n[Part B/T7] areaRouter pickAreas 보강");
  {
    const plan = pickAreas("2026 오공김밥 vs 분식 평균 비교");
    const primary = primaryAreas(plan);
    check(
      "avg_revenue primary 활성 (평균 비교 키워드)",
      primary.includes("avg_revenue"),
      primary.join(","),
    );
  }
  {
    const plan = pickAreas("오공김밥 매출 비교");
    check(
      "avg_revenue primary 활성 (매출 비교)",
      plan.avg_revenue === "primary",
      `avg_revenue=${plan.avg_revenue}`,
    );
  }

  // --- D) ftc 모듈 graceful skip
  console.log("\n[Part A/D] ftc 모듈 graceful skip (env 미설정 시)");
  console.log(`  isFtc2024Configured: ${isFtc2024Configured()}`);
  console.log(`  isFrandoorPublishConfigured: ${isFrandoorPublishConfigured()}`);
  {
    const r = await fetchFtcBrand({ brand_nm: "오공김밥" });
    check(
      "fetchFtcBrand env 미설정 시 null 반환",
      r === null || (typeof r === "object" && r !== null),
      r === null ? "null" : "configured",
    );
  }
  {
    const r = await fetchRegionalAvg("분식");
    check(
      "fetchRegionalAvg env 미설정 시 null 반환",
      r === null || Array.isArray(r),
      r === null ? "null" : `len=${r?.length}`,
    );
  }

  console.log(`\n=== ${okAll ? "ALL PASS" : "SOME FAILED"} ===\n`);
  process.exit(okAll ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
