-- v3-03 — 2단계 분할 (Phase A Plan/Outline → Phase B Write/Polish).
-- TNSCOMPANY supabase, public.frandoor_blog_drafts.
--
-- ⚠️ 사용자 직접 실행.
-- 단계:
--   1. stage 컬럼 추가 (plan_done / write_done / published, default 'plan_done')
--   2. content (본문 markdown) NOT NULL 제약 해제 — Phase A 시점엔 null

BEGIN;

-- 1. stage 컬럼
ALTER TABLE frandoor_blog_drafts
  ADD COLUMN IF NOT EXISTS stage TEXT
  CHECK (stage IN ('plan_done', 'write_done', 'published'))
  DEFAULT 'plan_done';

-- 2. content nullable
ALTER TABLE frandoor_blog_drafts
  ALTER COLUMN content DROP NOT NULL;

COMMIT;
