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
    .insert({ brand_id: body.brand_id, total_prompts: prompts.length, model: "gpt-4o-mini" })
    .select()
    .single();

  if (runErr || !run) return NextResponse.json({ error: runErr?.message || "run 생성 실패" }, { status: 500 });

  const brandName = brand.name;
  const brandNameLower = brandName.toLowerCase();
  // 브랜드명 변형 (오공김밥 → 오공, 50gimbab 등)
  const brandVariants = [
    brandNameLower,
    brandNameLower.replace(/\s/g, ""),
  ];

  let mentionedCount = 0;
  const items: {
    run_id: string; prompt_id: string; prompt_text: string;
    ai_response: string; mentioned: boolean; accuracy_score: number;
  }[] = [];

  for (const prompt of prompts) {
    try {
      const completion = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [{ role: "user", content: prompt.prompt_text }],
        max_tokens: 1000,
        temperature: 0.7,
      });

      const response = completion.choices[0]?.message?.content ?? "";
      const responseLower = response.toLowerCase();

      // 브랜드 언급 여부
      const mentioned = brandVariants.some((v) => responseLower.includes(v));
      if (mentioned) mentionedCount++;

      // 정확도 점수 (0~100): 브랜드 언급 + 정량 데이터 포함 여부
      let accuracy = 0;
      if (mentioned) {
        accuracy += 50;
        // 숫자가 포함되어 있으면 (창업비용, 매출 등)
        if (/\d{3,}/.test(response)) accuracy += 20;
        // 긍정적 추천인 경우
        if (/추천|좋은|인기|성공|높은/.test(response)) accuracy += 15;
        // 구체적 정보 (비용, 매출, 가맹점 수 등)
        if (/만원|억|매출|가맹|창업비/.test(response)) accuracy += 15;
      }

      items.push({
        run_id: run.id,
        prompt_id: prompt.id,
        prompt_text: prompt.prompt_text,
        ai_response: response,
        mentioned,
        accuracy_score: Math.min(accuracy, 100),
      });
    } catch (e) {
      items.push({
        run_id: run.id,
        prompt_id: prompt.id,
        prompt_text: prompt.prompt_text,
        ai_response: `[오류] ${e instanceof Error ? e.message : "알 수 없는 오류"}`,
        mentioned: false,
        accuracy_score: 0,
      });
    }

    // rate limit 방지: 프롬프트 간 1초 대기
    await new Promise((r) => setTimeout(r, 1000));
  }

  // 결과 저장
  await supabase.from("geo_check_items").insert(items);

  const score = prompts.length > 0 ? Math.round((mentionedCount / prompts.length) * 100) : 0;
  await supabase.from("geo_check_runs").update({ mentioned_count: mentionedCount, score }).eq("id", run.id);

  return NextResponse.json({
    id: run.id,
    score,
    total_prompts: prompts.length,
    mentioned_count: mentionedCount,
    items,
  });
}
