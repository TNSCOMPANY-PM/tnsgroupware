-- frandoor_blog_drafts에 meta jsonb 컬럼 추가 (데이터시트 등 메타 정보 저장용).
ALTER TABLE frandoor_blog_drafts
  ADD COLUMN IF NOT EXISTS meta jsonb DEFAULT '{}';

-- content_type 에 'datasheet' 허용 추가.
ALTER TABLE frandoor_blog_drafts
  DROP CONSTRAINT IF EXISTS frandoor_blog_drafts_content_type_check;

ALTER TABLE frandoor_blog_drafts
  ADD CONSTRAINT frandoor_blog_drafts_content_type_check
  CHECK (content_type IN ('brand', 'compare', 'guide', 'trend', 'external', 'datasheet'));

-- 실행: Supabase 대시보드 SQL Editor 에 위 문장 붙여넣어 실행.
