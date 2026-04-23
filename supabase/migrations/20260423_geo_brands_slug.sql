-- geo_brands.slug 컬럼 추가 (PR027)
-- /franchise/[slug] 라우트 lookup 용
-- 기존 데이터 보존, UNIQUE 제약은 backfill 후 수동 부여 권장

ALTER TABLE geo_brands ADD COLUMN IF NOT EXISTS slug TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS uq_geo_brands_slug
  ON geo_brands (slug) WHERE slug IS NOT NULL;
