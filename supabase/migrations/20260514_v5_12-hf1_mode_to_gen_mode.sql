-- v5-12 hf1 — frandoor_blog_schedules.mode → gen_mode rename.
--
-- 이유: PostgreSQL 의 `mode` 가 ordered-set aggregate function 이라
-- PostgREST 가 `select=*` 시 컬럼 `mode` 를 함수로 오인하여
-- "WITHIN GROUP is required for ordered-set aggregate mode" 에러 발생.
-- frandoor_blog_drafts.gen_mode 와 명명 일관성 확보.
--
-- ⚠️ 사용자 직접 실행.

BEGIN;

ALTER TABLE frandoor_blog_schedules RENAME COLUMN mode TO gen_mode;

ALTER TABLE frandoor_blog_schedules
  DROP CONSTRAINT IF EXISTS frandoor_blog_schedules_mode_check;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'frandoor_blog_schedules_gen_mode_check'
  ) THEN
    ALTER TABLE frandoor_blog_schedules
      ADD CONSTRAINT frandoor_blog_schedules_gen_mode_check
      CHECK (gen_mode IN ('a_only', 'a_plus_c'));
  END IF;
END $$;

COMMIT;

NOTIFY pgrst, 'reload schema';
