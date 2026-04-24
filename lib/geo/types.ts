export type Depth = "D0" | "D1" | "D2" | "D3";
export type TierRank = "A" | "B" | "C" | "D";

export type GeoInput =
  | { depth: "D0"; topic: string }
  | { depth: "D1"; topic: string }
  | { depth: "D2"; industry: string; topic?: string }
  | { depth: "D3"; brandId: string; brand: string; topic?: string };

export type Fact = {
  claim: string;
  value: string | number;
  unit?: string | null;
  source_url: string;
  source_title: string;
  year_month: string;
  authoritativeness: "primary" | "secondary";
  tier?: TierRank;
  fact_key?: string;
  source_tier?: "A" | "B" | "C";
  period_month?: string;
};

export type DerivedMetric = {
  key:
    | "real_invest"
    | "payback"
    | "net_margin"
    | "industry_position"
    | "real_closure_rate"
    | "expansion_ratio"
    | "transfer_ratio"
    | "net_expansion"
    | "frcs_growth"
    | "frcs_multiplier"
    | "annualized_pos_sales"
    | "avg_sales_dilution"
    | "industry_multiplier_restaurant";
  label: string;
  value: number;
  unit: "만원" | "개월" | "%" | "배" | "개";
  basis: string;
  formula: string;
  inputs: Record<string, number | string>;
  period: string;
  confidence: "high" | "medium" | "low";
};

export type FaqItem = { q: string; a: string };

export type IndustrySection = {
  heading: string;
  body: string;
};

export type FranchiseSection = {
  heading: string;
  body: string;
};

export type Closure = {
  headline: string;
  bodyHtml: string;
  metrics: DerivedMetric[];
};

export type Row = Record<string, string | number>;

export type LintResult = {
  ok: boolean;
  errors: Array<{ code: string; level: "ERROR" | "WARN"; msg: string; where?: string }>;
  warns: Array<{ code: string; level: "ERROR" | "WARN"; msg: string; where?: string }>;
};

export type CrossCheckResult = {
  ok: boolean;
  unmatched: string[];
  matchedCount: number;
};

export type GeoPayloadMarkdown = {
  kind: "markdown";
  frontmatter: Record<string, unknown>;
  body: string;
};

export type GeoPayloadIndustry = {
  kind: "industryDoc";
  sections: IndustrySection[];
  comparisonTable: Row[];
};

export type GeoPayloadFranchise = {
  kind: "franchiseDoc";
  sections: FranchiseSection[];
  closure: Closure;
  faq25: FaqItem[];
  meta?: {
    title?: string;
    description?: string;
    brand?: string;
    brandId?: string;
    period?: string;
    tags?: string[];
  };
};

export type GeoPayload = GeoPayloadMarkdown | GeoPayloadIndustry | GeoPayloadFranchise;

export type GeoOutput = {
  depth: Depth;
  canonicalUrl: string;
  payload: GeoPayload;
  jsonLd: Record<string, unknown>[];
  tiers: { A: Fact[]; B: Fact[]; C: Fact[]; D: DerivedMetric[] };
  lint: LintResult;
  crosscheck: CrossCheckResult;
  logs: string[];
};

export class NotImplementedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "NotImplementedError";
  }
}

export class InsufficientDataError extends Error {
  code = "INSUFFICIENT_DATA";
  stats: { total: number; a: number; c: number };
  constructor(message: string, stats: { total: number; a: number; c: number }) {
    super(message);
    this.name = "InsufficientDataError";
    this.stats = stats;
  }
}
