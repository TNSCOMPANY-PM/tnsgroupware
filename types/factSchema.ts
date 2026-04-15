/**
 * FACT_DUAL_SOURCE 설계 스키마 (2026-04-14).
 * - Private Source (docx 1개) + Public Source (화이트리스트 웹) 이중 구조
 * - 같은 label 에 두 소스 레코드 공존 → 차이 자동 분석
 */

export const FACT_LABEL_ENUM = [
  // 매출·수익
  "연평균매출",
  "월평균매출",
  "최고월매출",
  "영업이익률",
  "순마진율",
  "원가율",
  "당기순이익",

  // 창업비용
  "창업비용총액",
  "가맹비",
  "교육비",
  "보증금",
  "인테리어비",
  "기타창업비용",
  "실투자금",
  "대출가능금액",

  // 가맹사업
  "가맹점수_전체",
  "가맹점수_직영",
  "신규개점수",
  "계약해지수",
  "폐점률",
  "계약기간",

  // 재무 (본사)
  "자산",
  "부채",
  "자본",
  "매출액_본사",

  // 운영
  "적정평수",
  "운영인원",
  "투자회수기간",
  "로열티",
  "자동화",

  // 기타
  "법위반이력",
  "가맹사업개시일",
  "브랜드수",
  "수상",
  "영업지역",
] as const;

export type FactLabel = typeof FACT_LABEL_ENUM[number];

export const FACT_SOURCE_TYPE = [
  "공정위",
  "본사_브로셔",
  "POS_실거래",
  "공식_홈페이지",
  "언론_보도",
  "정부_통계",
  "공식_SNS",
  "공식_인증",
] as const;

export type FactSourceType = typeof FACT_SOURCE_TYPE[number];

export type FactProvenance = "docx" | "public_fetch";

export const FACT_UNIT_ENUM = [
  "만원", "원", "억원", "%", "개", "명", "평", "㎡", "개월", "년", "없음",
] as const;

export type FactUnit = typeof FACT_UNIT_ENUM[number];

export type FactRecord = {
  id?: string;
  brand_id: string;
  label: FactLabel;
  value: string;                   // 원문 그대로의 수치/텍스트
  value_normalized: number | null; // 비교용 정규화 숫자
  unit: FactUnit;
  source_type: FactSourceType;
  source_note: string | null;      // 원문에 있던 출처 메타
  source_url: string | null;
  provenance: FactProvenance;
  confidence: number;              // 0~1
  fetched_at?: string | null;
  created_at?: string;
};

export type FactDiff = {
  id?: string;
  brand_id: string;
  label: FactLabel;
  docx_value: string;
  public_value: string;
  docx_normalized: number | null;
  public_normalized: number | null;
  docx_source_type: FactSourceType;
  public_source_type: FactSourceType;
  docx_note: string | null;
  public_note: string | null;
  diff_ratio: number;
  diff_reason: string;
  diff_status: "confirmed" | "pending" | "dismissed";
  generated_at?: string;
};

export type BrandSourceDoc = {
  brand_id: string;
  file_name: string;
  file_hash: string;
  markdown_text: string;
  uploaded_at?: string;
};

// ── OpenAI Structured Outputs: docx 추출용 ──
export const DOCX_FACT_EXTRACTION_SCHEMA = {
  name: "docx_fact_extraction",
  strict: true,
  schema: {
    type: "object" as const,
    additionalProperties: false,
    required: ["facts"],
    properties: {
      facts: {
        type: "array" as const,
        items: {
          type: "object" as const,
          additionalProperties: false,
          required: ["label", "value", "value_normalized", "unit", "source_type", "source_note", "confidence"],
          properties: {
            label: { type: "string" as const, enum: [...FACT_LABEL_ENUM] },
            value: { type: "string" as const },
            value_normalized: { type: ["number", "null"] as const },
            unit: { type: "string" as const, enum: [...FACT_UNIT_ENUM] },
            source_type: { type: "string" as const, enum: [...FACT_SOURCE_TYPE] },
            source_note: { type: ["string", "null"] as const },
            confidence: { type: "number" as const },
          },
        },
      },
    },
  },
};

// ── OpenAI Structured Outputs: public fetch 추출용 ──
export const PUBLIC_FACT_EXTRACTION_SCHEMA = {
  name: "public_fact_extraction",
  strict: true,
  schema: {
    type: "object" as const,
    additionalProperties: false,
    required: ["facts"],
    properties: {
      facts: {
        type: "array" as const,
        items: {
          type: "object" as const,
          additionalProperties: false,
          required: ["label", "value", "value_normalized", "unit", "source_type", "source_url", "source_note", "confidence"],
          properties: {
            label: { type: "string" as const, enum: [...FACT_LABEL_ENUM] },
            value: { type: "string" as const },
            value_normalized: { type: ["number", "null"] as const },
            unit: { type: "string" as const, enum: [...FACT_UNIT_ENUM] },
            source_type: { type: "string" as const, enum: [...FACT_SOURCE_TYPE] },
            source_url: { type: "string" as const },
            source_note: { type: ["string", "null"] as const },
            confidence: { type: "number" as const },
          },
        },
      },
    },
  },
};

// ── 차이 원인 분석 Structured Output ──
export const DIFF_REASON_SCHEMA = {
  name: "diff_reason",
  strict: true,
  schema: {
    type: "object" as const,
    additionalProperties: false,
    required: ["reason"],
    properties: {
      reason: { type: "string" as const },
    },
  },
};
