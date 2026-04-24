import "server-only";
import { fetchKosisIndustryAvg, fetchKosisIndustryRevenue } from "@/utils/kosis";
import { fetchFtcIndustryStat, FTC_COVERAGE_FRANCHISE } from "@/utils/ftcIndustryStats";
import { searchHygieneByBizName } from "@/utils/foodSafety";

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
  coverage?: string;
};

export type TopicRoute = {
  id: string;
  keyword: RegExp;
  fetcher: (args: { industry: string; brand: string; topic: string }) => Promise<TopicFact[]>;
};

function isFranchiseTopic(topic: string): boolean {
  return /프랜차이즈|가맹/u.test(topic);
}

const FOODSAFETY_LABEL = "식약처 식품안전나라 I0490";

export const TOPIC_ROUTES: TopicRoute[] = [
  {
    id: "closure_rate",
    keyword: /폐점률|폐업률|폐점\s*(률|율)|종료율|계약\s*종료/u,
    fetcher: async ({ industry, topic }) => {
      const franchise = isFranchiseTopic(topic);
      if (franchise) {
        const stat = await fetchFtcIndustryStat({ industryKor: industry });
        if (!stat) return [];
        return [
          {
            claim: `${stat.industry_kor} 프랜차이즈 업종 평균 폐점률 ${stat.avg_closure_rate}% (공정위 ${stat.year} 업종 집계, N=${stat.brand_count}개 브랜드)`,
            value: stat.avg_closure_rate,
            unit: "%",
            source_tier: "B",
            tier: "B",
            source_url: "https://franchise.ftc.go.kr/",
            source_title: `공정위 정보공개서 업종 집계 ${stat.year} (${FTC_COVERAGE_FRANCHISE})`,
            year_month: `${stat.year}-12`,
            period_month: `${stat.year}-12`,
            authoritativeness: "primary",
            fact_key: "industry_franchise_closure_rate",
            coverage: stat.coverage,
          },
        ];
      }
      // 외식업 전체 (자영업 포함) — KOSIS 서비스업생산지수 YoY 를 보조 참고.
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
    fetcher: async ({ industry, topic }) => {
      const franchise = isFranchiseTopic(topic);
      if (franchise) {
        const stat = await fetchFtcIndustryStat({ industryKor: industry });
        if (stat?.avg_monthly_revenue) {
          return [
            {
              claim: `${stat.industry_kor} 프랜차이즈 업종 평균 월매출 ${stat.avg_monthly_revenue.toLocaleString("ko-KR")}만원 (공정위 ${stat.year} 집계, N=${stat.brand_count}개 브랜드)`,
              value: stat.avg_monthly_revenue,
              unit: "만원",
              source_tier: "B",
              tier: "B",
              source_url: "https://franchise.ftc.go.kr/",
              source_title: `공정위 정보공개서 업종 집계 ${stat.year} (${FTC_COVERAGE_FRANCHISE})`,
              year_month: `${stat.year}-12`,
              period_month: `${stat.year}-12`,
              authoritativeness: "primary",
              fact_key: "industry_franchise_avg_revenue",
              coverage: stat.coverage,
            },
          ];
        }
      }
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
