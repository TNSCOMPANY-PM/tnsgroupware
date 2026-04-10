-- 블로그 초안 저장 테이블
CREATE TABLE IF NOT EXISTS frandoor_blog_drafts (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  brand_id uuid REFERENCES geo_brands(id) ON DELETE CASCADE,
  channel text NOT NULL, -- frandoor, tistory, naver, medium
  title text,
  content text,
  meta_description text,
  keywords jsonb DEFAULT '[]',
  faq jsonb DEFAULT '[]',
  schema_markup text,
  status text NOT NULL DEFAULT 'draft', -- draft, approved, published, rejected
  target_date text, -- 발행 예정일 YYYY-MM-DD
  published_url text, -- 실제 발행 URL
  created_at timestamptz DEFAULT now()
);

-- 일간 운영 리포트 테이블
CREATE TABLE IF NOT EXISTS frandoor_daily_reports (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  brand_id uuid REFERENCES geo_brands(id) ON DELETE CASCADE,
  date text NOT NULL,
  geo_score int,
  seo_score int,
  aeo_score int,
  blog_results jsonb,
  summary text,
  insights jsonb,
  action_items jsonb,
  created_at timestamptz DEFAULT now()
);

-- RLS
ALTER TABLE frandoor_blog_drafts ENABLE ROW LEVEL SECURITY;
ALTER TABLE frandoor_daily_reports ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_all_blog_drafts" ON frandoor_blog_drafts FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "service_all_daily_reports" ON frandoor_daily_reports FOR ALL USING (true) WITH CHECK (true);
