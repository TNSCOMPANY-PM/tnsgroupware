-- v4-16 — A only 분석 모드 (별도 3-step chain).
-- TNS supabase, public.frandoor_blog_drafts.
--
-- ⚠️ 사용자 직접 실행.
-- 단계:
--   1. gen_mode 컬럼 추가 ('a_plus_c' default | 'a_only')
--   2. stage CHECK 확장 — 기존 ('facts_a_done', 'facts_c_done', 'write_done', 'published')
--      + 신규 ('a_only_analyzed', 'a_only_structured', 'a_only_written')

BEGIN;

ALTER TABLE frandoor_blog_drafts
  ADD COLUMN IF NOT EXISTS gen_mode TEXT NOT NULL DEFAULT 'a_plus_c';

ALTER TABLE frandoor_blog_drafts
  DROP CONSTRAINT IF EXISTS frandoor_blog_drafts_gen_mode_check;

ALTER TABLE frandoor_blog_drafts
  ADD CONSTRAINT frandoor_blog_drafts_gen_mode_check
  CHECK (gen_mode IN ('a_plus_c', 'a_only'));

ALTER TABLE frandoor_blog_drafts
  DROP CONSTRAINT IF EXISTS frandoor_blog_drafts_stage_check;

ALTER TABLE frandoor_blog_drafts
  ADD CONSTRAINT frandoor_blog_drafts_stage_check
  CHECK (stage IN (
    'facts_a_done',
    'facts_c_done',
    'write_done',
    'a_only_analyzed',
    'a_only_structured',
    'a_only_written',
    'published'
  ));

COMMIT;
