-- v2-11: tnsgroupware 측 ftc 매핑 컬럼 UUID → TEXT
-- 적용: tnsgroupware supabase
--
-- 배경:
--   v2-10 의 ftc_brand_id UUID 가정 오류. ftc_brands_2024.id 가 integer/serial.
--   geo_brands.ftc_brand_id 와 frandoor_blog_drafts.ftc_brand_id 모두 type 통일 필요.
--
-- 안전성: 기존 row 의 ftc_brand_id 는 모두 NULL 일 가능성 높음 (수동 매핑 전).
--         NULL 은 UUID → TEXT 캐스팅 무영향.

-- 1. geo_brands.ftc_brand_id UUID → TEXT
ALTER TABLE geo_brands
  ALTER COLUMN ftc_brand_id TYPE TEXT USING ftc_brand_id::TEXT;

-- 2. frandoor_blog_drafts.ftc_brand_id UUID → TEXT
ALTER TABLE frandoor_blog_drafts
  ALTER COLUMN ftc_brand_id TYPE TEXT USING ftc_brand_id::TEXT;

-- 인덱스는 ALTER COLUMN 시 자동 유지 (PostgreSQL 12+).
-- 명시 재생성이 필요하면 아래 주석 해제:
-- DROP INDEX IF EXISTS idx_geo_brands_ftc_brand_id;
-- CREATE INDEX idx_geo_brands_ftc_brand_id ON geo_brands(ftc_brand_id);
-- DROP INDEX IF EXISTS idx_frandoor_blog_drafts_ftc_brand_id;
-- CREATE INDEX idx_frandoor_blog_drafts_ftc_brand_id ON frandoor_blog_drafts(ftc_brand_id);
