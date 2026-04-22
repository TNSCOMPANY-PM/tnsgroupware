import "server-only";
import OpenAI from "openai";
import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { getRule, getExcludeReason } from "@/utils/matrix-guard";
import { generate as buildFrontmatter } from "@/utils/frandoor-frontmatter";
import { GptFactsSchema, SonnetOutputSchema, type GptFacts, type SonnetOutput } from "./schema";
import { SYSTEM_GPT, SYSTEM_SONNET, fillPrompt } from "./prompts";

export type RunAInput = { brand: string; category: string };
export type RunAResult = { md: string; facts: GptFacts; sonnet: SonnetOutput; logs: string[] };

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

function tryParseJson(raw: string): unknown {
  const trimmed = raw.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  return JSON.parse(trimmed);
}

async function callGpt(input: RunAInput, retry = false): Promise<GptFacts> {
  const userMsg = `BRAND: ${input.brand}\nCATEGORY: ${input.category}\n\nReturn JSON only.`;
  const res = await openai.chat.completions.create({
    model: "gpt-4o",
    messages: [
      { role: "system", content: SYSTEM_GPT },
      { role: "user", content: userMsg + (retry ? "\n\nRetry: previous JSON failed schema. Return a valid JSON matching OUTPUT_SCHEMA." : "") },
    ],
    temperature: 0,
    response_format: { type: "json_object" },
  });
  const content = res.choices[0]?.message?.content ?? "";
  const parsed = tryParseJson(content);
  return GptFactsSchema.parse(parsed);
}

async function callSonnet(input: RunAInput, facts: GptFacts): Promise<SonnetOutput> {
  const userPrompt = fillPrompt(
    "Brand: {brand} · Category: {category}\n\nFACTS (input JSON):\n{input_json}\n\nReturn ONE JSON object as OUTPUT FORMAT above.",
    { brand: input.brand, category: input.category, input_json: JSON.stringify(facts, null, 2) },
  );
  const res = await anthropic.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 4096,
    system: SYSTEM_SONNET,
    messages: [{ role: "user", content: userPrompt }],
  });
  const block = res.content.find((b) => b.type === "text");
  if (!block || block.type !== "text") throw new Error("Sonnet: no text block");
  const parsed = tryParseJson(block.text);
  return SonnetOutputSchema.parse(parsed);
}

export async function runA(input: RunAInput): Promise<RunAResult> {
  const logs: string[] = [];
  const log = (s: string) => { logs.push(s); console.log(s); };

  // GATE - matrix
  const rule = await getRule(input.brand, input.category);
  log(`[gate:verify:matrix] ${input.brand} × ${input.category} → ${rule ?? "NOT FOUND"}`);
  if (rule === "EXCLUDE") {
    const reason = await getExcludeReason(input.brand, input.category);
    throw new Error(`BLOCKED by matrix: ${input.brand} × ${input.category} — ${reason ?? "EXCLUDE rule"}`);
  }

  // GPT search
  log(`[gpt:search:${input.brand}] 시작`);
  let facts: GptFacts;
  try {
    facts = await callGpt(input, false);
  } catch (e) {
    log(`[gpt:search:${input.brand}] 1차 실패, 재시도: ${e instanceof Error ? e.message : e}`);
    try {
      facts = await callGpt(input, true);
    } catch (e2) {
      if (e2 instanceof z.ZodError) throw new Error(`GPT Zod 실패: ${e2.issues[0]?.message}`);
      throw e2;
    }
  }
  log(`[gpt:search:${input.brand}] facts ${facts.facts.length}건 / conflicts ${facts.conflicts.length}`);

  const secondary = facts.facts.filter((f) => f.authoritativeness === "secondary");
  if (secondary.length > 0 && facts.conflicts.length === 0) {
    throw new Error(`GATE-1 실패: secondary fact ${secondary.length}건 있는데 conflicts 비어있음`);
  }
  log(`[gate:verify:authoritativeness] secondary ${secondary.length} / conflicts ${facts.conflicts.length}`);

  // Sonnet write
  log(`[claude-sonnet:write:${input.brand}] 시작`);
  const sonnet = await callSonnet(input, facts);
  log(`[claude-sonnet:write:${input.brand}] frontmatter.title="${sonnet.frontmatter.title.slice(0, 40)}..." body ${sonnet.body.length}자`);

  // Assemble
  const fm = buildFrontmatter({
    ...sonnet.frontmatter,
    sources: sonnet.frontmatter.sources ?? facts.facts.map((f) => f.source_url).slice(0, 3),
    data_collected_at: facts.collected_at,
    measurement_notes: sonnet.frontmatter.measurement_notes
      ?? (facts.measurement_floor ? "네이버 검색광고 API '< 10'은 5로 치환" : undefined),
  });
  const md = `${fm}\n\n${sonnet.body.trim()}\n`;
  log(`[gate:verify:assemble] md ${md.length}자`);

  return { md, facts, sonnet, logs };
}
