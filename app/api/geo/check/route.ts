import { createAdminClient } from "@/utils/supabase/admin";
import { NextResponse } from "next/server";
import { getSessionEmployee, unauthorized } from "@/utils/apiAuth";
import OpenAI from "openai";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

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

const FACT_KEYWORDS = [
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

// GET: 체크 기록 목록
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

// POST: run 생성만 (프롬프트 목록 반환)
export async function POST(request: Request) {
  const session = await getSessionEmployee();
  if (!session) return unauthorized();

  const body = await request.json() as { brand_id: string };
  if (!body.brand_id) return NextResponse.json({ error: "brand_id required" }, { status: 400 });

  const supabase = createAdminClient();

  const { data: brand } = await supabase.from("geo_brands").select("name").eq("id", body.brand_id).single();
  if (!brand) return NextResponse.json({ error: "brand not found" }, { status: 404 });

  const { data: prompts } = await supabase.from("geo_prompts").select("*").eq("brand_id", body.brand_id).order("sort_order");
  if (!prompts || prompts.length === 0) return NextResponse.json({ error: "등록된 프롬프트가 없습니다" }, { status: 400 });

  const { data: run, error: runErr } = await supabase
    .from("geo_check_runs")
    .insert({ brand_id: body.brand_id, total_prompts: prompts.length, model: "gpt-4o-mini + web_search" })
    .select()
    .single();

  if (runErr || !run) return NextResponse.json({ error: runErr?.message || "run 생성 실패" }, { status: 500 });

  return NextResponse.json({ run_id: run.id, brand_name: brand.name, prompts });
}

// PUT: 단일 프롬프트 실행 (프론트에서 하나씩 호출)
export async function PUT(request: Request) {
  const session = await getSessionEmployee();
  if (!session) return unauthorized();

  const body = await request.json() as {
    run_id: string;
    prompt_id: string;
    prompt_text: string;
    brand_name: string;
    category?: string;
  };

  const { run_id, prompt_id, prompt_text, brand_name, category } = body;
  if (!run_id || !prompt_id || !prompt_text) {
    return NextResponse.json({ error: "run_id, prompt_id, prompt_text required" }, { status: 400 });
  }

  const supabase = createAdminClient();
  const brandNameLower = brand_name.toLowerCase();
  const brandVariants = [brandNameLower, brandNameLower.replace(/\s/g, "")];
  const isExposure = !category?.startsWith("D3");

  let response = "";
  let mentioned = false;
  let accuracy_score = 0;

  try {
    const result = await openai.responses.create({
      model: "gpt-4o-mini",
      instructions: CHATGPT_SYSTEM_PROMPT,
      input: prompt_text,
      tools: [{ type: "web_search_preview" as const }],
    });
    const msg = result.output.find((o: { type: string }) => o.type === "message");
    if (msg && "content" in msg && Array.isArray(msg.content)) {
      response = msg.content.map((c: { type: string; text?: string }) => c.type === "output_text" ? c.text ?? "" : "").join("");
    }
  } catch (e) {
    response = `[오류] ${e instanceof Error ? e.message : "알 수 없는 오류"}`;
  }

  const responseLower = response.toLowerCase();

  if (isExposure) {
    mentioned = brandVariants.some((v) => responseLower.includes(v));
    if (mentioned) {
      accuracy_score += 50;
      if (/\d{3,}/.test(response)) accuracy_score += 20;
      if (/추천|좋은|인기|성공|높은/.test(response)) accuracy_score += 15;
      if (/만원|억|매출|가맹|창업비/.test(response)) accuracy_score += 15;
      accuracy_score = Math.min(accuracy_score, 100);
    }
  } else {
    // D3 정확도 체크
    let matchedFacts = 0;
    const matchedLabels: string[] = [];
    for (const fact of FACT_KEYWORDS) {
      if (response.includes(fact.keyword) && !matchedLabels.includes(fact.label)) {
        matchedFacts++;
        matchedLabels.push(fact.label);
      }
    }
    const uniqueLabels = [...new Set(FACT_KEYWORDS.map((f) => f.label))];
    accuracy_score = Math.round((matchedFacts / uniqueLabels.length) * 100);
    const hasError = /폐업|문을 닫|없는 브랜드|확인되지 않|정보.*없/.test(response);
    mentioned = !hasError;
    if (hasError) accuracy_score = 0;
  }

  const item = {
    run_id, prompt_id, prompt_text, ai_response: response,
    mentioned, accuracy_score,
    check_type: isExposure ? "exposure" : "accuracy",
    category: category ?? "",
  };

  await supabase.from("geo_check_items").insert(item);

  return NextResponse.json(item);
}

// PATCH: run 최종 점수 업데이트
export async function PATCH(request: Request) {
  const session = await getSessionEmployee();
  if (!session) return unauthorized();

  const body = await request.json() as { run_id: string };
  if (!body.run_id) return NextResponse.json({ error: "run_id required" }, { status: 400 });

  const supabase = createAdminClient();
  const { data: items } = await supabase.from("geo_check_items").select("*").eq("run_id", body.run_id);

  const exposureItems = (items ?? []).filter((i: { check_type: string }) => i.check_type !== "accuracy");
  const mentionedCount = exposureItems.filter((i: { mentioned: boolean }) => i.mentioned).length;
  const score = exposureItems.length > 0 ? Math.round((mentionedCount / exposureItems.length) * 100) : 0;

  await supabase.from("geo_check_runs").update({ mentioned_count: mentionedCount, score }).eq("id", body.run_id);

  return NextResponse.json({ score, mentioned_count: mentionedCount });
}

// DELETE: 기록 삭제
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
