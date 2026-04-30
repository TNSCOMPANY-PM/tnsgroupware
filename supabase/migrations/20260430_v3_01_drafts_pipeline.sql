-- v3-01 — multi-step pipeline 도입.
-- TNSCOMPANY supabase, public.frandoor_blog_drafts.
--
-- ⚠️ 사용자 직접 실행 (TRUNCATE 는 destructive — 클코는 실행 X).
-- 단계:
--   0. 기존 draft wipe (v2 brand 'brand' 더미 5건 정리)
--   1. content_type CHECK 갱신 ('brand', 'industry')
--   2. v3 디버깅용 컬럼 추가 (pipeline_version, debug_*_json, polish_log)

BEGIN;

-- 0. 기존 draft wipe
TRUNCATE TABLE frandoor_blog_drafts;

-- 1. content_type CHECK 갱신
ALTER TABLE frandoor_blog_drafts
  DROP CONSTRAINT IF EXISTS frandoor_blog_drafts_content_type_check;
ALTER TABLE frandoor_blog_drafts
  ADD CONSTRAINT frandoor_blog_drafts_content_type_check
  CHECK (content_type IN ('brand', 'industry'));

-- 2. v3 디버깅용 컬럼 추가
ALTER TABLE frandoor_blog_drafts
  ADD COLUMN IF NOT EXISTS pipeline_version TEXT DEFAULT 'v3',
  ADD COLUMN IF NOT EXISTS debug_plan_json JSONB,
  ADD COLUMN IF NOT EXISTS debug_outline_json JSONB,
  ADD COLUMN IF NOT EXISTS polish_log JSONB;

-- debug_*_json 컬럼은 v3 운영 안정 후 (n주 뒤) 제거 가능. 초기엔 디버깅 필수.

COMMIT;
