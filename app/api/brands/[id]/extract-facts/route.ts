import { NextResponse } from "next/server";
import { getSessionEmployee, unauthorized } from "@/utils/apiAuth";
import { createAdminClient } from "@/utils/supabase/admin";
import { isFrandoorConfigured, createFrandoorClient } from "@/utils/supabase/frandoor";
import { mapFactLabelToMetricId, decideProvenance } from "@/lib/geo/v2/factLabelMap";
import { METRIC_IDS } from "@/lib/geo/v2/metric_ids";
import OpenAI from "openai";
import { DOCX_FACT_EXTRACTION_SCHEMA, type FactRecord, type FactLabel, type FactUnit, type FactSourceType } from "@/types/factSchema";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const SYSTEM_PROMPT = `당신은 프랜차이즈 팩트 추출 전문가다. 브랜드 담당자가 정제한 docx 자료에서 수치·팩트만 뽑아낸다.

엄격한 규칙:
1. label 은 반드시 enum 값 중 하나. 다른 이름 절대 금지.
2. 원문에 수치가 없으면 그 항목은 만들지 마라. 추측·보간 금지.
3. 근거 수준에 따라 confidence 를 다르게 매기되, **본사 구두/카카오톡 확인 수치도 추출 대상에 포함**한다:
   - 공정위 정보공개서·정부 통계·공식 인증 → confidence 0.95
   - 본사 공식 브로셔·창업 안내서·POS 실거래 집계 → confidence 0.85~0.90
   - "본사 확인", "본사 카카오톡 확인", "담당자 확인", "문의 결과" → confidence 0.70~0.75 (원문 표기 그대로 source_note 에 보존, source_type = "본사_브로셔")
   - 출처 완전 불명 → 추출하지 마라
4. source_type 판별:
   - 원문 근처에 "공정거래위원회", "정보공개서" → "공정위"
   - "POS", "매출 집계", "실거래" → "POS_실거래"
   - "브로셔", "창업 안내", "본사 자료", "본사 확인", "본사 카카오톡 확인", "담당자 확인" → "본사_브로셔"
   - 홈페이지 URL/스크린샷 → "공식_홈페이지"
   - "인스타", "페이스북", "공식 SNS" → "공식_SNS"
   - 언론사 기사 링크/매체명 → "언론_보도"
   - HACCP·통계청 등 → "공식_인증" 또는 "정부_통계"
   - 판별 어려우면 "본사_브로셔" 기본값.
5. source_note 에는 원문에 적힌 출처·시점·조건을 최대한 보존하라. 예: "2024년 서울 21개점 평균", "2026.3 POS 집계", "본사 카카오톡 확인 (2026.3)".
6. value 는 원문 그대로("약 5,210만원"), value_normalized 는 기준 단위 숫자(52100000 원 기준 → unit=원; 또는 5210 → unit=만원). 범위값("17~23%") 은 value 에 원문 그대로, value_normalized 는 중앙값(20).
7. confidence 0.6 미만이면 추출 생략.
8. **대출·지원 관련 수치가 2개 이상 등장할 때 (예: "1금융권 5천만원 + 무이자 3천만원", "5천만원 중 3천만원 무이자 선지원")**:
   - 원문 문장을 **통째로** label="대출지원구조_설명", unit="없음" 으로 1건 저장한다. value 에 원문 문장을 그대로 넣고, value_normalized 는 null.
   - 별도로 label="대출가능금액" 은 **총 대출 한도(가장 큰 수치 또는 원문에 "최대"로 표기된 값)** 만 1건 저장. 개별 지원금을 쪼개서 추출하지 마라.
   - 예시: "1금융권 최대 5,000만원 대출 + 본사 무이자 선지원 3,000만원" →
     · 대출지원구조_설명: value="1금융권 최대 5,000만원 대출 중 본사 무이자 선지원 3,000만원 포함"
     · 대출가능금액: value="5,000만원", value_normalized=5000, unit="만원"
   - "5,000만원 + 3,000만원 = 8,000만원" 같은 합산 수치는 절대 만들지 마라. 포함 관계인지 병렬 관계인지 원문으로 판단되지 않으면 **기본 포함 관계**로 가정하고 합산하지 않는다.

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
    .select("name, ftc_brand_id")
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

    let v2Adapted = 0;
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

      // v2-10: brand_facts (frandoor) dual-write — brand_id = geo_brands.ftc_brand_id 통일.
      // ftc 매핑 안 된 geo_brand 는 dual-write skip (글 생성 universe 가 ftc 이므로).
      const ftcBrandIdForFacts = (brand as { ftc_brand_id: string | null }).ftc_brand_id;
      if (isFrandoorConfigured() && ftcBrandIdForFacts) {
        try {
          const fra = createFrandoorClient();
          const period = new Date().toISOString().slice(0, 7); // "YYYY-MM"
          const v2Rows: Array<Record<string, unknown>> = [];
          let csrcCount = 0;
          for (const f of facts) {
            const metric_id = mapFactLabelToMetricId(f.label, f.source_type);
            const meta = metric_id ? METRIC_IDS[metric_id] : null;
            // v3-07: unmapped docx labels (C급 free-form) — 합성 metric_id 로 facts pool 포함.
            //   prefix "_csrc:" 로 stable 한 unique key 보장 (onConflict 에 사용 가능).
            const finalMetricId = metric_id ?? `_csrc:${f.label}`;
            const finalMetricLabel = meta?.label ?? f.label;
            const finalUnit = f.unit !== "없음" ? f.unit : (meta?.unit ?? f.unit);
            const { provenance: prov, source_tier } = decideProvenance("docx", f.source_type);
            if (!metric_id) csrcCount++;
            v2Rows.push({
              brand_id: ftcBrandIdForFacts,
              metric_id: finalMetricId,
              metric_label: finalMetricLabel,
              value_num: f.value_normalized,
              value_text: f.value_normalized == null ? f.value : null,
              unit: finalUnit,
              period,
              provenance: prov,
              source_tier,
              source_url: null,
              source_label: `본사 docx (${doc.file_name}, ${period})${f.source_note ? ` — ${f.source_note}` : ""}`,
              confidence: f.confidence >= 0.85 ? "high" : f.confidence >= 0.7 ? "medium" : "low",
            });
          }
          if (csrcCount > 0) {
            console.log(
              `[extract-facts] v3-07: unmapped C labels ${csrcCount}건 — _csrc: prefix 로 facts pool 포함`,
            );
          }
          if (v2Rows.length > 0) {
            await fra
              .from("brand_facts")
              .delete()
              .eq("brand_id", ftcBrandIdForFacts)
              .eq("provenance", "docx");
            const { error: v2Err } = await fra
              .from("brand_facts")
              .upsert(v2Rows, { onConflict: "brand_id,metric_id,period,provenance" });
            if (v2Err) {
              console.warn("[extract-facts] v2 brand_facts 적재 실패:", v2Err.message);
            } else {
              v2Adapted = v2Rows.length;
            }
          }
        } catch (e) {
          console.warn(
            "[extract-facts] v2 brand_facts dual-write 실패:",
            e instanceof Error ? e.message : e,
          );
        }
      } else if (isFrandoorConfigured() && !ftcBrandIdForFacts) {
        console.warn(
          `[extract-facts] geo_brand=${brandId} 의 ftc_brand_id 미매핑 — v2 brand_facts dual-write skip. ` +
            `우리 고객 등록 시 geo_brands.ftc_brand_id 지정 필요.`,
        );
      }
    }

    return NextResponse.json({
      ok: true,
      facts_count: facts.length,
      v2_adapted: v2Adapted,
      facts: facts.slice(0, 15),
    });
  } catch (e) {
    console.error("[extract-facts] 추출 실패:", e);
    return NextResponse.json({ error: e instanceof Error ? e.message : "추출 실패" }, { status: 500 });
  }
}
