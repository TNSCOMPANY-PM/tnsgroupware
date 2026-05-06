-- v4-22 — A only Step 4 신규: gpt-image-1 썸네일 자동 생성.
-- TNS supabase, public.frandoor_blog_drafts.
--
-- ⚠️ 사용자 직접 실행.
-- 단계:
--   1. thumbnail_url / thumbnail_prompt 컬럼 추가
--   2. stage CHECK 확장 — 기존 ('a_only_analyzed', 'a_only_structured', 'a_only_written', ...)
--      + 신규 ('a_only_thumbnail_done')

BEGIN;

ALTER TABLE frandoor_blog_drafts
  ADD COLUMN IF NOT EXISTS thumbnail_url TEXT,
  ADD COLUMN IF NOT EXISTS thumbnail_prompt TEXT;

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
    'a_only_thumbnail_done',
    'published'
  ));

COMMIT;

-- ⚠️ frandoor Supabase Storage bucket "geo-thumbnails" 도 별도 생성 필요 (UI 또는 API):
--   bucket name: geo-thumbnails
--   public: yes
--   file size limit: 10 MiB
