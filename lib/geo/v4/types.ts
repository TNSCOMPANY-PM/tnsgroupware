/**
 * v4 — freestyle 모드 (raw 데이터 통째 → sonnet 1회 호출).
 */

export type V4Input = {
  brand_id: string; // geo_brands.id (TNS)
  topic: string;
};

export type RawInputBundle = {
  brand_label: string;
  industry: string;
  industry_sub?: string | null;
  ftc_brand_id: string;
  ftc_row: Record<string, unknown>; // ftc_brands_2024 152 컬럼 raw
  docx_markdown: string | null; // brand_source_doc.markdown_text
  industry_facts: Array<Record<string, unknown>>; // industry_facts 분포
};

export type V4Result = {
  draftId: string | null;
  saveError: string | null;
  title: string;
  content: string;
  lintWarnings: string[];
  ccUnmatched: string[];
};
