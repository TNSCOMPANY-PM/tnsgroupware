import { NextResponse } from "next/server";
import { getSessionEmployee, unauthorized } from "@/utils/apiAuth";
import { createAdminClient } from "@/utils/supabase/admin";
import OpenAI from "openai";
import { DOCX_FACT_EXTRACTION_SCHEMA, type FactRecord, type FactLabel, type FactUnit, type FactSourceType } from "@/types/factSchema";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const SYSTEM_PROMPT = `당신은 프랜차이즈 팩트 추출 전문가다. 브랜드 담당자가 정제한 docx 자료에서 수치·팩트만 뽑아낸다.

엄격한 규칙:
1. label 은 반드시 enum 값 중 하나. 다른 이름 절대 금지.
2. 원문에 수치가 없으면 그 항목은 만들지 마라. 추측·보간 금지.
3. "본사 카카오톡 확인", "담당자 구두 확인", "문의 결과" 등 **근거 약한 수치는 추출하지 마라**. 근거가 명시된 수치(브로셔·POS·공정위·기사)만 추출한다.
4. source_type 판별:
   - 원문 근처에 "공정거래위원회", "정보공개서" → "공정위"
   - "POS", "매출 집계", "실거래" → "POS_실거래"
   - "브로셔", "창업 안내", "본사 자료" → "본사_브로셔"
   - 홈페이지 URL/스크린샷 → "공식_홈페이지"
   - "인스타", "페이스북", "공식 SNS" → "공식_SNS"
   - 언론사 기사 링크/매체명 → "언론_보도"
   - HACCP·통계청 등 → "공식_인증" 또는 "정부_통계"
   - 판별 어려우면 "본사_브로셔" 기본값.
5. source_note 에는 원문에 적힌 출처·시점·조건을 최대한 보존하라. 예: "2024년 서울 21개점 평균", "2026.3 POS 집계".
6. value 는 원문 그대로("약 5,210만원"), value_normalized 는 기준 단위 숫자(52100000 원 기준 → unit=원; 또는 5210 → unit=만원).
7. confidence: 원문에 명확히 적힌 수치 0.9+, 추론 섞인 경우 0.6 미만은 추출 생략.

출력: facts 배열만 JSON 으로.`;

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

  const { data: doc } = await supabase
    .from("brand_source_doc")
    .select("markdown_text, file_name")
    .eq("brand_id", brandId)
    .maybeSingle();
  if (!doc || !doc.markdown_text) {
    return NextResponse.json({ error: "docx 먼저 업로드 필요" }, { status: 400 });
  }

  try {
    const result = await openai.chat.completions.create({
      model: "gpt-5.4",
      response_format: { type: "json_schema", json_schema: DOCX_FACT_EXTRACTION_SCHEMA },
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        {
          role: "user",
          content: `브랜드: ${brand.name}\n출처 파일: ${doc.file_name}\n\n[DOCX_MARKDOWN]\n${doc.markdown_text.slice(0, 120_000)}`,
        },
      ],
    });

    const parsed = JSON.parse(result.choices[0]?.message?.content ?? "{}") as {
      facts?: {
        label: FactLabel;
        value: string;
        value_normalized: number | null;
        unit: FactUnit;
        source_type: FactSourceType;
        source_note: string | null;
        confidence: number;
      }[];
    };

    const facts = (parsed.facts ?? []).filter(f => f.confidence >= 0.6);

    // 기존 docx 팩트 삭제 → 새로 삽입 (public_fetch 는 유지)
    await supabase.from("brand_fact_data").delete()
      .eq("brand_id", brandId)
      .eq("provenance", "docx");

    if (facts.length > 0) {
      const rows: Omit<FactRecord, "id" | "created_at">[] = facts.map(f => ({
        brand_id: brandId,
        label: f.label,
        value: f.value,
        value_normalized: f.value_normalized,
        unit: f.unit,
        source_type: f.source_type,
        source_note: f.source_note,
        source_url: null,
        provenance: "docx",
        confidence: f.confidence,
        fetched_at: null,
      }));
      const { error: insertErr } = await supabase.from("brand_fact_data").insert(rows);
      if (insertErr) {
        console.error("[extract-facts] insert 실패:", insertErr);
        return NextResponse.json({ error: insertErr.message }, { status: 500 });
      }
    }

    return NextResponse.json({
      ok: true,
      facts_count: facts.length,
      facts: facts.slice(0, 15),
    });
  } catch (e) {
    console.error("[extract-facts] 추출 실패:", e);
    return NextResponse.json({ error: e instanceof Error ? e.message : "추출 실패" }, { status: 500 });
  }
}
