-- GEO 파이프라인 테이블 (2026-04-22)
-- alias · 월 검색량 · 브랜드×콘텐츠 매트릭스 · 관심도 랭킹 캐시

-- 0. geo_brands 컬럼 확장 (없을 때만)
ALTER TABLE geo_brands ADD COLUMN IF NOT EXISTS category TEXT;

-- 1. geo_brand_alias : 브랜드 검색 alias (네이버 검색광고 API 키)
CREATE TABLE IF NOT EXISTS geo_brand_alias (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id UUID NOT NULL REFERENCES geo_brands(id) ON DELETE CASCADE,
  alias TEXT NOT NULL,
  is_canonical BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_geo_brand_alias_brand_alias
  ON geo_brand_alias (brand_id, alias);
CREATE INDEX IF NOT EXISTS idx_geo_brand_alias_canonical
  ON geo_brand_alias (is_canonical);

-- 2. geo_search_volume_monthly : 월간 네이버 검색광고 집계
CREATE TABLE IF NOT EXISTS geo_search_volume_monthly (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id UUID NOT NULL REFERENCES geo_brands(id) ON DELETE CASCADE,
  alias_used TEXT NOT NULL,
  year_month CHAR(7) NOT NULL,
  pc_volume INTEGER NOT NULL DEFAULT 0,
  mobile_volume INTEGER NOT NULL DEFAULT 0,
  total_volume INTEGER NOT NULL DEFAULT 0,
  comp_index TEXT,
  measurement_floor BOOLEAN NOT NULL DEFAULT FALSE,
  source TEXT NOT NULL DEFAULT 'naver_searchad',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_geo_search_volume_brand_month
  ON geo_search_volume_monthly (brand_id, year_month);
CREATE INDEX IF NOT EXISTS idx_geo_search_volume_month
  ON geo_search_volume_monthly (year_month);

-- 3. geo_brand_content_matrix : 브랜드×콘텐츠 타입 허용 규칙
CREATE TABLE IF NOT EXISTS geo_brand_content_matrix (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id UUID NOT NULL REFERENCES geo_brands(id) ON DELETE CASCADE,
  content_type TEXT NOT NULL,
  rule TEXT NOT NULL CHECK (rule IN ('INCLUDE','CONDITIONAL','EXCLUDE')),
  reason TEXT,
  updated_by TEXT,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_geo_brand_content_matrix_brand_type
  ON geo_brand_content_matrix (brand_id, content_type);
CREATE INDEX IF NOT EXISTS idx_geo_brand_content_matrix_type_rule
  ON geo_brand_content_matrix (content_type, rule);

-- 4. geo_interest_ranking_cache : 월간 랭킹 페이지 payload 캐시
CREATE TABLE IF NOT EXISTS geo_interest_ranking_cache (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  year_month CHAR(7) NOT NULL,
  category TEXT,
  payload JSONB NOT NULL,
  generated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_geo_interest_ranking_cache_month_category
  ON geo_interest_ranking_cache (year_month, COALESCE(category, ''));
