-- GEO 시연용 프롬프트 템플릿
CREATE TABLE IF NOT EXISTS geo_demo_prompts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  category TEXT NOT NULL,
  category_label TEXT NOT NULL,
  prompt_template TEXT NOT NULL,
  sort_order INT DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE geo_demo_prompts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_all_geo_demo_prompts" ON geo_demo_prompts FOR ALL USING (true) WITH CHECK (true);

-- 초기 데이터 25개
INSERT INTO geo_demo_prompts (category, category_label, prompt_template, sort_order) VALUES
('D0','개인창업 탐색','돈 별로 없는데 뭐 창업하면 좋아?',1),
('D0','개인창업 탐색','퇴직금으로 창업할 수 있는 거 뭐야?',2),
('D0','개인창업 탐색','개인 식당 차리면 실패율이 왜 높아?',3),
('D0','개인창업 탐색','처음 창업할 때 가장 많이 실수하는 게 뭐야?',4),
('D0','개인창업 탐색','혼자 음식점 차리는 거랑 프랜차이즈랑 뭐가 더 나아?',5),
('D1','프랜차이즈 탐색','실투자금 적게 창업할 수 있는 프랜차이즈 있어?',6),
('D1','프랜차이즈 탐색','투자 회수 빠른 프랜차이즈 창업 추천해줘',7),
('D1','프랜차이즈 탐색','소자본 프랜차이즈 창업 뭐가 좋아?',8),
('D1','프랜차이즈 탐색','초보자도 할 수 있는 프랜차이즈 업종 뭐야?',9),
('D1','프랜차이즈 탐색','1인 운영 가능한 소형 프랜차이즈 뭐야?',10),
('D2','{카테고리} 카테고리','{카테고리} 프랜차이즈 월매출 얼마나 나와?',11),
('D2','{카테고리} 카테고리','소자본 {카테고리} 프랜차이즈 추천해줘',12),
('D2','{카테고리} 카테고리','{카테고리} 프랜차이즈 창업비용 얼마나 해?',13),
('D2','{카테고리} 카테고리','{카테고리} 프랜차이즈 마진이 어떻게 돼?',14),
('D2','{카테고리} 카테고리','{카테고리} 프랜차이즈 투자 회수 빠른 곳 어디야?',15),
('D2','{카테고리} 카테고리','{카테고리} 프랜차이즈 로열티 얼마야?',16),
('D2','{카테고리} 카테고리','{카테고리} 프랜차이즈 브랜드 어디어디 있어?',17),
('D2','{카테고리} 카테고리','{카테고리} 프랜차이즈 혼자 운영 가능해?',18),
('D3','{브랜드명} 직접','{브랜드명} 창업비용 얼마야?',19),
('D3','{브랜드명} 직접','{브랜드명} 마진 어떻게 돼?',20),
('D3','{브랜드명} 직접','{브랜드명} 월매출 얼마야?',21),
('D3','{브랜드명} 직접','{브랜드명} 몇 명이서 운영해?',22),
('D3','{브랜드명} 직접','{브랜드명} 몇 평이 적당해?',23),
('D3','{브랜드명} 직접','{브랜드명} 투자 회수 기간 얼마나 걸려?',24),
('D3','{브랜드명} 직접','{브랜드명} 다른 {카테고리} 브랜드랑 뭐가 달라?',25);

-- GEO 시연 리포트 (공유용)
CREATE TABLE IF NOT EXISTS geo_demo_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_name TEXT NOT NULL,
  category TEXT NOT NULL,
  checked_at TIMESTAMPTZ DEFAULT now(),
  summary JSONB NOT NULL,
  results JSONB NOT NULL,
  is_public BOOLEAN DEFAULT true,
  expires_at TIMESTAMPTZ DEFAULT (now() + interval '30 days')
);
ALTER TABLE geo_demo_reports ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_all_geo_demo_reports" ON geo_demo_reports FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "public_read_geo_demo_reports" ON geo_demo_reports FOR SELECT USING (is_public = true AND expires_at > now());
