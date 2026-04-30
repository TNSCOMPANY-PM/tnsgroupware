/**
 * v3-01 Step 2 — Structure (haiku).
 */

import "server-only";
import { callClaude, extractJson, HAIKU_MODEL } from "../claude";
import { buildStructureSysprompt, buildStructureUser } from "../sysprompts/structure";
import type { OutlineResult, PlanResult } from "../types";

export async function runStructure(args: {
  mode: "brand" | "industry";
  topic: string;
  plan: PlanResult;
}): Promise<OutlineResult> {
  const sys = buildStructureSysprompt({ mode: args.mode });
  const user = buildStructureUser({ topic: args.topic, plan: args.plan });

  const raw = await callClaude({
    model: HAIKU_MODEL,
    system: sys,
    user,
    // v3-02: 1500 → 2500. blocks 5개 × fact_ids 6~8개 + summary_line.
    maxTokens: 2500,
  });

  const parsed = extractJson(raw) as OutlineResult;

  if (!Array.isArray(parsed.blocks)) {
    throw new Error("Structure: blocks not array");
  }

  // fact_ids 가 selected_facts 의 metric_id 와 매칭 안 되는 경우 무시 + log
  const validIds = new Set(args.plan.selected_facts.map((f) => f.metric_id));
  for (const block of parsed.blocks) {
    if (!Array.isArray(block.fact_ids)) block.fact_ids = [];
    const before = block.fact_ids.length;
    block.fact_ids = block.fact_ids.filter((id) => validIds.has(id));
    if (block.fact_ids.length < before) {
      console.warn(
        `[v3.structure] block "${block.h2}" — invalid fact_ids ${before - block.fact_ids.length} 개 제거`,
      );
    }
    if (block.format !== "table") block.format = "prose";
    if (typeof block.summary_line !== "string") block.summary_line = "";
    if (typeof block.h2 !== "string") block.h2 = "(제목 없음)";
  }

  return parsed;
}
