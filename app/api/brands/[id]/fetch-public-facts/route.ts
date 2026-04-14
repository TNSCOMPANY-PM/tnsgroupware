import { NextResponse } from "next/server";
import { getSessionEmployee, unauthorized } from "@/utils/apiAuth";
import { createAdminClient } from "@/utils/supabase/admin";
import OpenAI from "openai";
import {
  PUBLIC_FACT_EXTRACTION_SCHEMA,
  FACT_LABEL_ENUM,
  type FactRecord,
  type FactLabel,
  type FactUnit,
  type FactSourceType,
} from "@/types/factSchema";
import { PUBLIC_SOURCE_WHITELIST, isWhitelistedUrl } from "@/utils/publicSourceWhitelist";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const DOMAIN_LIST = PUBLIC_SOURCE_WHITELIST.join(", ");

const SEARCH_INSTRUCTIONS = `당신은 프랜차이즈 팩트 수집 전문가다. 공신력 있는 공개 자료에서만 수치를 가져온다.

반드시 아래 도메인만 참고하라 (다른 도메인 인용 시 결과 무시됨):
${DOMAIN_LIST}

각 수치마다 출처 URL 을 명시하라. 출처 불명확한 수치는 반환하지 마라.`;

const EXTRACTION_SYSTEM = `아래 웹검색 결과에서 프랜차이즈 팩트를 Structured Outputs 로 추출하라.

규칙:
1. label 은 enum 값만. 다른 이름 금지.
2. 원문에 없는 수치 금지. 추측·보간 금지.
3. source_url 은 검색 결과에 실제로 등장한 URL 이어야 한다.
4. source_type 판별:
   - franchise.ftc.go.kr / ftc.go.kr → "공정위"
   - kosis.kr / kostat.go.kr / data.go.kr → "정부_통계"
   - 언론 도메인 → "언론_보도"
   - haccp.or.kr → "공식_인증"
5. source_note 에 수치의 기준(연도·표본·범위) 을 보존하라.
6. value 는 원문 표기 그대로, value_normalized 는 기준 단위 숫자.`;

export async function POST(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const session = await getSessionEmployee();
  if (!session) return unauthorized();

  const { id: brandId } = await context.params;
  const supabase = createAdminClient();

  const { data: brand } = await supabase
    .from("geo_brands")
    .select("name")
    .eq("id", brandId)
    .single();
  if (!brand) return NextResponse.json({ error: "브랜드 없음" }, { status: 404 });

  const targetLabels = [...FACT_LABEL_ENUM].join(", ");
  const searchInput = `"${brand.name}" 프랜차이즈에 대해 다음 항목들의 최신 공식 수치를 수집하라:
${targetLabels}

각 항목마다 출처 URL, 기준 연도/시점, 표본 범위를 명시하라. 찾지 못한 항목은 생략.`;

  // Step 1: 화이트리스트 웹검색
  let searchOutput = "";
  const citationUrls: string[] = [];
  try {
    const result = await openai.responses.create({
      model: "gpt-5.4",
      tools: [{ type: "web_search_preview" as const }],
      instructions: SEARCH_INSTRUCTIONS,
      input: searchInput,
    });
    for (const o of result.output ?? []) {
      if (o.type === "message" && "content" in o) {
        type ContentItem = {
          type: string;
          text?: string;
          annotations?: { type: string; url?: string }[];
        };
        for (const c of (o as unknown as { content: ContentItem[] }).content) {
          if (c.type === "output_text" && c.text) {
            searchOutput += c.text + "\n";
          }
          for (const ann of c.annotations ?? []) {
            if (ann.type === "url_citation" && ann.url) citationUrls.push(ann.url);
          }
        }
      }
    }
  } catch (e) {
    console.error("[fetch-public-facts] 웹검색 실패:", e);
    return NextResponse.json({ error: "웹검색 실패: " + (e instanceof Error ? e.message : "") }, { status: 500 });
  }

  if (!searchOutput.trim()) {
    return NextResponse.json({ ok: true, facts_count: 0, message: "공개 자료에서 수치를 찾지 못함" });
  }

  // Step 2: Structured Outputs 로 정제
  let rawFacts: {
    label: FactLabel;
    value: string;
    value_normalized: number | null;
    unit: FactUnit;
    source_type: FactSourceType;
    source_url: string;
    source_note: string | null;
    confidence: number;
  }[] = [];
  try {
    const extract = await openai.chat.completions.create({
      model: "gpt-5.4",
      response_format: { type: "json_schema", json_schema: PUBLIC_FACT_EXTRACTION_SCHEMA },
      messages: [
        { role: "system", content: EXTRACTION_SYSTEM },
        {
          role: "user",
          content: `브랜드: ${brand.name}\n\n[WEB_SEARCH_OUTPUT]\n${searchOutput.slice(0, 30_000)}\n\n[CITATION_URLS]\n${citationUrls.join("\n")}`,
        },
      ],
    });
    const parsed = JSON.parse(extract.choices[0]?.message?.content ?? "{}") as { facts?: typeof rawFacts };
    rawFacts = parsed.facts ?? [];
  } catch (e) {
    console.error("[fetch-public-facts] 정제 실패:", e);
    return NextResponse.json({ error: "추출 실패" }, { status: 500 });
  }

  // Step 3: 화이트리스트 guard — 비화이트리스트 URL 드롭
  const facts = rawFacts.filter(f => {
    if (f.confidence < 0.6) return false;
    if (!isWhitelistedUrl(f.source_url)) {
      console.warn(`[fetch-public-facts] 화이트리스트 외 URL 드롭: ${f.source_url}`);
      return false;
    }
    return true;
  });

  // 기존 public_fetch 팩트 삭제 → 새로 삽입 (docx 는 유지)
  await supabase.from("brand_fact_data").delete()
    .eq("brand_id", brandId)
    .eq("provenance", "public_fetch");

  if (facts.length > 0) {
    const rows: Omit<FactRecord, "id" | "created_at">[] = facts.map(f => ({
      brand_id: brandId,
      label: f.label,
      value: f.value,
      value_normalized: f.value_normalized,
      unit: f.unit,
      source_type: f.source_type,
      source_note: f.source_note,
      source_url: f.source_url,
      provenance: "public_fetch",
      confidence: f.confidence,
      fetched_at: new Date().toISOString(),
    }));
    const { error: insertErr } = await supabase.from("brand_fact_data").insert(rows);
    if (insertErr) return NextResponse.json({ error: insertErr.message }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    facts_count: facts.length,
    dropped_non_whitelist: rawFacts.length - facts.length,
    citation_urls: citationUrls.filter(isWhitelistedUrl),
    facts: facts.slice(0, 15),
  });
}
