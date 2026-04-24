-- PR030 hotfix: 공정위 정보공개서 (프랜도어 경유) 저장 테이블.
-- MVP 는 HTML 파싱, 이후 엑셀 배치 import 로 확장.
-- A급 소스의 단일 경로. FTC OpenAPI 는 이 테이블에 들어가는 데이터와 무관.

CREATE TABLE IF NOT EXISTS frandoor_ftc_facts (
  brand_id uuid PRIMARY KEY REFERENCES geo_brands(id) ON DELETE CASCADE,
  brand_name text NOT NULL,
  source_year text,                    -- "2024" 공정위 기준 연도
  source_registered_at text,           -- "2025-11-11" 정보공개서 최신 등록일
  source_first_registered_at text,     -- "2023-11-20" 최초 등록일
  stores_total integer,                -- 연말 누적 가맹점수
  new_stores integer,                  -- 연간 신규등록
  closed_stores integer,               -- 연간 계약종료
  terminated_stores integer,           -- 연간 계약해지
  avg_monthly_revenue integer,         -- 만원/월
  area_unit_revenue integer,           -- 만원/평
  cost_total integer,                  -- 만원 창업비용 총액
  franchise_fee integer,               -- 만원 가맹비
  education_fee integer,               -- 만원 교육비
  deposit integer,                     -- 만원 보증금
  closure_rate numeric(5,2),           -- %
  industry_avg_revenue integer,        -- 만원 업종 평균
  violations_total integer,            -- 법위반 건수
  contract_years integer,              -- 계약기간 년
  corp_name text,                      -- 가맹본부 법인명
  source_ingest_method text,           -- "html_parse_mvp" | "excel_batch" | "manual"
  sources jsonb NOT NULL DEFAULT '[]'::jsonb,
  raw jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_frandoor_ftc_facts_updated_at
  ON frandoor_ftc_facts(updated_at DESC);

-- 실행: Supabase SQL Editor 에 위 문장 붙여넣어 실행 (DDL 권한 필요).
