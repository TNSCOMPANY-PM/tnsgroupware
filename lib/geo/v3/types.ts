/**
 * v3-01 — 4 step pipeline 공통 타입.
 */

export type Tier = "A" | "B" | "C";

export type Fact = {
  metric_id: string;
  metric_label: string;
  value_num: number | null;
  value_text: string | null;
  unit: string | null;
  period: string | null;
  source_tier: Tier;
  source_label: string | null;
  formula?: string | null;
  industry?: string | null;
  n?: number | null;
  agg_method?: string | null;
};

export type GenerateInput =
  | {
      mode: "brand";
      brandId: string;
      topic: string;
      tiers: Tier[];
    }
  | {
      mode: "industry";
      industry: string;
      topic: string;
      tiers: Tier[];
    };

/**
 * v3-08 — Step 1 (haiku) raw output. display 값은 plan_format.ts 의 post-process 가 채움.
 * haiku 가 출력 시 display/ac_diff_analysis/brand_position 은 비워둠 (재계산 위험 방지).
 */
export type FactGroupTier = {
  display: string; // post-process 결정론 — "6억 2,518만원" 같이
  raw_value: number;
  unit: string;
  period: string | null;
  source_label: string;
  n_population?: number;
};

export type FactGroupDistribution = {
  p25?: { display: string; raw: number };
  p50?: { display: string; raw: number };
  p75?: { display: string; raw: number };
  p90?: { display: string; raw: number };
  p95?: { display: string; raw: number };
  n_population: number;
  brand_position: string; // post-process 결정론 — "상위 10% 기준선 초과"
};

export type FactGroup = {
  label: string;
  A?: FactGroupTier;
  C?: FactGroupTier;
  distribution?: FactGroupDistribution;
  ac_diff_analysis?: string; // post-process 결정론 — "본사 발표가 5,614만원(8.9%) 높음"
  outlier_note?: string;
};

/** Step 1 output. */
export type PlanResult = {
  brand_label: string;
  industry: string;
  key_angle: string;
  fact_groups: Record<string, FactGroup>;
  population_info: Record<string, number>;
};

/** Step 2 output — block.metric_ids 가 fact_groups 의 key 와 매칭. */
export type OutlineResult = {
  blocks: Array<{
    h2: string;
    metric_ids: string[];
    format: "table" | "prose" | "distribution_table";
    summary_line: string;
  }>;
};

/** Step 3 output. */
export type DraftResult = {
  body: string;
};

/** Step 4 output. */
export type PolishedResult = {
  body: string;
  log: string[];
};

export type GenerateResult = {
  body: string;
  plan: PlanResult;
  outline: OutlineResult;
  polishLog: string[];
  retryCount: number;
  factsUsed: number;
  unmatched: string[];
  lintWarnings: string[];
};

/** Brand 정보 — Step 3 sysprompt 변수 주입용. */
export type BrandContext = {
  id: string;
  name: string;
  industry_main: string | null;
  industry_sub: string | null;
  isCustomer: boolean;
};

export type IndustryContext = {
  industry: string;
  sample_n: number | null;
};
