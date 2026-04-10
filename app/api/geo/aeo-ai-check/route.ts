import { createAdminClient } from "@/utils/supabase/admin";
import { NextResponse } from "next/server";
import { getSessionEmployee, unauthorized } from "@/utils/apiAuth";
import OpenAI from "openai";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const OUR_DOMAINS = [
  "frandoor.co.kr", "frandoor",
  "50gimbab.frandoor.co.kr", "hanshinudong.frandoor.co.kr", "jangsajang.frandoor.co.kr",
];

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

// POST: AEO 체크 실행 — 구글/네이버 AI 답변에 우리 콘텐츠 인용 여부
export async function POST(request: Request) {
  const session = await getSessionEmployee();
  if (!session) return unauthorized();

  const body = await request.json() as {
    brand_id: string;
    platform: "google" | "naver";
  };

  const supabase = createAdminClient();

  const { data: brand } = await supabase
    .from("geo_brands")
    .select("name, landing_url")
    .eq("id", body.brand_id)
    .single();

  if (!brand) return NextResponse.json({ error: "브랜드 없음" }, { status: 404 });

  // SEO 키워드 공유 (aeo_keywords 테이블)
  const { data: keywords } = await supabase
    .from("aeo_keywords")
    .select("*")
    .eq("brand_id", body.brand_id)
    .order("sort_order");

  if (!keywords || keywords.length === 0) {
    return NextResponse.json({ error: "등록된 키워드가 없습니다. SEO 체크 탭에서 키워드를 먼저 등록하세요." }, { status: 400 });
  }

  const checkDomains = [...OUR_DOMAINS];
  if (brand.landing_url) {
    const domain = brand.landing_url.replace(/https?:\/\//, "").replace(/\/$/, "");
    if (!checkDomains.includes(domain)) checkDomains.push(domain);
  }

  const platform = body.platform ?? "google";
  const results: {
    keyword: string;
    keyword_id: string;
    platform: string;
    cited: boolean;
    our_mentions: string[];
    ai_summary: string;
    source_urls: string[];
  }[] = [];

  for (const kw of keywords) {
    try {
      const query = platform === "google"
        ? `"${kw.keyword}" 키워드를 Google에서 검색했을 때, Google AI Overview(AI 요약)에 어떤 내용이 나오는지 확인해주세요.
AI Overview에서 인용하는 출처 URL 목록을 모두 알려주세요.
특히 다음 도메인이 인용되었는지 확인: ${checkDomains.join(", ")}
결과를 이렇게 정리:
1. AI Overview 요약 내용 (있으면)
2. 인용된 출처 URL 전체 목록
3. 위 도메인 중 인용된 것이 있으면 명시`
        : `"${kw.keyword}" 키워드를 네이버에서 검색했을 때, 네이버 AI 답변(CLOVA X 기반)에 어떤 내용이 나오는지 확인해주세요.
AI 답변에서 인용하는 블로그/웹페이지 URL을 알려주세요.
특히 다음 도메인이 인용되었는지 확인: ${checkDomains.join(", ")}
결과를 이렇게 정리:
1. AI 답변 요약 내용 (있으면)
2. 인용된 출처 URL 목록
3. 위 도메인 중 인용된 것이 있으면 명시`;

      const result = await openai.responses.create({
        model: "gpt-5.4-mini",
        tools: [{ type: "web_search_preview" as const }],
        instructions: "웹 검색으로 실제 검색 결과를 확인하고 정확하게 전달하세요. 한국어로 답변.",
        input: query,
      });

      const raw = extractText(result.output ?? []);
      const rawLower = raw.toLowerCase();

      // 우리 도메인 인용 확인
      const ourMentions = checkDomains.filter(d => rawLower.includes(d.toLowerCase()));

      // URL 추출
      const urlPattern = /https?:\/\/[^\s)"\]<>]+/g;
      const allUrls = raw.match(urlPattern) ?? [];

      results.push({
        keyword: kw.keyword,
        keyword_id: kw.id,
        platform,
        cited: ourMentions.length > 0,
        our_mentions: ourMentions,
        ai_summary: raw.slice(0, 1500),
        source_urls: allUrls.slice(0, 10),
      });
    } catch (e) {
      results.push({
        keyword: kw.keyword,
        keyword_id: kw.id,
        platform,
        cited: false,
        our_mentions: [],
        ai_summary: `[오류] ${e instanceof Error ? e.message : "체크 실패"}`,
        source_urls: [],
      });
    }
  }

  const citedCount = results.filter(r => r.cited).length;
  const score = keywords.length > 0 ? Math.round((citedCount / keywords.length) * 100) : 0;

  // DB 저장
  await supabase.from("aeo_check_runs").insert({
    brand_id: body.brand_id,
    platform: `aeo_${platform}`,
    total_keywords: keywords.length,
    cited_count: citedCount,
    score,
    results: JSON.stringify(results),
  });

  return NextResponse.json({
    brand_name: brand.name,
    platform,
    total_keywords: keywords.length,
    cited_count: citedCount,
    score,
    results,
  });
}
