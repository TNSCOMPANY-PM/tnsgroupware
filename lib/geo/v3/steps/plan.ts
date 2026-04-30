/**
 * v3-01 Step 1 — Plan (haiku).
 */

import "server-only";
import { callClaude, extractJson, HAIKU_MODEL } from "../claude";
import { buildPlanSysprompt, buildPlanUser } from "../sysprompts/plan";
import type { Fact, PlanResult } from "../types";

export async function runPlan(args: {
  mode: "brand" | "industry";
  brandName?: string;
  industry?: string;
  topic: string;
  factsPool: Fact[];
}): Promise<PlanResult> {
  const sys = buildPlanSysprompt();
  const factsForLlm = args.factsPool.map((f) => ({
    metric_id: f.metric_id,
    metric_label: f.metric_label,
    value: f.value_num ?? f.value_text,
    unit: f.unit,
    period: f.period,
    source_tier: f.source_tier,
    source_label: f.source_label,
    n: f.n ?? null,
    agg_method: f.agg_method ?? null,
  }));
  const user = buildPlanUser({
    mode: args.mode,
    brandName: args.brandName,
    industry: args.industry,
    topic: args.topic,
    factsPool: factsForLlm,
  });

  const raw = await callClaude({
    model: HAIKU_MODEL,
    system: sys,
    user,
    // v3-02: 1500 → 4000. selected_facts 15~20개 × ~150 token = 3000 + overhead.
    maxTokens: 4000,
  });

  const parsed = extractJson(raw) as PlanResult;

  if (!Array.isArray(parsed.selected_facts)) {
    throw new Error("Plan: selected_facts not array");
  }
  if (!Array.isArray(parsed.outliers)) parsed.outliers = [];
  if (!parsed.population_n || typeof parsed.population_n !== "object") {
    parsed.population_n = {};
  }
  if (typeof parsed.key_angle !== "string") parsed.key_angle = args.topic;

  return parsed;
}
