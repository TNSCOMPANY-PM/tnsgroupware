import "server-only";
import { fetchKosisIndustryAvg } from "@/utils/kosis";

/** 주제 키워드 → B급 API 호출 매핑. 620개 브랜드·15개 외식 업종 전반 범용. */
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
};

export type TopicRoute = {
  id: string;
  keyword: RegExp;
  fetcher: (args: { industry: string; brand: string }) => Promise<TopicFact[]>;
};

export const TOPIC_ROUTES: TopicRoute[] = [
  {
    id: "closure_rate",
    keyword: /폐점률|폐업률|종료율|계약\s*종료/u,
    fetcher: async ({ industry }) => {
      // KOSIS OpenAPI 에 "외식업 폐점률" 전용 통계표는 미매핑.
      // 대신 업종 동향(서비스업생산지수 YoY)을 보조 레퍼런스로 제공. 확실하지 않으면 빈 배열.
      const kosis = await fetchKosisIndustryAvg(industry);
      if (!kosis?.growth_rate_yoy) return [];
      return [{
        claim: `${kosis.industry_name} 서비스업생산지수 YoY ${kosis.growth_rate_yoy}% (KOSIS ${kosis.source_period})`,
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
      }];
    },
  },
  {
    id: "opening_rate",
    keyword: /창업률|창업\s*추세|창업\s*동향|신규\s*개업/u,
    fetcher: async () => [],
  },
  {
    id: "industry_revenue",
    keyword: /업종\s*평균\s*매출|업종\s*매출|업계\s*매출/u,
    fetcher: async () => [],
  },
  {
    id: "trade_area",
    keyword: /유동인구|상권|입지\s*분석|상권\s*분석/u,
    fetcher: async () => [],
  },
  {
    id: "hygiene",
    keyword: /위생|식품\s*안전|HACCP/u,
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
): Promise<TopicRouteResult> {
  const result: TopicRouteResult = { matched_routes: [], facts: [], filled_routes: [] };
  if (!topic || topic.trim().length === 0) return result;
  for (const route of TOPIC_ROUTES) {
    if (!route.keyword.test(topic)) continue;
    result.matched_routes.push(route.id);
    try {
      const facts = await route.fetcher(ctx);
      if (facts.length > 0) {
        result.facts.push(...facts);
        result.filled_routes.push(route.id);
      }
    } catch (e) {
      console.warn(`[topic-route:${route.id}] 실패:`, e instanceof Error ? e.message : e);
    }
  }
  return result;
}
