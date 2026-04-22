import { z } from "zod";

export const GptFactSchema = z.object({
  claim: z.string().min(1),
  value: z.union([z.string(), z.number()]),
  unit: z.string().nullable().optional(),
  source_url: z.string().url(),
  source_title: z.string().min(3),
  year_month: z.string().regex(/^\d{4}-\d{2}$/),
  authoritativeness: z.enum(["primary", "secondary"]),
});

export const GptFactsSchema = z.object({
  brand: z.string().min(1),
  category: z.string().min(1),
  facts: z.array(GptFactSchema).min(1),
  collected_at: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  measurement_floor: z.boolean().default(false),
  conflicts: z
    .array(z.object({ field: z.string(), reason: z.string() }))
    .default([]),
});

export type GptFacts = z.infer<typeof GptFactsSchema>;

export const FrontmatterFaqItemSchema = z.object({
  q: z.string().min(3),
  a: z.string().min(3),
});

export const FrontmatterSchema = z.object({
  title: z.string().min(5),
  description: z.string().min(10),
  category: z.string().min(1),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  dateModified: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  author: z.string().optional(),
  tags: z.array(z.string()).min(1),
  thumbnail: z.string().url(),
  sources: z.array(z.string().url()).optional(),
  measurement_notes: z.string().optional(),
  faq: z.array(FrontmatterFaqItemSchema).min(2),
});

export const SonnetOutputSchema = z.object({
  frontmatter: FrontmatterSchema,
  body: z.string().min(50),
});

export type SonnetOutput = z.infer<typeof SonnetOutputSchema>;
