import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { getSessionEmployee, unauthorized } from "@/utils/apiAuth";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export async function POST(req: Request) {
  const session = await getSessionEmployee();
  if (!session) return unauthorized();

  const body = await req.json() as {
    monthLabel: string;
    revenue: number;
    purchase: number;
    grossProfit: number;
    targetGP: number;
    achievementRate: number;
    pendingCount: number;
    teamRows: { team: string; revenue: number; grossProfit: number }[];
  };

  const {
    monthLabel, revenue, purchase, grossProfit, targetGP,
    achievementRate, pendingCount, teamRows,
  } = body;

  const teamText = (teamRows ?? [])
    .map((t) => `${t.team}: 매출 ${(t.revenue / 1e6).toFixed(1)}백만원, 매총 ${(t.grossProfit / 1e6).toFixed(1)}백만원`)
    .join(" / ");

  const prompt = `당신은 중소기업 경영 보고서 작성 전문가입니다. 아래 ${monthLabel} 운영 데이터를 바탕으로 경영진 보고용 현황 요약을 작성하세요.

데이터:
- 매출: ${(revenue / 1e6).toFixed(1)}백만원 (공급가 기준)
- 매입: ${(purchase / 1e6).toFixed(1)}백만원
- 매출총이익: ${(grossProfit / 1e6).toFixed(1)}백만원
- 목표 매총: ${(targetGP / 1e6).toFixed(1)}백만원
- 달성률: ${(achievementRate * 100).toFixed(1)}%
- 팀별: ${teamText || "데이터 없음"}
- 미승인 원장: ${pendingCount}건

작성 규칙:
- 4~6문장, 경어체
- 수치는 구체적으로 언급 (백만원 단위)
- 달성률이 80% 미만이면 보완 필요 언급, 이상이면 긍정 평가
- 미승인 원장이 5건 초과면 정산 처리 촉구 한 문장 포함
- 마크다운 없이 일반 텍스트로`;

  const res = await anthropic.messages.create({
    model: "claude-haiku-4-5",
    max_tokens: 500,
    messages: [{ role: "user", content: prompt }],
  });

  const text = res.content[0]?.type === "text" ? res.content[0].text : "";
  return NextResponse.json({ summary: text.trim() });
}
