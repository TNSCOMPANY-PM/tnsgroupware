-- v4-07 — frandoor_blog_drafts.stage CHECK 갱신 (3 로빈 구조).
-- TNS supabase, public.frandoor_blog_drafts.
--
-- ⚠️ 사용자 직접 실행.
-- 단계:
--   기존 stage CHECK 폐기 (v3-03 의 'plan_done' / 'write_done' 등 모두 정리)
--   → 신규 ('facts_a_done', 'facts_c_done', 'write_done', 'published')

BEGIN;

ALTER TABLE frandoor_blog_drafts
  DROP CONSTRAINT IF EXISTS frandoor_blog_drafts_stage_check;

ALTER TABLE frandoor_blog_drafts
  ADD CONSTRAINT frandoor_blog_drafts_stage_check
  CHECK (stage IN ('facts_a_done', 'facts_c_done', 'write_done', 'published'));

COMMIT;
