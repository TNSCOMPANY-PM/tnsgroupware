-- v5-12 — 예약 발행 A+C 모드 확장.
-- frandoor_blog_schedules: mode 컬럼 + brand_id 컬럼 추가. industry NULL 허용.
-- mode='a_only' → industry 필수 / brand_id NULL
-- mode='a_plus_c' → brand_id 필수 (geo_brands FK) / industry NULL
--
-- ⚠️ 사용자 직접 실행.

BEGIN;

ALTER TABLE frandoor_blog_schedules
  ADD COLUMN IF NOT EXISTS mode text NOT NULL DEFAULT 'a_only',
  ADD COLUMN IF NOT EXISTS brand_id uuid REFERENCES geo_brands(id);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'frandoor_blog_schedules_mode_check'
  ) THEN
    ALTER TABLE frandoor_blog_schedules
      ADD CONSTRAINT frandoor_blog_schedules_mode_check
      CHECK (mode IN ('a_only', 'a_plus_c'));
  END IF;
END $$;

ALTER TABLE frandoor_blog_schedules ALTER COLUMN industry DROP NOT NULL;

CREATE INDEX IF NOT EXISTS idx_schedules_brand_id
  ON frandoor_blog_schedules (brand_id) WHERE brand_id IS NOT NULL;

COMMIT;
