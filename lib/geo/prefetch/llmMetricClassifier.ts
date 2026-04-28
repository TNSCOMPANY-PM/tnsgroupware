/**
 * PR058 Part C — docx 셀 라벨 → 표준 metric ID LLM fallback 분류기.
 *
 * 휴리스틱(`assignMetric`) 매핑 실패 시만 호출 (호출자 책임).
 * Haiku 사용 (저비용 + 단순 분류). 30 토큰 / 셀.
 *
 * 호출 비용: ~$0.0003 / docx (5~10 셀 fallback 가정).
 *
 * env: ANTHROPIC_API_KEY 필요. 미설정 시 graceful skip (null 반환).
 */

import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import {
  STANDARD_METRICS,
  type StandardMetricId,
} from "@/lib/geo/standardSchema";

let _client: Anthropic | null = null;
function getClient(): Anthropic | null {
  if (!process.env.ANTHROPIC_API_KEY) return null;
  if (!_client) _client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  return _client;
}

export type LlmClassifyInput = {
  cell_text: string;
  context_headers?: string[];
  context_section?: string | null;
  sample_value?: string | null;
};

export type LlmClassifyResult = {
  metric_id: StandardMetricId | null;
  confidence: "high" | "low";
  reason?: string;
};

const ALL_IDS = Object.keys(STANDARD_METRICS) as StandardMetricId[];

function buildCandidateList(): string {
  return ALL_IDS.map((id) => `${id} (${STANDARD_METRICS[id].ko})`).join(" | ");
}

const SYSTEM = `당신은 프랜차이즈 정보공개서/브로셔의 표 셀 라벨을 표준 metric ID 로 분류합니다.
출력은 metric ID 하나 또는 "skip" 만. 다른 설명 일절 금지.
확실치 않으면 "skip".`;

export async function llmClassifyMetric(
  input: LlmClassifyInput,
): Promise<LlmClassifyResult> {
  const client = getClient();
  if (!client) {
    return { metric_id: null, confidence: "low", reason: "ANTHROPIC_API_KEY 미설정" };
  }
  const candidates = buildCandidateList();
  const user = [
    `표 셀 라벨: "${input.cell_text}"`,
    input.context_headers && input.context_headers.length > 0
      ? `표 헤더: [${input.context_headers.join(", ")}]`
      : null,
    input.context_section ? `직전 섹션: ${input.context_section}` : null,
    input.sample_value ? `샘플 값: ${input.sample_value}` : null,
    "",
    `후보 metric ID: ${candidates}`,
    "",
    `이 셀에 가장 적합한 metric ID 1개 또는 "skip".`,
  ]
    .filter(Boolean)
    .join("\n");

  try {
    const res = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 30,
      temperature: 0,
      system: SYSTEM,
      messages: [{ role: "user", content: user }],
    });
    const block = res.content.find((b) => b.type === "text");
    if (!block || block.type !== "text") {
      return { metric_id: null, confidence: "low", reason: "no text block" };
    }
    const ans = block.text
      .trim()
      .replace(/^["'`]+|["'`]+$/g, "")
      .split(/\s|[\n,]/)[0]
      ?.trim();
    if (!ans || ans === "skip") return { metric_id: null, confidence: "low" };
    if (ALL_IDS.includes(ans as StandardMetricId)) {
      return { metric_id: ans as StandardMetricId, confidence: "high" };
    }
    return { metric_id: null, confidence: "low", reason: `unknown id: ${ans}` };
  } catch (e) {
    return {
      metric_id: null,
      confidence: "low",
      reason: e instanceof Error ? e.message : String(e),
    };
  }
}
