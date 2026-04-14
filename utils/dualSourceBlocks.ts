import type { SupabaseClient } from "@supabase/supabase-js";
import type { FactRecord, FactDiff } from "@/types/factSchema";

export type DualSourceBlocks = {
  hasDocx: boolean;
  docxSource: string;          // [DOCX_SOURCE] 블록
  publicFacts: string;          // [PUBLIC_FACTS] 블록
  diffsAuto: string;            // [DIFFS_AUTO] 블록
  docxFactCount: number;
  publicFactCount: number;
  diffCount: number;
};

const SOURCE_LABEL: Record<string, string> = {
  "공정위": "공정거래위원회 정보공개서 기준",
  "본사_브로셔": "본사 공식 브로셔 기준",
  "POS_실거래": "본사 POS 집계 기준",
  "공식_홈페이지": "공식 홈페이지 기준",
  "언론_보도": "언론 보도",
  "정부_통계": "공정거래위원회 가맹사업 통계 기준",
  "공식_SNS": "공식 SNS",
  "공식_인증": "공식 인증기관",
};

export async function loadDualSourceBlocks(
  supabase: SupabaseClient,
  brandId: string,
): Promise<DualSourceBlocks> {
  const [{ data: doc }, { data: factsRaw }, { data: diffsRaw }] = await Promise.all([
    supabase.from("brand_source_doc").select("markdown_text").eq("brand_id", brandId).maybeSingle(),
    supabase.from("brand_fact_data").select("*").eq("brand_id", brandId),
    supabase.from("brand_fact_diffs").select("*").eq("brand_id", brandId),
  ]);

  const facts = (factsRaw ?? []) as FactRecord[];
  const diffs = (diffsRaw ?? []) as FactDiff[];

  const docxFacts = facts.filter(f => f.provenance === "docx");
  const publicFacts = facts.filter(f => f.provenance === "public_fetch");

  const docxSection = doc?.markdown_text
    ? `[DOCX_SOURCE]\n${doc.markdown_text.slice(0, 60_000)}\n[/DOCX_SOURCE]`
    : "[DOCX_SOURCE]\n(docx 원본 없음)\n[/DOCX_SOURCE]";

  const publicBlock = publicFacts.length > 0
    ? publicFacts.map(f => `- ${f.label}: ${f.value} (unit: ${f.unit}, ${SOURCE_LABEL[f.source_type] ?? f.source_type}${f.source_note ? `, ${f.source_note}` : ""}${f.source_url ? `, ${f.source_url}` : ""})`).join("\n")
    : "(public 수집 없음)";

  const diffBlock = diffs.length > 0
    ? diffs.map(d =>
      `### ${d.label} 차이
- ${SOURCE_LABEL[d.docx_source_type] ?? d.docx_source_type}: ${d.docx_value}${d.docx_note ? ` (${d.docx_note})` : ""}
- ${SOURCE_LABEL[d.public_source_type] ?? d.public_source_type}: ${d.public_value}${d.public_note ? ` (${d.public_note})` : ""}
- 차이율: ${(d.diff_ratio * 100).toFixed(1)}%
- 분석: ${d.diff_reason}`,
    ).join("\n\n")
    : "(차이 없음)";

  return {
    hasDocx: !!doc?.markdown_text,
    docxSource: docxSection,
    publicFacts: `[PUBLIC_FACTS]\n${publicBlock}\n[/PUBLIC_FACTS]`,
    diffsAuto: `[DIFFS_AUTO]\n${diffBlock}\n[/DIFFS_AUTO]`,
    docxFactCount: docxFacts.length,
    publicFactCount: publicFacts.length,
    diffCount: diffs.length,
  };
}

export const DUAL_SOURCE_RULES = `
[블로그 작성 규칙 — 이중 소스]

1. [DOCX_SOURCE] 와 [PUBLIC_FACTS] 에 명시된 팩트만 사용하라. 이 두 블록 밖의 수치·주장은 절대 쓰지 마라. GPT 자체 지식으로 업종 평균·통계를 끌어오지 마라.

2. 같은 label 에 대해 두 소스의 수치가 다를 때 ([DIFFS_AUTO] 에 등장하는 label):
   - 두 수치를 모두 제시하라 (예: "공정위 공시 X vs 본사 POS Y")
   - [DIFFS_AUTO] 의 diff_reason 을 "왜 다른가?" 제목의 별도 섹션으로 자연스럽게 포함하라
   - 어느 한쪽이 틀렸다고 단정하지 마라

3. 출처 인용 표기:
   - source_type = "공정위" → "공정거래위원회 정보공개서 기준"
   - source_type = "본사_브로셔" → "본사 공식 브로셔 기준"
   - source_type = "POS_실거래" → "본사 POS 집계 기준"
   - source_type = "정부_통계" → "공정거래위원회 가맹사업 통계 기준"
   - source_type = "언론_보도" → 매체명 명시

4. 웹검색 도구 사용 금지. 이미 수집된 [PUBLIC_FACTS] 만 사용하라.

5. 본문에 등장하는 모든 수치는 [DOCX_SOURCE] 또는 [PUBLIC_FACTS] 의 value 와 정확히 일치해야 한다. 단위 변환만 허용 (만원 ↔ 원 등).
`.trim();
