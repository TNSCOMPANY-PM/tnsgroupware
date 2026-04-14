-- FACT_DUAL_SOURCE 스키마 (2026-04-14)
-- docx 단일 소스 + 공정위/정부 통계 public 소스 이중 구조.

-- 1. brand_source_doc : docx 원본 (브랜드당 1개, 덮어쓰기)
CREATE TABLE IF NOT EXISTS brand_source_doc (
  brand_id UUID PRIMARY KEY REFERENCES geo_brands(id) ON DELETE CASCADE,
  file_name TEXT NOT NULL,
  file_hash TEXT NOT NULL,
  markdown_text TEXT NOT NULL,
  uploaded_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. brand_fact_data : 라벨별 팩트 레코드 (docx + public_fetch 공존)
CREATE TABLE IF NOT EXISTS brand_fact_data (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id UUID NOT NULL REFERENCES geo_brands(id) ON DELETE CASCADE,
  label TEXT NOT NULL,
  value TEXT NOT NULL,
  value_normalized NUMERIC,
  unit TEXT NOT NULL,
  source_type TEXT NOT NULL,
  source_note TEXT,
  source_url TEXT,
  provenance TEXT NOT NULL CHECK (provenance IN ('docx', 'public_fetch')),
  confidence NUMERIC NOT NULL DEFAULT 0.8 CHECK (confidence >= 0 AND confidence <= 1),
  fetched_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_brand_fact_data_brand ON brand_fact_data (brand_id);
CREATE INDEX IF NOT EXISTS idx_brand_fact_data_brand_label ON brand_fact_data (brand_id, label);
CREATE INDEX IF NOT EXISTS idx_brand_fact_data_provenance ON brand_fact_data (brand_id, provenance);

-- 3. brand_fact_diffs : 교차 대조로 발견된 라벨별 차이 + 자동 분석 문구
CREATE TABLE IF NOT EXISTS brand_fact_diffs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id UUID NOT NULL REFERENCES geo_brands(id) ON DELETE CASCADE,
  label TEXT NOT NULL,
  docx_value TEXT NOT NULL,
  public_value TEXT NOT NULL,
  docx_normalized NUMERIC,
  public_normalized NUMERIC,
  docx_source_type TEXT NOT NULL,
  public_source_type TEXT NOT NULL,
  docx_note TEXT,
  public_note TEXT,
  diff_ratio NUMERIC NOT NULL,
  diff_reason TEXT NOT NULL,
  diff_status TEXT NOT NULL DEFAULT 'pending' CHECK (diff_status IN ('confirmed', 'pending', 'dismissed')),
  generated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_brand_fact_diffs_brand_label ON brand_fact_diffs (brand_id, label);
CREATE INDEX IF NOT EXISTS idx_brand_fact_diffs_status ON brand_fact_diffs (diff_status);
