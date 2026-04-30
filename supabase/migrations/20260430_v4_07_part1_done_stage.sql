-- v4-07 — frandoor_blog_drafts.stage CHECK 갱신 ('part1_done' 추가).
-- TNS supabase, public.frandoor_blog_drafts.
--
-- ⚠️ 사용자 직접 실행.
-- 단계:
--   기존 stage CHECK ('plan_done', 'write_done', 'published')
--   → 신규 ('plan_done', 'part1_done', 'write_done', 'published')
--
-- 배경: v4-07 본문 두 part 분할로 stage='part1_done' 중간 단계 필요.
-- (1단계 plan → 2단계 part1_done [body 전반] → 3단계 write_done [body 합산 + 검증])

BEGIN;

ALTER TABLE frandoor_blog_drafts
  DROP CONSTRAINT IF EXISTS frandoor_blog_drafts_stage_check;

ALTER TABLE frandoor_blog_drafts
  ADD CONSTRAINT frandoor_blog_drafts_stage_check
  CHECK (stage IN ('plan_done', 'part1_done', 'write_done', 'published'));

COMMIT;
