-- v2-18: frandoor_blog_drafts.industry 컬럼 추가 (industry-only 모드)
-- 적용: tnsgroupware supabase
--
-- industry mode 글 (brand 무관, 외식 15 업종 단위 통계 분석) 식별용.
-- brand 모드 글: brand_id (geo_brand) / ftc_brand_id (ftc PK)
-- industry 모드 글: brand_id / ftc_brand_id 모두 null + industry 필드

ALTER TABLE frandoor_blog_drafts
  ADD COLUMN IF NOT EXISTS industry TEXT;

CREATE INDEX IF NOT EXISTS idx_frandoor_blog_drafts_industry ON frandoor_blog_drafts(industry);
