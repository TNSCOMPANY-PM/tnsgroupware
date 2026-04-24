-- PR033: 공정위 정보공개서 v2 스키마.
-- frandoor_ftc_facts 마스터 확장 + 신규 timeseries(연도별 5년) + regional(연×지역).

-- T2.1 frandoor_ftc_facts 마스터 필드 확장
ALTER TABLE frandoor_ftc_facts
  ADD COLUMN IF NOT EXISTS representative text,
  ADD COLUMN IF NOT EXISTS industry_main text,
  ADD COLUMN IF NOT EXISTS industry_sub text,
  ADD COLUMN IF NOT EXISTS corp_founded_date date,
  ADD COLUMN IF NOT EXISTS biz_registered_date date,
  ADD COLUMN IF NOT EXISTS ftc_first_registered_date date,
  ADD COLUMN IF NOT EXISTS ftc_latest_registered_date date,
  ADD COLUMN IF NOT EXISTS hq_address text,
  ADD COLUMN IF NOT EXISTS biz_type text,
  ADD COLUMN IF NOT EXISTS franchise_started_date date,
  ADD COLUMN IF NOT EXISTS brand_count integer,
  ADD COLUMN IF NOT EXISTS affiliate_count integer,
  ADD COLUMN IF NOT EXISTS regional_hq_count integer,
  ADD COLUMN IF NOT EXISTS latest_year text,
  ADD COLUMN IF NOT EXISTS latest_avg_annual_revenue integer,
  ADD COLUMN IF NOT EXISTS latest_avg_revenue_per_unit_area integer,
  ADD COLUMN IF NOT EXISTS other_cost integer,
  ADD COLUMN IF NOT EXISTS interior_per_unit_area integer,
  ADD COLUMN IF NOT EXISTS reference_area integer,
  ADD COLUMN IF NOT EXISTS interior_total integer,
  ADD COLUMN IF NOT EXISTS contract_initial_years integer,
  ADD COLUMN IF NOT EXISTS contract_extension_years integer,
  ADD COLUMN IF NOT EXISTS violations_ftc integer,
  ADD COLUMN IF NOT EXISTS violations_civil integer,
  ADD COLUMN IF NOT EXISTS violations_criminal integer;

-- T2.2 시계열 (연도별 최대 5년치)
CREATE TABLE IF NOT EXISTS frandoor_ftc_timeseries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id uuid NOT NULL REFERENCES geo_brands(id) ON DELETE CASCADE,
  year integer NOT NULL,
  assets integer,
  liabilities integer,
  equity integer,
  revenue integer,
  operating_profit integer,
  net_profit integer,
  executives integer,
  employees integer,
  opening_balance integer,
  new_opens integer,
  contract_end integer,
  contract_terminate integer,
  name_change integer,
  closing_balance integer,
  stores_total integer,
  stores_franchise integer,
  stores_direct integer,
  advertising integer,
  promotion integer,
  avg_annual_revenue integer,
  avg_revenue_per_unit_area integer,
  raw jsonb NOT NULL DEFAULT '{}'::jsonb,
  UNIQUE(brand_id, year)
);
CREATE INDEX IF NOT EXISTS idx_frandoor_ftc_ts_brand_year
  ON frandoor_ftc_timeseries(brand_id, year DESC);

-- T2.3 지역별 분포 (연×17시도×브랜드)
CREATE TABLE IF NOT EXISTS frandoor_ftc_regional (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id uuid NOT NULL REFERENCES geo_brands(id) ON DELETE CASCADE,
  year integer NOT NULL,
  region text NOT NULL,
  stores_franchise integer,
  stores_direct integer,
  avg_annual_revenue integer,
  UNIQUE(brand_id, year, region)
);
CREATE INDEX IF NOT EXISTS idx_frandoor_ftc_reg_brand_year
  ON frandoor_ftc_regional(brand_id, year DESC);

-- 실행: Supabase SQL Editor 에 위 문장 붙여넣어 Run.
