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

/** Step 1 output. */
export type PlanResult = {
  selected_facts: Array<{
    metric_id: string;
    value: number | string | null;
    source_tier: Tier;
    label: string;
    unit: string | null;
  }>;
  outliers: Array<{
    metric_id: string;
    value: number | null;
    reason: string;
  }>;
  population_n: Record<string, number>;
  key_angle: string;
};

/** Step 2 output. */
export type OutlineResult = {
  blocks: Array<{
    h2: string;
    fact_ids: string[];
    format: "table" | "prose";
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
