-- v2-01: brand_facts / industry_facts schema
-- 적용 대상: frandoor supabase project (felaezeqnoskkowoqsja)
-- 안전성: 기존 ftc_brands_2024 / fact_records / 다른 테이블 영향 없음 (CREATE IF NOT EXISTS)

-- 1. brand_facts (brand 별 raw + derived fact)
CREATE TABLE IF NOT EXISTS brand_facts (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id        UUID NOT NULL,                      -- geo_brands.id (tnsgroupware) 참조 — FK 없음 (cross-db)
  metric_id       TEXT NOT NULL,                      -- 표준 metric ID (lib/geo/v2/metric_ids.ts)
  metric_label    TEXT NOT NULL,                      -- 한글 라벨
  value_num       NUMERIC,                            -- 숫자 값
  value_text      TEXT,                               -- 비숫자 값
  unit            TEXT,                               -- "만원" | "개" | "%" | 빈 string 등
  period          TEXT,                               -- "2024-12" | "2026-04"
  provenance      TEXT NOT NULL CHECK (provenance IN ('ftc', 'docx', 'kosis', 'frandoor_derived')),
  source_tier     CHAR(1) NOT NULL CHECK (source_tier IN ('A', 'B', 'C')),
  source_url      TEXT,
  source_label    TEXT,                               -- 본문 인용 시 라벨 (예: "공정위 정보공개서 (2024-12 기준)")
  confidence      TEXT NOT NULL DEFAULT 'high' CHECK (confidence IN ('high', 'medium', 'low')),
  formula         TEXT,                               -- frandoor_derived 일 때 산식
  inputs          JSONB,                              -- frandoor_derived 일 때 input 변수
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT brand_facts_unique UNIQUE (brand_id, metric_id, period, provenance)
);
CREATE INDEX IF NOT EXISTS idx_brand_facts_brand ON brand_facts(brand_id);
CREATE INDEX IF NOT EXISTS idx_brand_facts_metric ON brand_facts(metric_id);
CREATE INDEX IF NOT EXISTS idx_brand_facts_provenance ON brand_facts(provenance);

-- 2. industry_facts (외식 15 업종 평균/분포)
CREATE TABLE IF NOT EXISTS industry_facts (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  industry        TEXT NOT NULL,                      -- "분식" | "치킨" | "피자" 등 외식 15개 카테고리
  metric_id       TEXT NOT NULL,
  metric_label    TEXT NOT NULL,
  value_num       NUMERIC NOT NULL,
  unit            TEXT,
  period          TEXT NOT NULL,                      -- "2024-12"
  n               INTEGER NOT NULL,                   -- 표본 brand 수
  agg_method      TEXT NOT NULL CHECK (agg_method IN ('trimmed_mean_5pct', 'mean', 'median', 'p25', 'p50', 'p75', 'p90', 'p95')),
  source_label    TEXT,                               -- "공정위 정보공개서 2024-12 (분식 524 brand 집계)"
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT industry_facts_unique UNIQUE (industry, metric_id, period, agg_method)
);
CREATE INDEX IF NOT EXISTS idx_industry_facts_industry ON industry_facts(industry);
CREATE INDEX IF NOT EXISTS idx_industry_facts_metric ON industry_facts(metric_id);

-- 3. updated_at 트리거 (brand_facts 만 — industry_facts 는 batch 재생성이라 불필요)
CREATE OR REPLACE FUNCTION update_brand_facts_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_brand_facts_updated_at ON brand_facts;
CREATE TRIGGER trg_brand_facts_updated_at
  BEFORE UPDATE ON brand_facts
  FOR EACH ROW EXECUTE FUNCTION update_brand_facts_updated_at();
