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
  // v2-12: max_tokens 16000 → 4000.
  // v2-16: 4000 → 3000. v2-15 sysprompt 강화 (입력 token +3k) 로 처리시간 60~120초+ → Hobby 120초 초과.
  //        한국어 3000 tokens ≈ 2,200자 = T2 medium 1,800~2,500자 타겟 안. 처리시간 30~60초.
  const res = await client.messages.create({
    model: args.model ?? "claude-sonnet-4-6",
    max_tokens: args.maxTokens ?? 3000,
    system: args.system,
    messages: [{ role: "user", content: args.user }],
  });
  const block = res.content.find((b) => b.type === "text");
  if (!block || block.type !== "text") throw new Error("Sonnet: no text block");
  return block.text;
}
