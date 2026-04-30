/**
 * v3-08 Step 2 — Structure (haiku).
 *  - input: PlanResult (fact_groups)
 *  - output: blocks[5] with metric_ids (fact_groups key) + format
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
    // v3-08: 2500 → 4000. fact_groups 풍부 + 5블럭 매핑.
    maxTokens: 4000,
  });

  const parsed = extractJson(raw) as OutlineResult;

  if (!Array.isArray(parsed.blocks)) {
    throw new Error("Structure: blocks not array");
  }

  // metric_ids 가 fact_groups 의 key 와 매칭 안 되는 경우 무시 + log
  const validIds = new Set(Object.keys(args.plan.fact_groups ?? {}));
  for (const block of parsed.blocks) {
    if (!Array.isArray(block.metric_ids)) block.metric_ids = [];
    const before = block.metric_ids.length;
    block.metric_ids = block.metric_ids.filter((id) => validIds.has(id));
    if (block.metric_ids.length < before) {
      console.warn(
        `[v3.structure] block "${block.h2}" — invalid metric_ids ${before - block.metric_ids.length}개 제거`,
      );
    }
    if (
      block.format !== "table" &&
      block.format !== "distribution_table" &&
      block.format !== "prose"
    ) {
      block.format = "prose";
    }
    if (typeof block.summary_line !== "string") block.summary_line = "";
    if (typeof block.h2 !== "string") block.h2 = "(제목 없음)";
  }

  return parsed;
}
