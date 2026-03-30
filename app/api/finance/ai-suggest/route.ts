import { NextResponse } from "next/server";
import OpenAI from "openai";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const CATEGORIES = [
  "더널리", "더널리 충전", "티제이웹", "기타",
  "매체비정산", "CPC정산", "환불(더널리)", "환불(티제이웹)",
];

type InputRow = { id: string; senderName?: string; description?: string; amount?: number; type?: string };

export async function POST(req: Request) {
  const { rows } = (await req.json()) as { rows: InputRow[] };
  if (!rows?.length) return NextResponse.json({ suggestions: [] });

  const rowText = rows
    .map((r, i) =>
      `${i + 1}. id:"${r.id}" 입금자:"${r.senderName ?? ""}" 설명:"${r.description ?? ""}" 금액:${r.amount ?? 0}원 구분:${r.type === "WITHDRAWAL" ? "출금" : "입금"}`
    )
    .join("\n");

  const prompt = `아래 회사 원장 미분류 거래 내역에 대해 각각 가장 적합한 카테고리를 선택하세요.

카테고리 목록:
- 더널리: 더널리 광고 서비스 매출 (네이버·카카오 광고 대행)
- 더널리 충전: 더널리 플랫폼 충전금 입금
- 티제이웹: 홈페이지 제작·유지보수·호스팅
- 매체비정산: 광고 매체비 정산 수금
- CPC정산: 클릭당 광고비(CPC) 정산 수금
- 환불(더널리): 더널리 관련 환불 출금
- 환불(티제이웹): 티제이웹 관련 환불 출금
- 기타: 위에 해당 없는 경우

거래 내역:
${rowText}

{"suggestions": [{"id": "...", "classification": "카테고리명"}, ...]} 형식 JSON으로만 응답하세요.`;

  const res = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [{ role: "user", content: prompt }],
    response_format: { type: "json_object" },
    max_tokens: 1000,
  });

  try {
    const parsed = JSON.parse(res.choices[0]?.message?.content ?? "{}") as { suggestions?: { id: string; classification: string }[] };
    const suggestions = (parsed.suggestions ?? []).filter(
      (s) => s.id && CATEGORIES.includes(s.classification)
    );
    return NextResponse.json({ suggestions });
  } catch {
    return NextResponse.json({ suggestions: [] });
  }
}
