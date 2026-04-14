import { createAdminClient } from "@/utils/supabase/admin";
import { NextResponse } from "next/server";
import { getSessionEmployee, unauthorized } from "@/utils/apiAuth";
import OpenAI from "openai";
import Anthropic from "@anthropic-ai/sdk";
import { buildPrompt, buildBrandDataFromFacts, type Channel, type ReaderStage, type SearchIntent, type OfficialData } from "@/utils/promptBuilder";
import { loadDualSourceBlocks, DUAL_SOURCE_RULES } from "@/utils/dualSourceBlocks";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// Claude 호출
async function callClaude(prompt: string, platform: string): Promise<string> {
  const systemByPlatform: Record<string, string> = {
    naver: `You are a professional blog content writer. 한국어로 작성.

CRITICAL RULES:
1. Respond ONLY with a single JSON object. No text before or after the JSON.
2. The "content" field must contain PLAIN TEXT ONLY. NO HTML tags whatsoever.
   No <table>, <div>, <p>, <h2>, <strong>, <br> or any other HTML tag.
   Use text markers (★, ■, ▶, |) for structure. Line breaks via \\n.
3. Follow the [OUTPUT FORMAT] and [STRUCTURE] exactly as specified in the user prompt.
4. NEVER use markdown syntax (##, **, -, etc.) either.`,
    medium: `You are a franchise industry analyst writing in English for Medium.

CRITICAL RULES:
1. Respond ONLY with a single JSON object. No text before or after the JSON.
2. The "content" field MUST be written ENTIRELY IN ENGLISH. Not Korean.
3. Use HTML tags (<h2>, <p>, <table>) for formatting.
4. Translate all Korean data to English. Include ₩ KRW and ~$USD for all amounts.
5. Follow the [OUTPUT FORMAT] and [STRUCTURE] exactly as specified in the user prompt.`,
  };

  const defaultSystem = `You are a professional blog content writer. 한국어로 작성.

CRITICAL RULES:
1. Respond ONLY with a single JSON object. No text before or after the JSON.
2. The "content" field MUST contain HTML, NOT markdown. Use <h2>, <p>, <div>, <table> tags.
3. For frandoor/tistory channels: Use the og-wrap component classes (answer-box, info-box, stat-row, faq-item, conclusion-box, disclaimer, etc.) as specified in the prompt.
4. NEVER use markdown syntax (##, **, -, etc.) inside the "content" field. Only HTML tags.
5. Follow the [OUTPUT FORMAT] and [STRUCTURE] exactly as specified in the user prompt.`;

  const res = await anthropic.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 16000,
    messages: [{ role: "user", content: prompt }],
    system: systemByPlatform[platform] ?? defaultSystem,
  });
  return res.content[0]?.type === "text" ? res.content[0].text : "";
}

// OpenAI 호출 (웹검색 포함)
async function callOpenAI(prompt: string, withSearch = true): Promise<string> {
  const result = await openai.responses.create({
    model: "gpt-5.4",
    tools: withSearch ? [{ type: "web_search_preview" as const }] : [],
    instructions: "You are a blog content generation AI. Respond ONLY with valid JSON. Follow the [OUTPUT FORMAT] exactly.",
    input: prompt,
  });
  const texts: string[] = [];
  for (const o of result.output ?? []) {
    if (o.type === "message" && "content" in o) {
      for (const c of (o as unknown as { content: { type: string; text?: string }[] }).content) {
        if (c.type === "output_text" && c.text) texts.push(c.text);
      }
    }
  }
  return texts.join("\n");
}

