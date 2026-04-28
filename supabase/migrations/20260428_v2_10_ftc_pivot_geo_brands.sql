-- v2-10 geo_brands → ftc 매핑 컬럼 추가
-- 적용: tnsgroupware supabase
--
-- ftc_brand_id: ftc_brands_2024.id (frandoor supabase) 의 UUID 참조 — FK 없음 (cross-db)
-- ftc_match_method: 'exact' | 'normalized' | 'manual' | NULL (미매핑)

ALTER TABLE geo_brands
  ADD COLUMN IF NOT EXISTS ftc_brand_id UUID,
  ADD COLUMN IF NOT EXISTS ftc_match_method TEXT;

CREATE INDEX IF NOT EXISTS idx_geo_brands_ftc_brand_id ON geo_brands(ftc_brand_id);

-- frandoor_blog_drafts: ftc brand 단독 글 저장용 ftc_brand_id 컬럼 추가
-- (기존 brand_id 는 geo_brands.id FK 유지 — nullable, 우리 고객 매핑 시만 사용)
ALTER TABLE frandoor_blog_drafts
  ADD COLUMN IF NOT EXISTS ftc_brand_id UUID;

CREATE INDEX IF NOT EXISTS idx_frandoor_blog_drafts_ftc_brand_id ON frandoor_blog_drafts(ftc_brand_id);
