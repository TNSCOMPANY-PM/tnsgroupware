import { createAdminClient } from "@/utils/supabase/admin";
import { NextResponse } from "next/server";
import { getSessionEmployee, unauthorized } from "@/utils/apiAuth";
import OpenAI from "openai";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export async function GET(request: Request) {
  const session = await getSessionEmployee();
  if (!session) return unauthorized();

  const { searchParams } = new URL(request.url);
  const brandId = searchParams.get("brand_id");
  if (!brandId) return NextResponse.json({ error: "brand_id required" }, { status: 400 });

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("geo_check_runs")
    .select("*, geo_check_items(*)")
    .eq("brand_id", brandId)
    .order("run_date", { ascending: false })
    .limit(20);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data ?? []);
}

export async function POST(request: Request) {
  const session = await getSessionEmployee();
  if (!session) return unauthorized();

  const body = await request.json() as { brand_id: string };
  if (!body.brand_id) return NextResponse.json({ error: "brand_id required" }, { status: 400 });

  const supabase = createAdminClient();

  // 브랜드 정보
  const { data: brand } = await supabase.from("geo_brands").select("name").eq("id", body.brand_id).single();
  if (!brand) return NextResponse.json({ error: "brand not found" }, { status: 404 });

  // 프롬프트 목록
  const { data: prompts } = await supabase.from("geo_prompts").select("*").eq("brand_id", body.brand_id).order("sort_order");
  if (!prompts || prompts.length === 0) return NextResponse.json({ error: "등록된 프롬프트가 없습니다" }, { status: 400 });

  // 체크 실행 레코드 생성
  const { data: run, error: runErr } = await supabase
    .from("geo_check_runs")
    .insert({ brand_id: body.brand_id, total_prompts: prompts.length, model: "gpt-4o-mini + web_search + system_prompt" })
    .select()
    .single();

  if (runErr || !run) return NextResponse.json({ error: runErr?.message || "run 생성 실패" }, { status: 500 });

  const brandName = brand.name;
  const brandNameLower = brandName.toLowerCase();
  const brandVariants = [
    brandNameLower,
    brandNameLower.replace(/\s/g, ""),
  ];

  // D0~D2: 노출률 체크 (브랜드 직접 언급 안 하고 질문 → 브랜드 나오는지)
  // D3: 정확도 체크 (브랜드 직접 질문 → 답변이 정확한지)
  const exposurePrompts = prompts.filter((p) => !p.category?.startsWith("D3"));
  const accuracyPrompts = prompts.filter((p) => p.category?.startsWith("D3"));

  // 랜딩 URL에서 참고 데이터 추출 (D3 정확도 체크용)
  // 핵심 키워드: FAQ 문서에서 추출한 주요 수치
  const factKeywords = [
    { keyword: "6,500만", label: "총 창업비용" },
    { keyword: "6500만", label: "총 창업비용" },
    { keyword: "1,500만", label: "실투자금" },
    { keyword: "1500만", label: "실투자금" },
    { keyword: "4,500만", label: "평균 월매출" },
    { keyword: "4500만", label: "평균 월매출" },
    { keyword: "17~23%", label: "순마진" },
    { keyword: "30만원", label: "로열티" },
    { keyword: "10평", label: "매장 규모" },
    { keyword: "3명", label: "운영 인원" },
    { keyword: "3인", label: "운영 인원" },
    { keyword: "50가지", label: "메뉴 수" },
    { keyword: "55개", label: "가맹점 수" },
    { keyword: "자동화", label: "자동화 설비" },
    { keyword: "라이스시트", label: "자동화 설비" },
    { keyword: "1년", label: "투자 회수" },
    { keyword: "오사카", label: "해외 진출" },
  ];

  let mentionedCount = 0;
  let exposureTotal = exposurePrompts.length;
  const items: {
    run_id: string; prompt_id: string; prompt_text: string;
    ai_response: string; mentioned: boolean; accuracy_score: number;
    check_type: string; category: string;
  }[] = [];

  // ── ChatGPT 무료 버전 시뮬레이션 ──
  // 핵심: ChatGPT 웹의 숨겨진 시스템 프롬프트를 최대한 재현
  const CHATGPT_SYSTEM_PROMPT = `You are ChatGPT, a large language model trained by OpenAI.
You are chatting with a user in Korean. Always respond in Korean.

When answering questions, follow these rules:
1. 웹 검색이 필요한 질문이면 반드시 최신 정보를 검색해서 답변하세요.
2. 프랜차이즈, 창업, 비용 등 실제 데이터가 필요한 질문에는 구체적인 숫자와 브랜드명을 포함하세요.
3. 여러 브랜드를 비교할 때는 각 브랜드의 창업비용, 월매출, 가맹점 수 등을 구체적으로 제시하세요.
4. 답변은 구조화해서 읽기 쉽게 작성하세요 (번호, 소제목, 이모지 활용).
5. 출처가 있으면 반드시 명시하세요.
6. 최신 정보를 우선하고, 오래된 정보는 날짜를 표기하세요.
7. 사용자가 일반적인 질문을 해도 관련 브랜드의 구체적 데이터를 포함해서 실용적으로 답하세요.
8. 공정거래위원회 가맹사업 정보공개서, 실제 매출 데이터, 언론 보도 등 신뢰할 수 있는 출처를 우선 인용하세요.`;

  async function askWithWebSearch(question: string): Promise<string> {
    const result = await openai.responses.create({
      model: "gpt-4o-mini",
      instructions: CHATGPT_SYSTEM_PROMPT,
      input: question,
      tools: [{ type: "web_search_preview" as const }],
    });
    const msg = result.output.find((o: { type: string }) => o.type === "message");
    if (msg && "content" in msg && Array.isArray(msg.content)) {
      return msg.content.map((c: { type: string; text?: string }) => c.type === "output_text" ? c.text ?? "" : "").join("");
    }
    return "";
  }

  // ── D0~D2: 노출률 체크 ──
  for (const prompt of exposurePrompts) {
    try {
      const response = await askWithWebSearch(prompt.prompt_text);
      const responseLower = response.toLowerCase();
      const mentioned = brandVariants.some((v) => responseLower.includes(v));
      if (mentioned) mentionedCount++;

      // 노출 시 부가 점수
      let accuracy = 0;
      if (mentioned) {
        accuracy += 50;
        if (/\d{3,}/.test(response)) accuracy += 20;
        if (/추천|좋은|인기|성공|높은/.test(response)) accuracy += 15;
        if (/만원|억|매출|가맹|창업비/.test(response)) accuracy += 15;
      }

      items.push({
        run_id: run.id, prompt_id: prompt.id, prompt_text: prompt.prompt_text,
        ai_response: response, mentioned, accuracy_score: Math.min(accuracy, 100),
        check_type: "exposure", category: prompt.category ?? "",
      });
    } catch (e) {
      items.push({
        run_id: run.id, prompt_id: prompt.id, prompt_text: prompt.prompt_text,
        ai_response: `[오류] ${e instanceof Error ? e.message : "알 수 없는 오류"}`,
        mentioned: false, accuracy_score: 0, check_type: "exposure", category: prompt.category ?? "",
      });
    }
    await new Promise((r) => setTimeout(r, 500));
  }

  // ── D3: 정확도 체크 ──
  for (const prompt of accuracyPrompts) {
    try {
      const response = await askWithWebSearch(prompt.prompt_text);

      // 팩트 키워드 매칭으로 정확도 계산
      let matchedFacts = 0;
      const matchedLabels: string[] = [];
      for (const fact of factKeywords) {
        if (response.includes(fact.keyword) && !matchedLabels.includes(fact.label)) {
          matchedFacts++;
          matchedLabels.push(fact.label);
        }
      }
      // 정확도: 매칭된 팩트 / 전체 고유 팩트 라벨 수
      const uniqueLabels = [...new Set(factKeywords.map((f) => f.label))];
      const accuracy = Math.round((matchedFacts / uniqueLabels.length) * 100);

      // 명백한 오류 감지 (부정확한 수치)
      const hasError = /폐업|문을 닫|없는 브랜드|확인되지 않|정보.*없/.test(response);

      items.push({
        run_id: run.id, prompt_id: prompt.id, prompt_text: prompt.prompt_text,
        ai_response: response,
        mentioned: !hasError, // D3는 "정확한 답변 여부"
        accuracy_score: hasError ? 0 : accuracy,
        check_type: "accuracy", category: prompt.category ?? "",
      });
    } catch (e) {
      items.push({
        run_id: run.id, prompt_id: prompt.id, prompt_text: prompt.prompt_text,
        ai_response: `[오류] ${e instanceof Error ? e.message : "알 수 없는 오류"}`,
        mentioned: false, accuracy_score: 0, check_type: "accuracy", category: prompt.category ?? "",
      });
    }
    await new Promise((r) => setTimeout(r, 500));
  }

  // 결과 저장
  await supabase.from("geo_check_items").insert(items);

  const exposureScore = exposureTotal > 0 ? Math.round((mentionedCount / exposureTotal) * 100) : 0;
  const accuracyItems = items.filter((i) => i.check_type === "accuracy");
  const avgAccuracy = accuracyItems.length > 0 ? Math.round(accuracyItems.reduce((s, i) => s + i.accuracy_score, 0) / accuracyItems.length) : 0;

  await supabase.from("geo_check_runs").update({
    mentioned_count: mentionedCount,
    score: exposureScore,
  }).eq("id", run.id);

  return NextResponse.json({
    id: run.id,
    exposure_score: exposureScore,
    accuracy_score: avgAccuracy,
    total_prompts: prompts.length,
    exposure_prompts: exposureTotal,
    mentioned_count: mentionedCount,
    items,
  });
}

export async function DELETE(request: Request) {
  const session = await getSessionEmployee();
  if (!session) return unauthorized();

  const { searchParams } = new URL(request.url);
  const runId = searchParams.get("run_id");
  if (!runId) return NextResponse.json({ error: "run_id required" }, { status: 400 });

  const supabase = createAdminClient();
  await supabase.from("geo_check_items").delete().eq("run_id", runId);
  const { error } = await supabase.from("geo_check_runs").delete().eq("id", runId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