// 1단계: GPT 웹검색으로 공정위 공식 데이터 수집
async function fetchOfficialData(brandName: string): Promise<OfficialData | null> {
  try {
    const prompt = `"${brandName}" 프랜차이즈에 대해 공정거래위원회 정보공개서, 통계청, 한국프랜차이즈산업협회 공식 자료에서 아래 항목을 검색하여 JSON으로 반환.
찾을 수 없는 항목은 null. 수치를 지어내지 말 것. 타 브랜드 정보는 검색하지 말 것.

{"source_year":"기준연도","stores_total":가맹점수,"avg_monthly_revenue":평균매출만원,"cost_total":창업총비용만원,"franchise_fee":가맹금만원,"education_fee":교육비만원,"deposit":보증금만원,"closure_rate":폐점률퍼센트,"industry_avg_revenue":동종업종평균매출만원,"industry_avg_cost":동종업종평균창업비용만원,"sources":["참조URL"]}
JSON만 출력.`;

    const raw = await callOpenAI(prompt, true);
    const match = raw.match(/\{[\s\S]*\}/);
    if (!match) return null;
    return JSON.parse(match[0]) as OfficialData;
  } catch (e) {
    console.error("[blog-generate] 공정위 데이터 수집 실패:", e instanceof Error ? e.message : e);
    return null;
  }
}

