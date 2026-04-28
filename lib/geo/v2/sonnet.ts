/**
 * v2-04 sonnet 호출 헬퍼 (generic).
 * 기존 lib/geo/write/sonnet.ts 는 D0~D3 prompts 의존성이 있어 v2 에서 별도.
 */

import "server-only";
import Anthropic from "@anthropic-ai/sdk";

const _client: Anthropic | null = null;
function getClient(): Anthropic {
  if (_client) return _client;
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY 미설정");
  return new Anthropic({ apiKey });
}

export type SonnetCallArgs = {
  system: string;
  user: string;
  maxTokens?: number;
  model?: string;
};

export async function callSonnetV2(args: SonnetCallArgs): Promise<string> {
  const client = getClient();
  // v2-12: max_tokens 16000 → 4000. 한국어 4000 tokens ≈ 3,000자 (T2 medium 충분).
  // sonnet 처리시간 30~60초 (Hobby 120초 안전 범위 내).
  const res = await client.messages.create({
    model: args.model ?? "claude-sonnet-4-6",
    max_tokens: args.maxTokens ?? 4000,
    system: args.system,
    messages: [{ role: "user", content: args.user }],
  });
  const block = res.content.find((b) => b.type === "text");
  if (!block || block.type !== "text") throw new Error("Sonnet: no text block");
  return block.text;
}
