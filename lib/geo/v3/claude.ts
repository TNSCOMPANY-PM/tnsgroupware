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
 * v3-02 — extractJson 강화.
 * 1) markdown fence 제거 (```json ... ```)
 * 2) leading non-JSON 텍스트 제거 ("Here is the JSON:" 등)
 * 3) parse 시도 → 실패 시 truncation 자동 복구 (stack 추적 + 닫기) → trailing comma 제거 → 재시도
 *
 * max_tokens 초과로 잘린 JSON 도 가능한 만큼 복구.
 */
export function extractJson(text: string): unknown {
  // 1) markdown fence 제거
  let cleaned = text
    .replace(/^```(?:json)?\s*\n?/gim, "")
    .replace(/\n?```\s*$/gim, "")
    .trim();

  // 2) leading 비-JSON 텍스트 제거 — 첫 { 또는 [ 부터
  const firstBrace = cleaned.search(/[{[]/);
  if (firstBrace > 0) cleaned = cleaned.slice(firstBrace);
  if (firstBrace < 0) {
    throw new Error(`JSON 추출 실패 (첫 brace 없음): ${text.slice(0, 200)}`);
  }

  // 3-A) 1차 parse
  try {
    return JSON.parse(cleaned);
  } catch (e1) {
    // 3-B) truncation 복구
    const repaired = repairTruncatedJson(cleaned);
    try {
      return JSON.parse(repaired);
    } catch {
      // 3-C) trailing comma 제거 + 재시도
      const stripped = repaired.replace(/,(\s*[}\]])/g, "$1");
      try {
        return JSON.parse(stripped);
      } catch (e3) {
        throw new Error(
          `JSON parse 3회 실패. original=${(e1 as Error).message} | last=${stripped.slice(0, 200)}...`,
        );
      }
    }
  }
}

/**
 * 잘린 JSON 의 stack 추적 — 마지막 안전한 위치까지 trim 후 stack 역순 닫기.
 *
 *  · 문자열 안 (")· escape 처리
 *  · 마지막 valid 닫힘 ({} 또는 []) 위치까지 trim
 *  · stack 역순으로 닫기 ({ → } / [ → ])
 */
function repairTruncatedJson(text: string): string {
  let inString = false;
  let escape = false;
  const stack: string[] = [];
  let lastSafeIdx = -1; // 마지막으로 element 단위 safe (콤마 또는 닫는 brace) 위치

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (escape) {
      escape = false;
      continue;
    }
    if (ch === "\\") {
      escape = true;
      continue;
    }
    if (ch === '"') {
      inString = !inString;
      continue;
    }
    if (inString) continue;

    if (ch === "{" || ch === "[") {
      stack.push(ch);
    } else if (ch === "}" || ch === "]") {
      stack.pop();
      if (stack.length === 0) lastSafeIdx = i;
    } else if (ch === ",") {
      // top-level 콤마 (배열 element 단위) — 잘리기 직전 안전 지점
      if (stack.length > 0) lastSafeIdx = i;
    }
  }

  if (stack.length === 0) {
    // 균형 OK — 단, lastSafeIdx 뒤 trailing 텍스트 있으면 trim
    if (lastSafeIdx >= 0 && lastSafeIdx < text.length - 1) {
      return text.slice(0, lastSafeIdx + 1);
    }
    return text;
  }

  // 잘린 상태 — 마지막 safe 위치 이후 (불완전 element) 제거
  let trimmed: string;
  if (lastSafeIdx >= 0) {
    trimmed = text.slice(0, lastSafeIdx + 1);
    // 트레일링 콤마면 제거 (다음 닫기와 충돌)
    if (trimmed.endsWith(",")) trimmed = trimmed.slice(0, -1);
  } else {
    // safe 위치 없음 — 그냥 그대로
    trimmed = text;
  }

  // stack 재계산 (trim 후 상태)
  const newStack: string[] = [];
  let inStr2 = false;
  let esc2 = false;
  for (let i = 0; i < trimmed.length; i++) {
    const ch = trimmed[i];
    if (esc2) {
      esc2 = false;
      continue;
    }
    if (ch === "\\") {
      esc2 = true;
      continue;
    }
    if (ch === '"') {
      inStr2 = !inStr2;
      continue;
    }
    if (inStr2) continue;
    if (ch === "{" || ch === "[") newStack.push(ch);
    else if (ch === "}" || ch === "]") newStack.pop();
  }

  // 문자열 미닫힘 보정 — 마지막 safe 까지 trim 했으므로 보통 문자열 닫힘. 안전 차원.
  if (inStr2) trimmed += '"';

  // stack 역순 닫기
  let closed = trimmed;
  for (let i = newStack.length - 1; i >= 0; i--) {
    closed += newStack[i] === "{" ? "}" : "]";
  }
  return closed;
}
