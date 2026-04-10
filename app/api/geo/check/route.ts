import { createAdminClient } from "@/utils/supabase/admin";
import { NextResponse } from "next/server";
import { getSessionEmployee, unauthorized } from "@/utils/apiAuth";
import OpenAI from "openai";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const SYSTEM_PROMPT = `You are a helpful assistant. 한국어로 답변하세요.`;

// 팩트 키워드를 DB(fact_data) 또는 홈페이지 크롤링에서 동적으로 가져옴
type FactKeyword = { keyword: string; label: string };

async function getFactKeywords(supabase: ReturnType<typeof createAdminClient>, brandId: string): Promise<FactKeyword[]> {
  const { data: brand } = await supabase.from("geo_brands").select("fact_data, fact_file_url, landing_url").eq("id", brandId).single();
  if (!brand) return [];

  // 1순위: DB에 저장된 fact_data (JSON 배열)
  if (brand.fact_data && Array.isArray(brand.fact_data) && brand.fact_data.length > 0) {
    return brand.fact_data as FactKeyword[];
  }

  // 2순위: 업로드된 팩트 파일에서 키워드 추출 (다중 파일 지원)
  if (brand.fact_file_url) {
    let urls: string[] = [];
    try {
      const parsed = JSON.parse(brand.fact_file_url);
      if (Array.isArray(parsed)) {
        urls = parsed.map((v: string | { url: string }) => typeof v === "string" ? v : v.url);
      }
    } catch { urls = [brand.fact_file_url]; }
    const allKeywords: FactKeyword[] = [];
    for (const fileUrl of urls) {
      if (!fileUrl) continue;
      try {
        const res = await fetch(fileUrl);
        if (res.ok) {
          const text = await res.text();
          const kws = extractKeywordsFromText(text);
          for (const kw of kws) {
            if (!allKeywords.some(k => k.keyword === kw.keyword)) allKeywords.push(kw);
          }
        }
      } catch { /* ignore */ }
    }
    if (allKeywords.length > 0) return allKeywords;
  }

  // 3순위: 공식 홈페이지 크롤링
  if (brand.landing_url) {
    try {
      const res = await fetch(brand.landing_url, { headers: { "User-Agent": "Mozilla/5.0" } });
      if (res.ok) {
        const html = await res.text();
        // HTML 태그 제거
        const text = html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ");
        return extractKeywordsFromText(text);
      }
    } catch { /* ignore */ }
  }

  return [];
}

// 텍스트에서 핵심 수치 키워드 자동 추출
function extractKeywordsFromText(text: string): FactKeyword[] {
  const keywords: FactKeyword[] = [];
  const patterns: { regex: RegExp; label: string }[] = [
    { regex: /총?\s*창업\s*비용\s*[:\s]*약?\s*([\d,]+만\s*원?)/g, label: "총 창업비용" },
    { regex: /실\s*투자\s*금?\s*[:\s]*약?\s*([\d,]+만\s*원?)/g, label: "실투자금" },
    { regex: /(평균\s*)?월\s*매출\s*[:\s]*약?\s*([\d,]+만\s*원?)/g, label: "평균 월매출" },
    { regex: /순\s*마진\s*[:\s]*약?\s*([\d~.]+%)/g, label: "순마진" },
    { regex: /로열티\s*[:\s]*약?\s*([\d,]+만?\s*원?)/g, label: "로열티" },
    { regex: /가맹\s*점\s*수?\s*[:\s]*약?\s*([\d,]+개?)/g, label: "가맹점 수" },
    { regex: /투자\s*회수\s*(기간)?\s*[:\s]*약?\s*([\d~.]+년?개?월?)/g, label: "투자 회수" },
    { regex: /([\d,]+만\s*원)\s*(이하|부터|실투자)/g, label: "비용" },
  ];

  for (const { regex, label } of patterns) {
    let match;
    while ((match = regex.exec(text)) !== null) {
      const kw = match[1] || match[2] || match[0];
      if (kw && !keywords.some(k => k.keyword === kw)) {
        keywords.push({ keyword: kw.trim(), label });
      }
    }
  }

  // 일반 숫자+만원 패턴
  const moneyMatches = text.match(/[\d,]+만\s*원/g) ?? [];
  for (const m of moneyMatches) {
    if (!keywords.some(k => k.keyword === m)) {
      keywords.push({ keyword: m, label: "금액" });
    }
  }

  return keywords.slice(0, 30); // 최대 30개
}

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

  const body = await request.json() as { brand_id: string; run_type?: string };
  if (!body.brand_id) return NextResponse.json({ error: "brand_id required" }, { status: 400 });

  const supabase = createAdminClient();
  const isBefore = body.run_type === "before";
  const modelLabel = isBefore ? "before:gpt-5.4-mini" : "gpt-5.4-mini";

  const { data: brand } = await supabase.from("geo_brands").select("name").eq("id", body.brand_id).single();
  if (!brand) return NextResponse.json({ error: "brand not found" }, { status: 404 });

  const { data: prompts } = await supabase.from("geo_prompts").select("*").eq("brand_id", body.brand_id).order("sort_order");
  if (!prompts || prompts.length === 0) return NextResponse.json({ error: "등록된 프롬프트가 없습니다" }, { status: 400 });

  const { data: run, error: runErr } = await supabase
    .from("geo_check_runs")
    .insert({ brand_id: body.brand_id, total_prompts: prompts.length, model: modelLabel })
    .select()
    .single();

  if (runErr || !run) return NextResponse.json({ error: runErr?.message || "run 생성 실패" }, { status: 500 });

  return NextResponse.json({ run_id: run.id, brand_id: body.brand_id, brand_name: brand.name, prompts });
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
    brand_id: string;
    category?: string;
  };

  const { run_id, prompt_id, prompt_text, brand_name, brand_id, category } = body;
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
      model: "gpt-5.4-mini",
      tools: [{ type: "web_search_preview" as const }],
      instructions: SYSTEM_PROMPT,
      input: prompt_text,
    });
    // output에서 텍스트 추출
    const outputs = result.output ?? [];
    const texts: string[] = [];
    for (const o of outputs) {
      if (o.type === "message" && "content" in o) {
        for (const c of (o as unknown as { content: { type: string; text?: string }[] }).content) {
          if (c.type === "output_text" && c.text) texts.push(c.text);
        }
      }
    }
    response = texts.join("\n");
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
    // D3 정확도 체크 — 팩트 데이터 동적 조회
    const factKeywords = await getFactKeywords(supabase, brand_id);
    if (factKeywords.length > 0) {
      let matchedFacts = 0;
      const matchedLabels: string[] = [];
      for (const fact of factKeywords) {
        if (response.includes(fact.keyword) && !matchedLabels.includes(fact.label)) {
          matchedFacts++;
          matchedLabels.push(fact.label);
        }
      }
      const uniqueLabels = [...new Set(factKeywords.map((f) => f.label))];
      accuracy_score = uniqueLabels.length > 0 ? Math.round((matchedFacts / uniqueLabels.length) * 100) : 0;
    }
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
