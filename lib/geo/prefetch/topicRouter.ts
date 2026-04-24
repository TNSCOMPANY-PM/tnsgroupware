import "server-only";
import { fetchKosisIndustryAvg, fetchKosisIndustryRevenue } from "@/utils/kosis";
import { searchHygieneByBizName } from "@/utils/foodSafety";

/** 주제 키워드 → B급 API 호출 매핑. 620개 브랜드·15개 외식 업종 전반 범용.
 *
 * PR041: 공정위 OpenAPI B급 경로 롤백.
 * closure_rate · industry_revenue 의 공정위 호출부 제거.
 * 5/4 공정위 정보공개청구 엑셀 수령 후 A급 frandoor_ftc_facts 기반 업종 집계로 대체 예정 (PR042+).
 */
export type TopicFact = {
  claim: string;
  value: number | string;
  unit: string | null;
  source_tier: "B";
  tier: "B";
  source_url: string;
  source_title: string;
  year_month: string;
  period_month?: string;
  authoritativeness: "primary" | "secondary";
  fact_key: string;
  coverage?: string;
};

export type TopicRoute = {
  id: string;
  keyword: RegExp;
  fetcher: (args: { industry: string; brand: string; topic: string }) => Promise<TopicFact[]>;
};

const FOODSAFETY_LABEL = "식약처 식품안전나라 I0490";

export const TOPIC_ROUTES: TopicRoute[] = [
  {
    id: "closure_rate",
    keyword: /폐점률|폐업률|폐점\s*(률|율)|종료율|계약\s*종료/u,
    fetcher: async ({ industry }) => {
      // PR041 롤백: 공정위 B급 호출 제거. KOSIS 에 업종별 폐점률 직접 데이터 없음 → 현재 빈 배열.
      // 5/4 이후 A급 frandoor_ftc_facts 집계로 대체 예정.
      // 외식업 전체 추세 참고만 필요한 경우 KOSIS 서비스업생산지수 YoY 를 선택적으로 노출.
      const kosis = await fetchKosisIndustryAvg(industry);
      if (!kosis?.growth_rate_yoy) return [];
      return [
        {
          claim: `${kosis.industry_name} 서비스업생산지수 YoY ${kosis.growth_rate_yoy}% (KOSIS ${kosis.source_period}, 외식업 전체)`,
          value: kosis.growth_rate_yoy,
          unit: "%",
          source_tier: "B",
          tier: "B",
          source_url: "https://kosis.kr/",
          source_title: `KOSIS ${kosis.industry_name} 서비스업생산지수 ${kosis.source_period}`,
          year_month: kosis.source_period,
          period_month: kosis.source_period,
          authoritativeness: "secondary",
          fact_key: "industry_service_index_yoy",
          coverage: "외식업 전체 (자영업 + 프랜차이즈 통합)",
        },
      ];
    },
  },
  {
    id: "industry_revenue",
    keyword: /업종\s*평균\s*매출|업종\s*매출|평균\s*매출액|업계\s*매출/u,
    fetcher: async ({ industry }) => {
      // PR041 롤백: 공정위 B급 호출 제거. KOSIS 외식업 전체 (자영업 포함) 로만 응답.
      const kosis = await fetchKosisIndustryRevenue({ industryKor: industry });
      if (!kosis) return [];
      return [
        {
          claim: `${industry} 외식업 전체 서비스업생산지수 ${kosis.value} (KOSIS ${kosis.year}, 자영업 포함)`,
          value: kosis.value,
          unit: null,
          source_tier: "B",
          tier: "B",
          source_url: "https://kosis.kr/",
          source_title: `KOSIS 서비스업생산지수 ${kosis.year}`,
          year_month: kosis.year,
          period_month: kosis.year,
          authoritativeness: "secondary",
          fact_key: "industry_service_index_monthly",
          coverage: kosis.coverage,
        },
      ];
    },
  },
  {
    id: "hygiene",
    keyword: /위생|식품\s*안전|HACCP|식약처/u,
    fetcher: async ({ brand }) => {
      const data = await searchHygieneByBizName(brand, 10).catch(() => null);
      if (!data?.rows?.length) return [];
      return [
        {
          claim: `${brand} 식약처 식품안전정보 등록 ${data.total}건 (${FOODSAFETY_LABEL})`,
          value: data.total,
          unit: "건",
          source_tier: "B",
          tier: "B",
          source_url: "https://www.foodsafetykorea.go.kr/",
          source_title: `식약처 식품안전정보 (I0490)`,
          year_month: new Date().toISOString().slice(0, 7),
          period_month: new Date().toISOString().slice(0, 7),
          authoritativeness: "primary",
          fact_key: "brand_hygiene_records",
          coverage: "브랜드 단위",
        },
      ];
    },
  },
  {
    id: "opening_rate",
    keyword: /창업률|창업\s*추세|창업\s*동향|신규\s*개업/u,
    fetcher: async () => [],
  },
  {
    id: "trade_area",
    keyword: /유동인구|상권|입지\s*분석|상권\s*분석/u,
    fetcher: async () => [],
  },
];

export type TopicRouteResult = {
  matched_routes: string[];
  facts: TopicFact[];
  /** 매칭된 라우트 중 facts 를 반환한 라우트. fallback 판단용. */
  filled_routes: string[];
};

export async function routeTopicToFacts(
  topic: string,
  ctx: { industry: string; brand: string },
  log?: (s: string) => void,
): Promise<TopicRouteResult> {
  const result: TopicRouteResult = { matched_routes: [], facts: [], filled_routes: [] };
  if (!topic || topic.trim().length === 0) return result;
  log?.(`[topic] "${topic}"`);
  const matched = TOPIC_ROUTES.filter((r) => r.keyword.test(topic));
  log?.(`[topic] matched routes: ${matched.map((r) => `${r.id}(${r.keyword.source})`).join(", ") || "(none)"}`);
  for (const route of matched) {
    result.matched_routes.push(route.id);
    log?.(`[topic] fetching ${route.id} ...`);
    try {
      const facts = await route.fetcher({ ...ctx, topic });
      log?.(`[topic]   → ${facts.length} facts (values: ${facts.map((f) => String(f.value)).join(", ") || "(empty)"})`);
      if (facts.length > 0) {
        const coverages = facts.map((f) => f.coverage ?? "-");
        log?.(`[topic]   → coverage: ${coverages.join(" | ")}`);
        result.facts.push(...facts);
        result.filled_routes.push(route.id);
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.warn(`[topic-route:${route.id}] 실패:`, msg);
      log?.(`[topic]   → error: ${msg}`);
    }
  }
  return result;
}
