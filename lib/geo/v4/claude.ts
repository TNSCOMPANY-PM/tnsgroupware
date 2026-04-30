/**
 * v4 — claude sonnet client (single call).
 */

import "server-only";
import Anthropic from "@anthropic-ai/sdk";

let _client: Anthropic | null = null;
function getClient(): Anthropic {
  if (_client) return _client;
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY 미설정");
  _client = new Anthropic({ apiKey });
  return _client;
}

export const SONNET_MODEL = "claude-sonnet-4-6";
export const HAIKU_MODEL = "claude-haiku-4-5-20251001";

export async function callSonnet(args: {
  system: string;
  user: string;
  maxTokens: number;
}): Promise<string> {
  const client = getClient();
  const res = await client.messages.create({
    model: SONNET_MODEL,
    max_tokens: args.maxTokens,
    system: args.system,
    messages: [{ role: "user", content: args.user }],
  });
  const block = res.content.find((b) => b.type === "text");
  if (!block || block.type !== "text") throw new Error("Sonnet: no text block");
  return block.text;
}

export async function callHaiku(args: {
  system: string;
  user: string;
  maxTokens: number;
}): Promise<string> {
  const client = getClient();
  const res = await client.messages.create({
    model: HAIKU_MODEL,
    max_tokens: args.maxTokens,
    system: args.system,
    messages: [{ role: "user", content: args.user }],
  });
  const block = res.content.find((b) => b.type === "text");
  if (!block || block.type !== "text") throw new Error("Haiku: no text block");
  return block.text;
}

/** haiku 종종 markdown fence 또는 leading text 붙임 — JSON 블록만 추출. */
export function extractJson(text: string): unknown {
  let cleaned = text
    .replace(/^```(?:json)?\s*\n?/gim, "")
    .replace(/\n?```\s*$/gim, "")
    .trim();
  const firstBrace = cleaned.search(/[{[]/);
  if (firstBrace > 0) cleaned = cleaned.slice(firstBrace);
  if (firstBrace < 0) {
    throw new Error(`JSON 추출 실패: ${text.slice(0, 200)}`);
  }
  try {
    return JSON.parse(cleaned);
  } catch (e) {
    // trailing comma 제거 후 재시도
    const stripped = cleaned.replace(/,(\s*[}\]])/g, "$1");
    try {
      return JSON.parse(stripped);
    } catch {
      throw new Error(`JSON parse 실패: ${(e as Error).message} | ${stripped.slice(0, 200)}`);
    }
  }
}
