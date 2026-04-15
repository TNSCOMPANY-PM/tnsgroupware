-- frandoor_blog_drafts (실제 테이블명 - 스펙의 geo_blog_posts 는 이 테이블을 지칭) 에
-- content_type 컬럼을 추가. v3 전략의 타입 A/B/C/D + 외부채널 구분.

ALTER TABLE frandoor_blog_drafts
  ADD COLUMN IF NOT EXISTS content_type TEXT NOT NULL DEFAULT 'brand';

ALTER TABLE frandoor_blog_drafts
  DROP CONSTRAINT IF EXISTS frandoor_blog_drafts_content_type_check;

ALTER TABLE frandoor_blog_drafts
  ADD CONSTRAINT frandoor_blog_drafts_content_type_check
  CHECK (content_type IN ('brand', 'compare', 'guide', 'trend', 'external'));

CREATE INDEX IF NOT EXISTS idx_frandoor_blog_drafts_content_type
  ON frandoor_blog_drafts (content_type, created_at DESC);

-- 실행: Supabase 대시보드 SQL Editor 에 위 문장 붙여넣어 실행.
-- 기존 행은 DEFAULT 'brand' 로 자동 설정됨.