export async function POST(request: Request) {
  const session = await getSessionEmployee();
  if (!session) return unauthorized();

  const body = await request.json() as {
    brand_id: string;
    platform: Channel;
    topic: string;
    reader_stage?: ReaderStage;
    search_intent?: SearchIntent;
    provider?: "openai" | "gemini" | "claude";
    ref_links?: string[];
    other_channels_titles?: string[];
  };

  if (!body.brand_id || !body.platform || !body.topic?.trim()) {
    return NextResponse.json({ error: "brand_id, platform, topic 필수" }, { status: 400 });
  }

  const supabase = createAdminClient();
  const { data: brand } = await supabase
    .from("geo_brands")
    .select("name, landing_url, fact_file_url, fact_data")
    .eq("id", body.brand_id)
    .single();

  if (!brand) return NextResponse.json({ error: "브랜드를 찾을 수 없습니다" }, { status: 404 });

  // fact_data에서 BrandData 구조 생성
  const allFacts = (brand.fact_data && Array.isArray(brand.fact_data)) ? brand.fact_data as { label: string; keyword: string }[] : [];
  const INTERNAL_LABELS = ["__raw_text__", "__blog_ref_links__", "__brand_plan__", "__brand_images__", "__official_data__"];
  const factKeywords = allFacts.filter(d => !INTERNAL_LABELS.includes(d.label));
  const rawTextEntry = allFacts.find(d => d.label === "__raw_text__");
  const rawText = rawTextEntry ? rawTextEntry.keyword : undefined;
  const brandData = buildBrandDataFromFacts(brand.name, factKeywords, brand.landing_url, rawText);

  // 브랜드 이미지 URL 목록 추출
  const imageEntry = (brand.fact_data ?? []).find((d: { label: string }) => d.label === "__brand_images__");
  let imageUrls: { url: string; name: string }[] = [];
  if (imageEntry) {
    try { imageUrls = JSON.parse((imageEntry as { keyword: string }).keyword); } catch { /* ignore */ }
  }

  // 참고 블로그 톤·구조 분석
  let refAnalysis = "";
  const refLinks = (body.ref_links ?? []).filter(l => l.trim());
  if (refLinks.length > 0) {
    try {
      const refInput = refLinks.map((url, i) => `${i + 1}. ${url}`).join("\n");
      const refRaw = await callOpenAI(`아래 블로그 글들을 읽고 분석해주세요:
${refInput}

분석 항목:
1. 말투/톤 특성 (존댓말 vs 반말, 딱딱함 vs 친근함, 문장 길이, 호흡)
2. 글 구조 (소제목 패턴, 문단 길이, 도입부 스타일)
3. 핵심 기법 (숫자 제시 방식, 강조 방식, 독자 참여 유도 방식)
4. 이 톤으로 글을 쓰려면 지켜야 할 규칙 5가지

텍스트로만 정리해주세요. JSON 아닙니다.`, true);
      refAnalysis = refRaw.slice(0, 4000);
    } catch (e) {
      console.error("[blog-generate] 참고 블로그 분석 실패:", e instanceof Error ? e.message : e);
    }
  }

  // 프롬프트 빌드
  const readerStage = body.reader_stage ?? "decision";
  const searchIntent = body.search_intent ?? "transactional";
  // 공정위 데이터: DB 캐시 우선, 없으면 웹검색
  let officialData: OfficialData | null = null;
  const officialEntry = allFacts.find(d => d.label === "__official_data__");
  if (officialEntry) {
    try { officialData = JSON.parse(officialEntry.keyword) as OfficialData; } catch { /* ignore */ }
  }
  if (!officialData) {
    officialData = await fetchOfficialData(brand.name);
  }

  // ── 이중 소스 블록 (brand_source_doc 이 있으면 새 시스템) ──
  const dual = await loadDualSourceBlocks(supabase, body.brand_id);
  const useDualSource = dual.hasDocx;

  let prompt = buildPrompt(body.platform, brandData, readerStage, searchIntent, body.topic.trim(), officialData ?? undefined);

  if (useDualSource) {
    prompt += `\n\n${dual.docxSource}\n\n${dual.publicFacts}\n\n${dual.diffsAuto}\n\n${DUAL_SOURCE_RULES}`;
    if (dual.diffCount > 0) {
      prompt += `\n\n[필수 섹션] [DIFFS_AUTO] 에 나열된 ${dual.diffCount}개 항목 각각에 대해 "왜 다른가?" 소제목의 별도 섹션을 본문에 반드시 포함하라.`;
    }
  }

  if (refAnalysis) {
    prompt += `\n\n[REFERENCE TONE — 아래 분석 결과의 말투·구조를 반드시 반영]\n${refAnalysis}`;
  }

  // 다른 채널에서 이미 생성된 제목이 있으면 중복 회피 지시 추가
  const otherTitles = (body.other_channels_titles ?? []).filter(t => t.trim());
  if (otherTitles.length > 0) {
    prompt += `\n\n[중복 회피 — 다른 채널에서 이미 발행된 글 제목]
아래 제목들과 절대 겹치지 않는 제목·소제목·도입부를 사용하세요.
같은 수치를 쓰더라도 관점과 서술 방식을 완전히 다르게 하세요.
${otherTitles.map((t, i) => `${i + 1}. ${t}`).join("\n")}`;
  }

  // 브랜드 이미지 URL을 프롬프트에 추가
  if (imageUrls.length > 0) {
    prompt += `\n\n[BRAND IMAGES — 아래 이미지를 본문에 적절히 삽입. <!-- IMAGE --> 주석 대신 실제 <img> 태그 사용]
${imageUrls.map((img, i) => `${i + 1}. ${img.name}: ${img.url}`).join("\n")}

이미지 삽입 규칙:
- HTML 본문에 <img src="이미지URL" alt="${brand.name} ${imageUrls[0]?.name ?? ""}" style="width:100%;border-radius:8px;margin:16px 0"> 형태로 삽입
- 최소 2장, 최대 ${imageUrls.length}장 사용
- 첫 이미지는 본문 상단(제목 아래), 나머지는 섹션 사이에 배치
- 네이버 블로그용은 [이미지: 설명] 대신 실제 URL 사용`;
  }

  try {
    const provider = body.provider ?? "claude";
    if (provider === "gemini") {
      return NextResponse.json({ error: "Gemini 프로바이더는 아직 지원하지 않습니다" }, { status: 400 });
    }
    // 이중 소스 모드는 웹검색 금지 — 이미 수집된 PUBLIC_FACTS 만 사용
    const raw = provider === "claude" ? await callClaude(prompt, body.platform) : await callOpenAI(prompt, !useDualSource);

    let parsed;
    try {
      const jsonMatch = raw.match(/```json\s*([\s\S]*?)```/) || raw.match(/\{[\s\S]*\}/);
      if (!jsonMatch) throw new Error("No JSON found in AI response");
      parsed = JSON.parse(jsonMatch[1] || jsonMatch[0]);
    } catch (parseErr) {
      console.error("AI JSON 파싱 실패:", parseErr instanceof Error ? parseErr.message : parseErr, "raw 앞 200자:", raw.slice(0, 200));
      return NextResponse.json({ error: "AI 응답을 파싱할 수 없습니다. 다시 시도해주세요.", raw_preview: raw.slice(0, 300) }, { status: 502 });
    }

    return NextResponse.json({
      ...parsed,
      provider,
      platform: body.platform,
      brand_name: brand.name,
      reader_stage: readerStage,
      search_intent: searchIntent,
    });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "AI 호출 실패" }, { status: 500 });
  }
}
