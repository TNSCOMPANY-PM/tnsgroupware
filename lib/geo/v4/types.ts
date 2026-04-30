/**
 * v4 — freestyle 모드 (raw 데이터 통째 → sonnet 1회 호출).
 */

export type V4Input = {
  brand_id: string; // geo_brands.id (TNS)
  topic: string;
};

/** v4-02: docx 정제 fact (brand_fact_data row). */
export type DocxFact = {
  label: string; // 본사 docx 한글 라벨 (예: "월평균매출")
  value_num: number | null;
  value_text: string | null; // free-form (예: "1금융권 최대 5,000만원 + 무이자 3,000만원")
  unit: string | null;
  source_label: string | null;
  source_type: string | null;
};

export type RawInputBundle = {
  brand_label: string;
  industry: string;
  industry_sub?: string | null;
  ftc_brand_id: string;
  ftc_row: Record<string, unknown>; // ftc_brands_2024 152 컬럼 raw
  docx_facts: DocxFact[]; // v4-02: brand_fact_data WHERE provenance='docx'
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

/**
 * v4-07 — Phase A 가 DB meta.plan_json 에 저장. Part1/Part2 가 reload 해서 사용.
 */
export type V4PlanJson = {
  brand_label: string;
  industry: string;
  industry_sub: string | null;
  ftc_brand_id: string;
  filtered_ftc_row: Record<string, unknown>;
  docx_facts: DocxFact[];
  industry_facts: Array<Record<string, unknown>>;
  selected_columns: string[];
  topic: string;
  today: string;
  hasDocx: boolean;
};

export type V4PhaseAResult = {
  draftId: string;
  plan: V4PlanJson;
};

export type V4PartResult = {
  draftId: string;
  content_part: string;
};
