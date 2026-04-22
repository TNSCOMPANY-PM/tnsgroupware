import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import type { Angle, Platform } from "./types";
import type { AngleSubset } from "./extract";
import { ANGLE_DESCRIPTION } from "./angles";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const SYSTEM_SYNDICATE = `You are a Korean content adapter for franchise syndication (외부 유통용 재가공).

[HARD RULES]
- 입력 JSON 의 숫자/기관명/브랜드명만 사용. JSON 에 없는 수치 절대 생성 금지.
- 새로운 공정위 인용 추가 금지. 새 출처 URL 생성 금지.
- 본문 내에 canonical 원문 링크 1회 이상 삽입 (제공된 {canonical_url} 사용).
- 본문 어디에도 "1위", "최고", "추천", "업계 1위", "수령확인서" 금지.
- "약/대략/정도/쯤/아마도/업계 관계자/많은 전문가" 금지.

[OUTPUT]
JSON one object:
{
  "title": string (60자 내),
  "html": "<article>...</article>" (plain HTML; no <script>, no <style>, no <link>),
  "anchor": string (본문 말미의 canonical 인용 문구; 예: "원문: 프랜도어 {brand} 상세")
}

[PLATFORM HINTS]
- tistory: <article> root + <h2>, <p>, <table>, <ul>, <li>, 인라인 style 허용 (class 금지).
- naver: <h2>, <p>, <table>, <ul>, <li> 만 사용. 인라인 style 최소화. class·id 금지.
- medium: <h2>, <p>, <blockquote>, <ul>, <li>. 표는 사용 가능하지만 단순화.

원문 요지를 유지하되 앵글 관점에서 압축 · 재배열. 출처 인용은 원문 기관명 그대로.`;

function tryParseJson(raw: string): unknown {
  const trimmed = raw.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  return JSON.parse(trimmed);
}

export type RewriteResult = { title: string; html: string; anchor: string; rawText: string };

export async function rewriteForAngle(
  subset: AngleSubset,
  angle: Angle,
  platform: Platform,
  canonicalUrl: string,
  lengthHint?: number,
): Promise<RewriteResult> {
  const userPrompt = [
    `ANGLE: ${angle} — ${ANGLE_DESCRIPTION[angle]}`,
    `PLATFORM: ${platform}`,
    `CANONICAL_URL: ${canonicalUrl}`,
    lengthHint ? `LENGTH_HINT: ${lengthHint}자 근방` : "",
    "",
    "INPUT_SUBSET:",
    JSON.stringify(subset, null, 2),
    "",
    "Return ONE JSON object as OUTPUT above.",
  ]
    .filter(Boolean)
    .join("\n");

  const res = await anthropic.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 4000,
    system: SYSTEM_SYNDICATE,
    messages: [{ role: "user", content: userPrompt }],
  });
  const block = res.content.find((b) => b.type === "text");
  if (!block || block.type !== "text") throw new Error("syndicate rewrite: no text block");
  const parsed = tryParseJson(block.text) as { title?: string; html?: string; anchor?: string };
  if (!parsed.title || !parsed.html) {
    throw new Error("syndicate rewrite: malformed output");
  }
  return {
    title: parsed.title,
    html: parsed.html,
    anchor: parsed.anchor ?? `원문: 프랜도어 ${canonicalUrl}`,
    rawText: block.text,
  };
}
