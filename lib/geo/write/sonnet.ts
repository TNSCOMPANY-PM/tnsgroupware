import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { SYSTEM_SONNET_D0 } from "./prompts/D0";
import { SYSTEM_SONNET_D1 } from "./prompts/D1";
import { SYSTEM_SONNET_D2 } from "./prompts/D2";
import { SYSTEM_SONNET_D3 } from "./prompts/D3";
import { fillPrompt } from "./prompts/fill";
import type { GptFacts } from "@/lib/geo/schema";
import type { DerivedMetric, GeoInput, Depth } from "@/lib/geo/types";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

function systemForDepth(depth: Depth): string {
  switch (depth) {
    case "D0": return SYSTEM_SONNET_D0;
    case "D1": return SYSTEM_SONNET_D1;
    case "D2": return SYSTEM_SONNET_D2;
    case "D3": return SYSTEM_SONNET_D3;
  }
}

function inputSummary(input: GeoInput): string {
  switch (input.depth) {
    case "D0": return `TOPIC: ${input.topic}`;
    case "D1": return `TOPIC: ${input.topic}`;
    case "D2": return `INDUSTRY: ${input.industry}${input.topic ? ` · TOPIC: ${input.topic}` : ""}`;
    case "D3": return `BRAND: ${input.brand}${input.topic ? ` · TOPIC: ${input.topic}` : ""}`;
  }
}

function tryParseJson(raw: string): unknown {
  const trimmed = raw.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  return JSON.parse(trimmed);
}

export type SonnetCallResult = {
  raw: unknown;
  rawText: string;
};

export async function callSonnet(
  input: GeoInput,
  facts: GptFacts,
  deriveds: DerivedMetric[] = [],
  extraContext: Record<string, unknown> = {},
): Promise<SonnetCallResult> {
  const system = systemForDepth(input.depth);
  const factsWithDeriveds = { ...facts, deriveds: deriveds.length > 0 ? deriveds : facts.deriveds };
  const inputJson = { ...extraContext, facts: factsWithDeriveds };
  const userPrompt = fillPrompt(
    "DEPTH: {depth}\n{summary}\n\nFACTS (input JSON):\n{input_json}\n\nReturn ONE JSON object as OUTPUT FORMAT above.",
    {
      depth: input.depth,
      summary: inputSummary(input),
      input_json: JSON.stringify(inputJson, null, 2),
    },
  );

  const res = await anthropic.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 16000,
    system,
    messages: [{ role: "user", content: userPrompt }],
  });
  const block = res.content.find((b) => b.type === "text");
  if (!block || block.type !== "text") throw new Error("Sonnet: no text block");
  const parsed = tryParseJson(block.text);
  return { raw: parsed, rawText: block.text };
}
