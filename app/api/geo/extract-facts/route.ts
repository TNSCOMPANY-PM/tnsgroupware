import { createAdminClient } from "@/utils/supabase/admin";
import { NextResponse } from "next/server";
import { getSessionEmployee, unauthorized } from "@/utils/apiAuth";
import OpenAI from "openai";

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
    .select("name, fact_file_url, landing_url")
    .eq("id", body.brand_id)
    .single();

  if (!brand) return NextResponse.json({ error: "브랜드 없음" }, { status: 404 });

  // 1. 업로드된 파일에서 텍스트 추출
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

  const extractedTexts: string[] = [];

  for (const f of files) {
    const contentType = f.name.split(".").pop()?.toLowerCase() ?? "";
    try {
      if (["txt", "csv"].includes(contentType)) {
        // 텍스트 파일: 직접 읽기
        const res = await fetch(f.url);
        if (res.ok) extractedTexts.push(await res.text());
      } else if (contentType === "pdf") {
        // PDF: GPT 비전으로 텍스트 추출 (URL 전달)
        const result = await openai.responses.create({
          model: "gpt-5.4-mini",
          input: [
            {
              role: "user",
              content: [
                { type: "input_file", file_url: f.url },
                { type: "input_text", text: "이 문서의 내용을 빠짐없이 텍스트로 추출해주세요. 표는 마크다운 표로, 수치는 정확하게 옮겨주세요. 추가 설명 없이 원문 텍스트만 출력하세요." },
              ],
            },
          ],
        });
        for (const o of result.output ?? []) {
          if (o.type === "message" && "content" in o) {
            for (const c of (o as unknown as { content: { type: string; text?: string }[] }).content) {
              if (c.type === "output_text" && c.text) extractedTexts.push(c.text);
            }
          }
        }
      } else {
        // docx, xlsx 등: 텍스트로 시도
        const res = await fetch(f.url);
        if (res.ok) {
          const text = await res.text();
          const ctrl = (text.slice(0, 500).match(/[\x00-\x08\x0E-\x1F]/g) ?? []).length;
          if (ctrl < 5) extractedTexts.push(text);
        }
      }
    } catch { /* skip */ }
  }

  // 2. 공정위 정보공개서 + 공식 자료 검색
  let officialData = "";
  try {
    const result = await openai.responses.create({
      model: "gpt-5.4-mini",
      tools: [{ type: "web_search_preview" as const }],
      instructions: "한국어로 답변. 검색 결과만 정리.",
      input: `"${brand.name}" 프랜차이즈 공정거래위원회 정보공개서 데이터를 검색해주세요.
다음 정보를 찾아 정리:
- 총 창업비용 (가맹비, 교육비, 인테리어, 장비, 보증금 등 상세)
- 평균 월매출, 평균 영업이익
- 가맹점 수 (연도별)
- 면적당 투자비용
- 로열티/광고비
- 계약기간, 영업지역 보장

또한 "${brand.name}" 관련 공시자료, 뉴스, 공식 발표 수치도 포함.
출처(URL)를 반드시 명시.

텍스트로만 정리해주세요.`,
    });
    for (const o of result.output ?? []) {
      if (o.type === "message" && "content" in o) {
        for (const c of (o as unknown as { content: { type: string; text?: string }[] }).content) {
          if (c.type === "output_text" && c.text) officialData += c.text + "\n";
        }
      }
    }
  } catch { /* skip */ }

  // 3. 전체 텍스트 합치기
  const allText = [
    ...extractedTexts,
    officialData ? `\n[공정위/공식자료]\n${officialData}` : "",
  ].filter(Boolean).join("\n\n").slice(0, 30000); // 최대 3만자

  // 4. GPT로 핵심 팩트 키워드 구조화
  let factKeywords: { keyword: string; label: string }[] = [];
  if (allText.length > 0) {
    try {
      const result = await openai.chat.completions.create({
        model: "gpt-5.4-mini",
        messages: [
          { role: "system", content: "프랜차이즈 팩트 데이터 추출 전문가. JSON으로만 응답." },
          { role: "user", content: `아래 텍스트에서 "${brand.name}" 관련 핵심 팩트 데이터를 추출하세요.

수치, 비용, 매출, 가맹점 수, 기간 등 구체적 데이터를 추출합니다.

JSON 형식:
{"keywords": [{"keyword": "정확한 수치/텍스트", "label": "항목명"}, ...], "raw_text": "핵심 내용 요약 (2000자 이내)"}

텍스트:
${allText.slice(0, 15000)}` },
        ],
      });
      const raw = result.choices[0]?.message?.content ?? "";
      const jsonMatch = raw.match(/```json\s*([\s\S]*?)```/) || raw.match(/\{[\s\S]*\}/);
      const parsed = JSON.parse(jsonMatch ? (jsonMatch[1] || jsonMatch[0]) : raw);
      factKeywords = parsed.keywords ?? [];

      // 기존 fact_data에서 보존할 항목 (__blog_ref_links__ 등)
      const { data: currentBrand } = await supabase.from("geo_brands").select("fact_data").eq("id", body.brand_id).single();
      const preserved = (currentBrand?.fact_data && Array.isArray(currentBrand.fact_data))
        ? currentBrand.fact_data.filter((d: { label: string }) => d.label === "__blog_ref_links__")
        : [];

      // 새 팩트 데이터 = 추출된 키워드 + raw_text + 보존 항목
      const factData = [
        ...factKeywords,
        { keyword: parsed.raw_text ?? allText.slice(0, 3000), label: "__raw_text__" },
        ...preserved,
      ];

      await supabase.from("geo_brands").update({ fact_data: factData }).eq("id", body.brand_id);

      return NextResponse.json({
        ok: true,
        keywords_count: factKeywords.length,
        raw_text_length: (parsed.raw_text ?? "").length,
        has_official_data: officialData.length > 0,
        keywords: factKeywords.slice(0, 10),
      });
    } catch (e) {
      return NextResponse.json({ error: `팩트 추출 실패: ${e instanceof Error ? e.message : ""}` }, { status: 500 });
    }
  }

  return NextResponse.json({ ok: true, keywords_count: 0, message: "추출할 텍스트가 없습니다" });
}
