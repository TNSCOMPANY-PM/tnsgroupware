import { createAdminClient } from "@/utils/supabase/admin";
import { NextResponse } from "next/server";
import { getSessionEmployee, unauthorized } from "@/utils/apiAuth";
import OpenAI from "openai";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

function extractText(output: unknown[]): string {
  const texts: string[] = [];
  for (const o of output) {
    const item = o as { type: string; content?: { type: string; text?: string }[] };
    if (item.type === "message" && item.content) {
      for (const c of item.content) {
        if (c.type === "output_text" && c.text) texts.push(c.text);
      }
    }
  }
  return texts.join("\n");
}

export async function POST(request: Request) {
  const session = await getSessionEmployee();
  if (!session) return unauthorized();

  const body = await request.json() as { brand_name: string; category: string };
  if (!body.brand_name?.trim() || !body.category?.trim()) {
    return NextResponse.json({ error: "brand_name, category 필수" }, { status: 400 });
  }

  const supabase = createAdminClient();
  const brandName = body.brand_name.trim();
  const category = body.category.trim();

  // 프롬프트 로드
  const { data: templates } = await supabase
    .from("geo_demo_prompts")
    .select("*")
    .eq("is_active", true)
    .order("sort_order");

  if (!templates || templates.length === 0) {
    return NextResponse.json({ error: "프롬프트가 없습니다" }, { status: 400 });
  }

  // 플레이스홀더 치환
  const prompts = templates.map(t => ({
    ...t,
    prompt_text: t.prompt_template
      .replace(/\{브랜드명\}/g, brandName)
      .replace(/\{카테고리\}/g, category),
  }));

  const brandLower = brandName.toLowerCase();
  const brandVariants = [brandLower, brandLower.replace(/\s/g, "")];

  const results: {
    category: string;
    category_label: string;
    prompt: string;
    ai_response: string;
    brand_mentioned: boolean;
    accuracy_score: number;
  }[] = [];

  // 순차 실행
  for (const p of prompts) {
    try {
      const result = await openai.responses.create({
        model: "gpt-5.4-mini",
        tools: [{ type: "web_search_preview" as const }],
        instructions: "You are a helpful assistant. 한국어로 답변하세요.",
        input: p.prompt_text,
      });
      const response = extractText(result.output ?? []);
      const responseLower = response.toLowerCase();
      const isD3 = p.category === "D3";

      let mentioned = false;
      let accuracy_score = 0;

      if (!isD3) {
        // 노출 판정: 단순 언급이 아니라 "추천/소개 맥락"에서 언급되어야 함
        const hasBrand = brandVariants.some(v => responseLower.includes(v));
        const hasRejection = /확인되지 않|정보가 없|찾을 수 없|알려진 정보가|언급되지 않/.test(response);
        mentioned = hasBrand && !hasRejection;
      } else {
        // D3 정확도: LLM judge로 엄격하게 평가
        try {
          const judgePrompt = `다음은 "${brandName}" 브랜드에 대한 질문과 AI 답변입니다.

[질문]
${p.prompt_text}

[AI 답변]
${response.slice(0, 2000)}

이 답변이 "${brandName}" 브랜드에 대해 얼마나 정확하고 구체적인 정보를 제공하는지 0~100점으로 채점하세요.

채점 기준 (엄격하게):
- 0점: 브랜드 언급 없음, 또는 "정보 없음/확인 불가"라고 답변
- 10~25점: 브랜드 언급은 있으나 매우 일반적/추상적, 구체 수치 없음, 또는 "추정/대략" 같은 헤지 표현 다수
- 30~50점: 일부 구체 정보(수치 1~2개)는 있으나 검증 가능한 핵심 팩트(가맹비, 평균매출, 매장수 등)는 부족
- 55~75점: 구체 수치 다수 + 핵심 팩트 일부 포함, 단 출처 불명확하거나 일반론 섞임
- 80~100점: 검증 가능한 구체 팩트(가맹비, 평균매출, 매장수, 창업비용 등) 다수, 일관되고 명확

반드시 다음 JSON 형식으로만 답하세요:
{"score": 숫자, "reason": "한 줄 사유"}`;

          const judge = await openai.responses.create({
            model: "gpt-5.4-mini",
            instructions: "당신은 엄격한 팩트체크 채점관입니다. 후한 점수를 주지 말고 보수적으로 채점하세요. JSON으로만 답합니다.",
            input: judgePrompt,
          });
          const judgeText = extractText(judge.output ?? []);
          const jsonMatch = judgeText.match(/\{[\s\S]*?\}/);
          if (jsonMatch) {
            const parsed = JSON.parse(jsonMatch[0]) as { score?: number };
            accuracy_score = Math.max(0, Math.min(100, Math.round(parsed.score ?? 0)));
          }
        } catch {
          accuracy_score = 0;
        }
        const hasError = /폐업|문을 닫|없는 브랜드|확인되지 않|정보.*없|찾을 수 없/.test(response);
        mentioned = !hasError && brandVariants.some(v => responseLower.includes(v));
      }

      results.push({
        category: p.category,
        category_label: p.category_label.replace(/\{브랜드명\}/g, brandName).replace(/\{카테고리\}/g, category),
        prompt: p.prompt_text,
        ai_response: response.slice(0, 1500),
        brand_mentioned: mentioned,
        accuracy_score,
      });
    } catch (e) {
      results.push({
        category: p.category,
        category_label: p.category_label.replace(/\{브랜드명\}/g, brandName).replace(/\{카테고리\}/g, category),
        prompt: p.prompt_text,
        ai_response: `[오류] ${e instanceof Error ? e.message : "체크 실패"}`,
        brand_mentioned: false,
        accuracy_score: 0,
      });
    }
  }

  // 요약
  const expResults = results.filter(r => r.category !== "D3");
  const accResults = results.filter(r => r.category === "D3");
  const exposureCount = expResults.filter(r => r.brand_mentioned).length;
  const accuracyCount = accResults.filter(r => r.accuracy_score >= 50).length;

  const summary = {
    total_prompts: results.length,
    exposure_count: exposureCount,
    exposure_rate: expResults.length > 0 ? Math.round((exposureCount / expResults.length) * 100) : 0,
    accuracy_count: accuracyCount,
    accuracy_rate: accResults.length > 0 ? Math.round((accuracyCount / accResults.length) * 100) : 0,
  };

  return NextResponse.json({
    brand_name: brandName,
    category,
    checked_at: new Date().toISOString(),
    summary,
    results,
  });
}
