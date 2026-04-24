-- PR033: C급 (본사 POS) v2 스키마.
-- frandoor_brand_facts 파생지표 컬럼 확장 + 신규 frandoor_store_records (점포 익명 레코드).

-- T5.1 파생지표 컬럼
ALTER TABLE frandoor_brand_facts
  ADD COLUMN IF NOT EXISTS seasonal_peak_month text,
  ADD COLUMN IF NOT EXISTS seasonal_trough_month text,
  ADD COLUMN IF NOT EXISTS seasonal_ratio numeric(5,2),
  ADD COLUMN IF NOT EXISTS yoy_growth numeric(5,2),
  ADD COLUMN IF NOT EXISTS qoq_growth numeric(5,2),
  ADD COLUMN IF NOT EXISTS survival_rate_12m numeric(5,2),
  ADD COLUMN IF NOT EXISTS survival_rate_24m numeric(5,2),
  ADD COLUMN IF NOT EXISTS multi_store_owner_pct numeric(5,2);

-- T5.2 점포 익명 레코드 (A지점/B지점 라벨링, 실명 DB 저장 금지)
CREATE TABLE IF NOT EXISTS frandoor_store_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id uuid NOT NULL REFERENCES geo_brands(id) ON DELETE CASCADE,
  display_label text NOT NULL,
  revenue_tier text NOT NULL CHECK (revenue_tier IN ('A','B','C')),
  region_major text,
  location_type text,
  area_tier text,
  opened_at date,
  closed_at date,
  monthly_series jsonb NOT NULL DEFAULT '[]'::jsonb,
  UNIQUE(brand_id, display_label)
);
CREATE INDEX IF NOT EXISTS idx_frandoor_store_records_brand
  ON frandoor_store_records(brand_id);

-- 실행: Supabase SQL Editor 에 위 문장 붙여넣어 Run.
