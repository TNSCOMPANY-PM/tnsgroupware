/**
 * v3-08 Step 1 — Plan (haiku) + 결정론 후처리.
 *  - haiku: raw_value/unit/label/source_label/distribution.raw/n_population 출력
 *  - post-process: display/ac_diff_analysis/brand_position 결정론 채움
 */

import "server-only";
import { callClaude, extractJson, HAIKU_MODEL } from "../claude";
import { buildPlanSysprompt, buildPlanUser } from "../sysprompts/plan";
import { postProcessPlan } from "../plan_format";
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
    // v3-08: fact_groups + 분포 + ac_diff + display + outlier_note → 4000 부족.
    // 8000 안전 margin (haiku 비용 영향 적음).
    maxTokens: 8000,
  });

  const parsed = extractJson(raw) as PlanResult;

  if (!parsed || typeof parsed !== "object") {
    throw new Error("Plan: parsed not object");
  }
  if (!parsed.fact_groups || typeof parsed.fact_groups !== "object") {
    throw new Error("Plan: fact_groups not object");
  }
  if (typeof parsed.key_angle !== "string") parsed.key_angle = args.topic;
  if (!parsed.population_info || typeof parsed.population_info !== "object") {
    parsed.population_info = {};
  }
  if (typeof parsed.brand_label !== "string") {
    parsed.brand_label = args.brandName ?? args.industry ?? "";
  }
  if (typeof parsed.industry !== "string") {
    parsed.industry = args.industry ?? "";
  }

  // 결정론 후처리 — display / ac_diff_analysis / brand_position 채움
  return postProcessPlan(parsed);
}
