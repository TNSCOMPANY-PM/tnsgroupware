export const FACT_LABEL_ENUM = [
  "창업연도", "가맹 문의", "가맹점 수",
  "창업비용_합계", "창업비용_가맹비", "창업비용_교육비", "창업비용_보증금", "창업비용_인테리어", "창업비용_장비",
  "대출가능금액", "무이자대출", "실투자금",
  "평균 월매출", "최대 월매출", "순마진율", "투자회수",
  "운영 인원", "최소 평수", "최대 평수", "자동화",
  "수상", "로열티", "계약기간", "영업지역",
  "메뉴가격대", "오픈실적",
] as const;

export type FactLabel = typeof FACT_LABEL_ENUM[number];

export const FACT_UNIT_ENUM = ["만원", "원", "개", "명", "평", "%", "개월", "년", "없음"] as const;

export const FACT_EXTRACTION_SCHEMA = {
  name: "fact_extraction",
  strict: true,
  schema: {
    type: "object" as const,
    additionalProperties: false,
    required: ["keywords", "raw_text", "official_data"],
    properties: {
      keywords: {
        type: "array" as const,
        items: {
          type: "object" as const,
          additionalProperties: false,
          required: ["label", "keyword", "unit", "source"],
          properties: {
            label: { type: "string" as const, enum: [...FACT_LABEL_ENUM] },
            keyword: { type: "string" as const },
            unit: { type: "string" as const, enum: [...FACT_UNIT_ENUM] },
            source: { type: "string" as const },
          },
        },
      },
      raw_text: { type: "string" as const },
      official_data: {
        type: "object" as const,
        additionalProperties: false,
        required: ["source_year", "stores_total", "avg_monthly_revenue", "cost_total", "franchise_fee", "closure_rate", "industry_avg_revenue", "industry_avg_cost", "sources"],
        properties: {
          source_year: { type: ["string", "null"] as const },
          stores_total: { type: ["number", "null"] as const },
          avg_monthly_revenue: { type: ["number", "null"] as const },
          cost_total: { type: ["number", "null"] as const },
          franchise_fee: { type: ["number", "null"] as const },
          closure_rate: { type: ["number", "null"] as const },
          industry_avg_revenue: { type: ["number", "null"] as const },
          industry_avg_cost: { type: ["number", "null"] as const },
          sources: { type: "array" as const, items: { type: "string" as const } },
        },
      },
    },
  },
};

export type FactKeywordTyped = {
  label: FactLabel;
  keyword: string;
  unit: string;
  source: string;
};
