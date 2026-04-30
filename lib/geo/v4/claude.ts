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
