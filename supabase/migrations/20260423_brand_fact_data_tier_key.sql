-- PR025 — brand_fact_data 에 fact_key · source_tier · period_month 3종 컬럼 추가
-- 기존 로우는 NULL 허용 (점진 마이그레이션). 오공김밥은 backfill 스크립트로 채움.

ALTER TABLE brand_fact_data
  ADD COLUMN IF NOT EXISTS fact_key text,
  ADD COLUMN IF NOT EXISTS source_tier text CHECK (source_tier IN ('A','B','C')),
  ADD COLUMN IF NOT EXISTS period_month text;

CREATE INDEX IF NOT EXISTS idx_brand_fact_data_brand_key
  ON brand_fact_data (brand_id, fact_key, source_tier);
