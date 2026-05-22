/**
 * v4 — claude sonnet client (single call).
 *
 * v5-13 — transient retry (overloaded_error / 529 / 503 / 429 / 408 / 502 / 504).
 * Anthropic 인프라 일시 과부하 시 exponential backoff 으로 자동 재시도.
 */

import "server-only";
import Anthropic, { APIError } from "@anthropic-ai/sdk";

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

// v5-13 — Anthropic transient errors. 코드 단에서 추가 재시도.
const TRANSIENT_HTTP_STATUSES = new Set([408, 425, 429, 500, 502, 503, 504, 529]);
const TRANSIENT_BACKOFF_MS = [1500, 4500, 12000]; // 3회 재시도, 누적 ~18s.

function isTransientError(err: unknown): boolean {
  if (err instanceof APIError) {
    if (err.status && TRANSIENT_HTTP_STATUSES.has(err.status)) return true;
    const t = (err as { error?: { error?: { type?: string } } }).error?.error?.type;
    if (t === "overloaded_error" || t === "rate_limit_error" || t === "api_error") return true;
  }
  const msg = err instanceof Error ? err.message : String(err ?? "");
  return /overloaded_error|rate_limit_error|\b(429|503|529|502|504)\b/.test(msg);
}

async function withTransientRetry<T>(label: string, fn: () => Promise<T>): Promise<T> {
  let lastErr: unknown;
  for (let attempt = 0; attempt <= TRANSIENT_BACKOFF_MS.length; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if (!isTransientError(err) || attempt === TRANSIENT_BACKOFF_MS.length) throw err;
      const delay = TRANSIENT_BACKOFF_MS[attempt];
      const msg = err instanceof Error ? err.message : String(err);
      console.warn(
        `[${label}] transient error — ${delay}ms 후 재시도 (attempt ${attempt + 1}/${TRANSIENT_BACKOFF_MS.length}): ${msg.slice(0, 200)}`,
      );
      await new Promise((r) => setTimeout(r, delay));
    }
  }
  throw lastErr;
}

/**
 * v4-04 — 본문 작성 모델 Sonnet 4.6 복귀 (haiku 4.5 quality 부족 — 자릿수/hallucination/메타).
 * max_tokens 2000 으로 단축해 60s 안 처리 (sonnet output ~50 tok/s × 2000 = ~40s).
 * voice spec 강도 ↑ (v4-03) 유지 + post_process 안전망.
 */
export async function callSonnet(args: {
  system: string;
  user: string;
  maxTokens: number;
}): Promise<string> {
  const client = getClient();
  const res = await withTransientRetry("callSonnet", () =>
    client.messages.create({
      model: SONNET_MODEL,
      max_tokens: args.maxTokens,
      system: args.system,
      messages: [{ role: "user", content: args.user }],
    }),
  );
  const block = res.content.find((b) => b.type === "text");
  if (!block || block.type !== "text") throw new Error("Sonnet writer: no text block");
  return block.text;
}

/**
 * v4-10 — LLM1 (selected_metrics + key_angle) Sonnet 호출.
 * 작은 output (~500 token) 이라 Sonnet 도 ~10s 안 끝나며, JSON parse 실패율 ↓.
 * Haiku 큰 JSON output 만성 실패 (position 6764 등) 회피.
 */
export async function callLLM1(args: {
  system: string;
  user: string;
  maxTokens?: number;
}): Promise<string> {
  const client = getClient();
  const res = await withTransientRetry("callLLM1", () =>
    client.messages.create({
      model: SONNET_MODEL,
      max_tokens: args.maxTokens ?? 1500,
      system: args.system,
      messages: [{ role: "user", content: args.user }],
    }),
  );
  const block = res.content.find((b) => b.type === "text");
  if (!block || block.type !== "text") throw new Error("LLM1 (Sonnet): no text block");
  return block.text;
}

export async function callHaiku(args: {
  system: string;
  user: string;
  maxTokens: number;
}): Promise<string> {
  const client = getClient();
  const res = await withTransientRetry("callHaiku", () =>
    client.messages.create({
      model: HAIKU_MODEL,
      max_tokens: args.maxTokens,
      system: args.system,
      messages: [{ role: "user", content: args.user }],
    }),
  );
  const block = res.content.find((b) => b.type === "text");
  if (!block || block.type !== "text") throw new Error("Haiku: no text block");
  return block.text;
}

/**
 * v4-08 — extractJson 강화 (v3-02 의 repairTruncatedJson 적용).
 * 1) markdown fence 제거 (```json ... ```)
 * 2) leading 비-JSON 텍스트 제거 (첫 { 또는 [ 부터)
 * 3) parse → 실패 시 truncation 자동 복구 (stack 추적 + 마지막 safe 위치 trim + 역순 닫기)
 * 4) trailing comma 제거 후 재시도
 * 5) balanced JSON 뒤 trailing junk 도 trim
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
 *  · 문자열 안 (")· escape 처리
 *  · 마지막 valid 닫힘 ({} 또는 []) 위치까지 trim
 *  · stack 역순으로 닫기 ({ → } / [ → ])
 *  · balanced JSON 뒤 trailing junk 도 trim
 */
function repairTruncatedJson(text: string): string {
  let inString = false;
  let escape = false;
  const stack: string[] = [];
  let lastSafeIdx = -1;

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
      if (stack.length > 0) lastSafeIdx = i;
    }
  }

  if (stack.length === 0) {
    // 균형 OK — trailing 텍스트 있으면 trim
    if (lastSafeIdx >= 0 && lastSafeIdx < text.length - 1) {
      return text.slice(0, lastSafeIdx + 1);
    }
    return text;
  }

  // 잘린 상태 — 마지막 safe 위치 이후 (불완전 element) 제거
  let trimmed: string;
  if (lastSafeIdx >= 0) {
    trimmed = text.slice(0, lastSafeIdx + 1);
    if (trimmed.endsWith(",")) trimmed = trimmed.slice(0, -1);
  } else {
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

  // 문자열 미닫힘 보정
  if (inStr2) trimmed += '"';

  // stack 역순 닫기
  let closed = trimmed;
  for (let i = newStack.length - 1; i >= 0; i--) {
    closed += newStack[i] === "{" ? "}" : "]";
  }
  return closed;
}
