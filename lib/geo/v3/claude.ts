/**
 * v3-01 — claude API client. haiku + sonnet 모두 지원.
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

export type ClaudeArgs = {
  model: string;
  system: string;
  user: string;
  maxTokens: number;
};

export async function callClaude(args: ClaudeArgs): Promise<string> {
  const client = getClient();
  const res = await client.messages.create({
    model: args.model,
    max_tokens: args.maxTokens,
    system: args.system,
    messages: [{ role: "user", content: args.user }],
  });
  const block = res.content.find((b) => b.type === "text");
  if (!block || block.type !== "text") throw new Error(`claude(${args.model}): no text block`);
  return block.text;
}

export const HAIKU_MODEL = "claude-haiku-4-5-20251001";
export const SONNET_MODEL = "claude-sonnet-4-6";

/**
 * haiku 가 종종 markdown fence 로 JSON 을 감싸 출력.
 * 첫 { 부터 마지막 } 까지만 추출.
 */
export function extractJson(raw: string): string {
  const first = raw.indexOf("{");
  const last = raw.lastIndexOf("}");
  if (first < 0 || last < 0 || last <= first) {
    throw new Error(`JSON 추출 실패: ${raw.slice(0, 200)}`);
  }
  return raw.slice(first, last + 1);
}
