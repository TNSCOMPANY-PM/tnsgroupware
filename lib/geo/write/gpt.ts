import "server-only";
import OpenAI from "openai";
import { SYSTEM_GPT_BASE } from "./prompts/base";
import { GptFactsSchema, type GptFacts } from "@/lib/geo/schema";
import type { GeoInput } from "@/lib/geo/types";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

function tryParseJson(raw: string): unknown {
  const trimmed = raw.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  return JSON.parse(trimmed);
}

function inputDescriptor(input: GeoInput): string {
  switch (input.depth) {
    case "D0":
      return `DEPTH: D0\nTOPIC: ${input.topic}`;
    case "D1":
      return `DEPTH: D1\nTOPIC: ${input.topic}`;
    case "D2":
      return `DEPTH: D2\nINDUSTRY: ${input.industry}${input.topic ? `\nTOPIC: ${input.topic}` : ""}`;
    case "D3":
      return `DEPTH: D3\nBRAND: ${input.brand}\nBRAND_ID: ${input.brandId}`;
  }
}

export type GptCallResult = { facts: GptFacts; rawText: string };

export async function callGpt(
  input: GeoInput,
  officialBlock: string,
  retry = false,
): Promise<GptCallResult> {
  const userMsg =
    `${inputDescriptor(input)}\n\n${officialBlock}\n\nReturn JSON only.` +
    (retry ? "\n\nRetry: previous JSON failed schema. Return valid JSON matching OUTPUT_SCHEMA." : "");

  const res = await openai.chat.completions.create({
    model: "gpt-4o",
    messages: [
      { role: "system", content: SYSTEM_GPT_BASE },
      { role: "user", content: userMsg },
    ],
    temperature: 0,
    response_format: { type: "json_object" },
  });
  const content = res.choices[0]?.message?.content ?? "";
  const parsed = GptFactsSchema.parse(tryParseJson(content));
  return { facts: parsed, rawText: content };
}
