/**
 * v3-01 Step 3 — Write (sonnet).
 */

import "server-only";
import { callClaude, SONNET_MODEL } from "../claude";
import { buildWriteSysprompt, buildWriteUser } from "../sysprompts/write";
import type { DraftResult, OutlineResult, PlanResult } from "../types";

export async function runWrite(args: {
  mode: "brand" | "industry";
  brandName?: string;
  industry?: string;
  industrySub?: string;
  isCustomer?: boolean;
  topic: string;
  today: string;
  plan: PlanResult;
  outline: OutlineResult;
  retryNote?: string;
}): Promise<DraftResult> {
  const sys = buildWriteSysprompt({
    mode: args.mode,
    brandName: args.brandName,
    industry: args.industry,
    industrySub: args.industrySub,
    isCustomer: args.isCustomer,
    topic: args.topic,
    today: args.today,
    population_n: args.plan.population_n ?? {},
  });

  let user = buildWriteUser({ plan: args.plan, outline: args.outline });
  if (args.retryNote) {
    user += `\n\n[재시도 안내]\n${args.retryNote}`;
  }

  const raw = await callClaude({
    model: SONNET_MODEL,
    system: sys,
    user,
    maxTokens: 4000,
  });

  return { body: raw };
}
