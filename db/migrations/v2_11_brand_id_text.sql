-- v2-11: brand_facts.brand_id UUID → TEXT (ftc_brands_2024.id 가 integer/serial)
-- 적용: frandoor supabase project (felaezeqnoskkowoqsja)
--
-- 배경:
--   v2-10 옵션 A (UUID PK 유지) 가정 오류. 실제 ftc_brands_2024.id 는 integer.
--   LLM1 upsert 시 "invalid input syntax for type uuid: '1'" 에러.
--
-- 변경:
--   brand_facts.brand_id UUID → TEXT (모든 PK 형태 수용 — int / uuid / hash key 등)
--   unique constraint 재생성 (type 변경 후 자동 유지되긴 하나 명시)

-- 1. brand_id type 변경
ALTER TABLE brand_facts
  ALTER COLUMN brand_id TYPE TEXT USING brand_id::TEXT;

-- 2. unique constraint 재생성
ALTER TABLE brand_facts DROP CONSTRAINT IF EXISTS brand_facts_unique;
ALTER TABLE brand_facts ADD CONSTRAINT brand_facts_unique
  UNIQUE (brand_id, metric_id, period, provenance);

-- 3. 인덱스 재생성
DROP INDEX IF EXISTS idx_brand_facts_brand;
CREATE INDEX idx_brand_facts_brand ON brand_facts(brand_id);

-- (industry_facts 는 brand_id 없음 — 영향 없음)
