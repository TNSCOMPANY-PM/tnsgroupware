import { createAdminClient } from "@/utils/supabase/admin";
import { NextResponse } from "next/server";
import { getSessionEmployee, unauthorized } from "@/utils/apiAuth";
import OpenAI from "openai";
import { parseFile } from "@/utils/fileParser";
import { extractFactsFromLargeText } from "@/utils/factExtractor";
import { validateFacts } from "@/utils/factValidator";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

type FactFile = { url: string; name: string };

export async function POST(request: Request) {
  const session = await getSessionEmployee();
  if (!session) return unauthorized();

  const body = await request.json() as { brand_id: string };
  if (!body.brand_id) return NextResponse.json({ error: "brand_id required" }, { status: 400 });

  const supabase = createAdminClient();
  const { data: brand } = await supabase
    .from("geo_brands")
    .select("name, fact_file_url, landing_url, fact_data")
    .eq("id", body.brand_id)
    .single();

  if (!brand) return NextResponse.json({ error: "브랜드 없음" }, { status: 404 });

  // 1. 업로드된 파일에서 텍스트 추출 (Phase 2: fileParser 사용)
  let files: FactFile[] = [];
  if (brand.fact_file_url) {
    try {
      const parsed = JSON.parse(brand.fact_file_url);
      if (Array.isArray(parsed)) {
        files = parsed.map((v: string | FactFile) => typeof v === "string" ? { url: v, name: "" } : v);
      }
    } catch {
      if (brand.fact_file_url) files = [{ url: brand.fact_file_url, name: "" }];
    }
  }

  const extractedTexts: { text: string; source: string }[] = [];
  for (const f of files) {
    try {
      const text = await parseFile(f.url, f.name);
      if (text && text.length > 100) {
        extractedTexts.push({ text, source: f.name || "파일" });
      }
    } catch (e) {
      console.error(`[extract-facts] 파일 파싱 실패: ${f.name}`, e instanceof Error ? e.message : e);
    }
  }

  // 2. 홈페이지 랜딩 URL 텍스트 추가
  if (brand.landing_url) {
    try {
      const res = await fetch(brand.landing_url);
      if (res.ok) {
        const html = await res.text();
        const text = html
          .replace(/<script[\s\S]*?<\/script>/g, "")
          .replace(/<style[\s\S]*?<\/style>/g, "")
          .replace(/<[^>]+>/g, " ")
          .replace(/\s+/g, " ")
          .trim();
        if (text.length > 500) {
          extractedTexts.push({ text: text.slice(0, 50000), source: "홈페이지" });
        }
      }
    } catch { /* ignore */ }
  }

  // 3. 공정위 웹검색 (별도 1회)
  let officialSearchText = "";
  try {
    const result = await openai.responses.create({
      model: "gpt-5.4-mini",
      tools: [{ type: "web_search_preview" as const }],
      instructions: "공정위 정보공개서 수치만 텍스트로 정리. 출처 URL 명시. 한국어.",
      input: `"${brand.name}" 프랜차이즈 공정거래위원회 정보공개서 최신 데이터 검색. 가맹점 수, 창업비용, 평균매출, 폐점률 등.`,
    });
    for (const o of result.output ?? []) {
      if (o.type === "message" && "content" in o) {
        for (const c of (o as unknown as { content: { type: string; text?: string }[] }).content) {
          if (c.type === "output_text" && c.text) officialSearchText += c.text + "\n";
        }
      }
    }
  } catch (e) {
    console.error("[extract-facts] 공정위 웹검색 실패:", e instanceof Error ? e.message : e);
  }

  if (officialSearchText) {
    extractedTexts.push({ text: officialSearchText, source: "공정위 웹검색" });
  }

  if (extractedTexts.length === 0) {
    return NextResponse.json({ ok: true, keywords_count: 0, message: "추출할 텍스트가 없습니다" });
  }

  // 4. 전체 텍스트 합치기
  const mergedText = extractedTexts.map(t => `[출처: ${t.source}]\n${t.text}`).join("\n\n===\n\n");

  // 5. 맵-리듀스 추출 (Phase 5: 대용량 파일 대응)
  try {
    const extracted = await extractFactsFromLargeText(brand.name, mergedText, "통합");

    // 6. 검증 (Phase 4)
    const validationIssues = validateFacts(extracted.keywords);

    // 7. DB 저장
    const PRESERVE_LABELS = ["__blog_ref_links__", "__brand_plan__", "__brand_images__"];
    const preserved = (brand.fact_data && Array.isArray(brand.fact_data))
      ? (brand.fact_data as { label: string; keyword: string }[]).filter(d => PRESERVE_LABELS.includes(d.label))
      : [];

    const officialEntry = extracted.official_data && (extracted.official_data as Record<string, unknown>).stores_total != null
      ? [{ keyword: JSON.stringify(extracted.official_data), label: "__official_data__" }]
      : [];

    const factData = [
      ...extracted.keywords.map(k => ({ keyword: k.keyword, label: k.label })),
      { keyword: extracted.raw_text, label: "__raw_text__" },
      ...officialEntry,
      ...preserved,
    ];

    await supabase.from("geo_brands").update({ fact_data: factData }).eq("id", body.brand_id);

    return NextResponse.json({
      ok: true,
      keywords_count: extracted.keywords.length,
      chunks_processed: extracted.chunks_processed,
      has_official_data: !!extracted.official_data,
      validation_issues: validationIssues,
      keywords: extracted.keywords.slice(0, 15),
    });
  } catch (e) {
    console.error("[extract-facts] 추출 실패:", e);
    return NextResponse.json({ error: `팩트 추출 실패: ${e instanceof Error ? e.message : ""}` }, { status: 500 });
  }
}
