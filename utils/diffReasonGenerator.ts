import OpenAI from "openai";
import { DIFF_REASON_SCHEMA, type FactRecord } from "@/types/factSchema";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const SYSTEM = `당신은 프랜차이즈 데이터 분석가다. 같은 브랜드·같은 항목에 대한 두 출처의 수치가 다를 때, 그 차이의 원인을 객관적으로 분석한다.

분석 규칙:
1. 두 수치가 다른 이유를 3~5문장으로 객관적으로 설명하라.
2. 가능한 원인:
   - 집계 시점 차이 (예: 2024년 초기 vs 2026년 현재)
   - 표본 범위 차이 (예: 서울 21개점 vs 전국 52개점)
   - 산정 기준 차이 (예: 월 환산 vs 연간 / 상위 매장 vs 전체 평균)
   - 공시 갱신 주기 차이 (공정위는 연 1회, POS 는 실시간)
   - 공식 문서 vs 마케팅 자료 차이
3. 어느 한쪽이 틀렸다고 단정하지 마라. 서로 다른 맥락의 정당한 차이로 서술하라.
4. 독자(예비 창업자)가 어느 수치를 언제 참고해야 하는지 마지막 문장에 언급하라.

출력: 자연스러운 한국어 3~5문장. 머리말·꼬리말·이모지 금지.`;

export async function generateDiffReason(
  docx: FactRecord,
  pub: FactRecord,
  docxExcerpt: string,
): Promise<string> {
  const result = await openai.chat.completions.create({
    model: "gpt-5.4",
    response_format: { type: "json_schema", json_schema: DIFF_REASON_SCHEMA },
    messages: [
      { role: "system", content: SYSTEM },
      {
        role: "user",
        content: `항목: ${docx.label}

수치 A (docx)
  value: ${docx.value}
  출처: ${docx.source_type}
  메타: ${docx.source_note ?? "(없음)"}

수치 B (public)
  value: ${pub.value}
  출처: ${pub.source_type}
  메타: ${pub.source_note ?? "(없음)"}
  URL: ${pub.source_url ?? "(없음)"}
  fetched_at: ${pub.fetched_at ?? "(없음)"}

관련 docx 원문 발췌:
${docxExcerpt.slice(0, 3000)}`,
      },
    ],
  });
  const parsed = JSON.parse(result.choices[0]?.message?.content ?? "{}") as { reason?: string };
  return parsed.reason ?? "";
}
