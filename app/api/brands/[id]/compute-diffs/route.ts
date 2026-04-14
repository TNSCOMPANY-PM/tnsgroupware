import { NextResponse } from "next/server";
import { getSessionEmployee, unauthorized } from "@/utils/apiAuth";
import { createAdminClient } from "@/utils/supabase/admin";
import { type FactRecord, type FactLabel, type FactSourceType } from "@/types/factSchema";
import { generateDiffReason } from "@/utils/diffReasonGenerator";

const DIFF_THRESHOLD = 0.05;

// 공식/공신력 소스 (diff 의 "public" 측)
const OFFICIAL_SOURCES: FactSourceType[] = ["공정위", "정부_통계", "공식_인증"];
// 로컬/본사 소스 (diff 의 "docx" 측)
const LOCAL_SOURCES: FactSourceType[] = ["POS_실거래", "본사_브로셔", "공식_홈페이지", "공식_SNS", "언론_보도"];

function classify(st: FactSourceType): "official" | "local" {
  return OFFICIAL_SOURCES.includes(st) ? "official" : "local";
}

/**
 * 같은 label 내 "공식 소스" vs "로컬 소스" 수치 비교.
 * 공식: 공정위/정부_통계/공식_인증. 로컬: POS/브로셔/홈페이지/SNS/언론.
 * 두 측 모두 있고 5% 이상 차이면 GPT 로 diff_reason 생성 후 brand_fact_diffs 에 기록.
 * provenance 는 무관 — source_type 기준으로 분할 (docx 에 공정위 인용 + POS 수치 공존 케이스 대응).
 */
export async function POST(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const session = await getSessionEmployee();
  if (!session) return unauthorized();

  const { id: brandId } = await context.params;
  const supabase = createAdminClient();

  const { data: allFacts } = await supabase
    .from("brand_fact_data")
    .select("*")
    .eq("brand_id", brandId);
  if (!allFacts) return NextResponse.json({ ok: true, diffs_count: 0 });

  const facts = allFacts as FactRecord[];

  // label 별로 공식/로컬 측 best record 를 선정 (confidence 최고)
  const officialByLabel = new Map<FactLabel, FactRecord>();
  const localByLabel = new Map<FactLabel, FactRecord>();

  for (const f of facts) {
    const side = classify(f.source_type);
    const m = side === "official" ? officialByLabel : localByLabel;
    const existing = m.get(f.label);
    if (!existing || f.confidence > existing.confidence) m.set(f.label, f);
  }

  // compute-diffs 호환을 위해 기존 변수명 유지 (public=공식측, docx=로컬측)
  const docxByLabel = localByLabel;
  const publicByLabel = officialByLabel;

  // docx 원문 로드 (diff_reason 분석용 발췌)
  const { data: doc } = await supabase
    .from("brand_source_doc")
    .select("markdown_text")
    .eq("brand_id", brandId)
    .maybeSingle();
  const docxText = doc?.markdown_text ?? "";

  type DiffRow = {
    brand_id: string;
    label: FactLabel;
    docx_value: string;
    public_value: string;
    docx_normalized: number | null;
    public_normalized: number | null;
    docx_source_type: string;
    public_source_type: string;
    docx_note: string | null;
    public_note: string | null;
    diff_ratio: number;
    diff_reason: string;
    diff_status: "pending";
    generated_at: string;
  };
  const diffsToWrite: DiffRow[] = [];
  const labelsToRemove: FactLabel[] = [];

  for (const [label, d] of docxByLabel) {
    const p = publicByLabel.get(label);
    if (!p) { labelsToRemove.push(label); continue; }

    if (d.value_normalized == null || p.value_normalized == null) {
      // 정규화 값 없으면 문자열 일치 여부로만 판단
      if (d.value.trim() === p.value.trim()) { labelsToRemove.push(label); continue; }
    } else {
      const maxAbs = Math.max(Math.abs(d.value_normalized), Math.abs(p.value_normalized));
      if (maxAbs === 0) { labelsToRemove.push(label); continue; }
      const ratio = Math.abs(d.value_normalized - p.value_normalized) / maxAbs;
      if (ratio < DIFF_THRESHOLD) { labelsToRemove.push(label); continue; }
    }

    // label 주변 docx 발췌
    const idx = docxText.indexOf(label);
    const excerpt = idx >= 0
      ? docxText.slice(Math.max(0, idx - 500), Math.min(docxText.length, idx + 1500))
      : docxText.slice(0, 2000);

    let reason = "";
    try {
      reason = await generateDiffReason(d, p, excerpt);
    } catch (e) {
      console.error(`[compute-diffs] ${label} reason 생성 실패:`, e);
      reason = "차이 원인 분석 생성 실패";
    }

    const ratio = (d.value_normalized != null && p.value_normalized != null)
      ? Math.abs(d.value_normalized - p.value_normalized) / Math.max(Math.abs(d.value_normalized), Math.abs(p.value_normalized))
      : 1;

    diffsToWrite.push({
      brand_id: brandId,
      label,
      docx_value: d.value,
      public_value: p.value,
      docx_normalized: d.value_normalized,
      public_normalized: p.value_normalized,
      docx_source_type: d.source_type,
      public_source_type: p.source_type,
      docx_note: d.source_note,
      public_note: p.source_note,
      diff_ratio: ratio,
      diff_reason: reason,
      diff_status: "pending",
      generated_at: new Date().toISOString(),
    });
  }

  // 기존 diffs 제거 후 새로 삽입 (label 단위)
  if (labelsToRemove.length > 0) {
    await supabase.from("brand_fact_diffs").delete()
      .eq("brand_id", brandId)
      .in("label", labelsToRemove);
  }
  if (diffsToWrite.length > 0) {
    await supabase.from("brand_fact_diffs").delete()
      .eq("brand_id", brandId)
      .in("label", diffsToWrite.map(d => d.label));
    const { error } = await supabase.from("brand_fact_diffs").insert(diffsToWrite);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    diffs_count: diffsToWrite.length,
    cleared: labelsToRemove.length,
    diffs: diffsToWrite.map(d => ({ label: d.label, docx: d.docx_value, public: d.public_value, ratio: d.diff_ratio })),
  });
}
