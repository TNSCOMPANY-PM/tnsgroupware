import { z } from "zod";

export const DepthSchema = z.enum(["D0", "D1", "D2", "D3"]);
export const TierRankSchema = z.enum(["A", "B", "C", "D"]);

export const GeoInputSchema = z.discriminatedUnion("depth", [
  z.object({ depth: z.literal("D0"), topic: z.string().min(2), tiers: z.array(z.enum(["A", "B", "C"])).optional(), brandId: z.string().nullable().optional() }),
  z.object({ depth: z.literal("D1"), topic: z.string().min(2), tiers: z.array(z.enum(["A", "B", "C"])).optional(), brandId: z.string().nullable().optional() }),
  z.object({ depth: z.literal("D2"), industry: z.string().min(1), topic: z.string().optional(), tiers: z.array(z.enum(["A", "B", "C"])).optional(), brandId: z.string().nullable().optional() }),
  z.object({ depth: z.literal("D3"), brandId: z.string().min(1), brand: z.string().min(1), tiers: z.array(z.enum(["A", "B", "C"])).optional() }),
]);

export const FactSchema = z.object({
  claim: z.string().min(1),
  value: z.union([z.string(), z.number()]),
  unit: z.string().nullable().optional(),
  source_url: z.string().url(),
  source_title: z.string().min(3),
  year_month: z.string().regex(/^\d{4}-\d{2}$/),
  authoritativeness: z.enum(["primary", "secondary"]),
  tier: TierRankSchema.optional(),
  fact_key: z.string().optional(),
  source_tier: z.enum(["A", "B", "C"]).optional(),
  period_month: z.string().optional(),
});

export const DerivedMetricSchema = z.object({
  key: z.enum([
    "real_invest",
    "payback",
    "net_margin",
    "industry_position",
    "real_closure_rate",
    "expansion_ratio",
    "transfer_ratio",
    "net_expansion",
    "frcs_growth",
    "frcs_multiplier",
    "annualized_pos_sales",
    "avg_sales_dilution",
    "industry_multiplier_restaurant",
  ]),
  label: z.string().min(1),
  value: z.number().finite(),
  unit: z.enum(["만원", "개월", "%", "배", "개"]),
  basis: z.string().min(1),
  formula: z.string().min(1),
  inputs: z.record(z.string(), z.union([z.number(), z.string()])),
  period: z.string().min(1),
  confidence: z.enum(["high", "medium", "low"]),
});

export const GptFactsSchema = z.object({
  brand: z.string().min(1).nullable().optional(),
  industry: z.string().nullable().optional(),
  topic: z.string().nullable().optional(),
  category: z.string().nullable().optional(),
  facts: z.array(FactSchema).min(1),
  deriveds: z.array(DerivedMetricSchema).optional(),
  collected_at: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  measurement_floor: z.boolean().default(false),
  conflicts: z.array(z.object({ field: z.string(), reason: z.string() })).default([]),
}).transform((v) => ({
  ...v,
  brand: v.brand ?? undefined,
  industry: v.industry ?? undefined,
  topic: v.topic ?? undefined,
  category: v.category ?? undefined,
}));

export type GptFacts = z.infer<typeof GptFactsSchema>;

export const FaqItemSchema = z.object({ q: z.string().min(3), a: z.string().min(3) });

export const MarkdownPayloadSchema = z.object({
  kind: z.literal("markdown"),
  frontmatter: z.record(z.string(), z.unknown()),
  body: z.string().min(50),
});

export const IndustryDocPayloadSchema = z.object({
  kind: z.literal("industryDoc"),
  sections: z.array(z.object({ heading: z.string(), body: z.string() })).min(3),
  comparisonTable: z.array(z.record(z.string(), z.union([z.string(), z.number()]))),
});

export const FranchiseDocPayloadSchema = z.object({
  kind: z.literal("franchiseDoc"),
  sections: z.array(z.object({ heading: z.string(), body: z.string() })).min(3),
  closure: z.object({
    headline: z.string(),
    bodyHtml: z.string(),
    metrics: z.array(DerivedMetricSchema),
  }),
  faq25: z.array(FaqItemSchema).min(10),
});

export const GeoPayloadSchema = z.discriminatedUnion("kind", [
  MarkdownPayloadSchema,
  IndustryDocPayloadSchema,
  FranchiseDocPayloadSchema,
]);

export type GeoPayloadParsed = z.infer<typeof GeoPayloadSchema>;
