-- PR030: 본사(C급) POS 시계열 저장 테이블.
-- D3 브랜드 심층에서 stores_latest fallback 우선순위 C > A > unknown 의 C급 소스.

CREATE TABLE IF NOT EXISTS frandoor_brand_facts (
  brand_id uuid PRIMARY KEY REFERENCES geo_brands(id) ON DELETE CASCADE,
  brand_name text NOT NULL,
  ftc_first_registered text,              -- "YYYY-MM" 형태. 공정위 정보공개서 최초 등록 월. null = 미등록
  stores_latest integer,                   -- 본사 POS 최신월 활성 점포수
  stores_latest_as_of text,                -- "YYYY-MM"
  pos_monthly jsonb NOT NULL DEFAULT '[]'::jsonb,
  -- pos_monthly 항목 shape:
  -- { year_month, store_count, total_sales, per_store_avg,
  --   top3_stores: [{name, sales}], bottom3_stores: [{name, sales}] }
  corporation_founded_year integer,        -- 법인 설립 연도
  raw jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_frandoor_brand_facts_updated_at
  ON frandoor_brand_facts(updated_at DESC);

-- 실행: Supabase SQL Editor 에 위 문장 붙여넣어 실행.
