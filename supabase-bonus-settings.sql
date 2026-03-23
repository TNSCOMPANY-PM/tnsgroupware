-- 성과급 기준 설정 테이블
CREATE TABLE IF NOT EXISTS public.bonus_settings (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  key TEXT NOT NULL UNIQUE,   -- 예: 'target_gp', 'pool_rate', 'dn_target', 'tj_target' 등
  value NUMERIC NOT NULL,
  label TEXT,                 -- UI 표시용 한글 이름
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 기본값 삽입 (기존 하드코딩 값)
INSERT INTO public.bonus_settings (key, value, label) VALUES
  ('target_gp',          50000000, '인센티브 기준 매출총이익 (원)'),
  ('pool_rate',          0.20,     '초과이익 인센티브 풀 비율'),
  ('jaemin_rate',        0.15,     '경영지원(박재민) 풀 배분 비율'),
  ('dn_jeongseop_rate',  0.45,     '더널리 김정섭 개인 배분 비율'),
  ('dn_yongjun_rate',    0.275,    '더널리 김용준 개인 배분 비율'),
  ('dn_target',          42000000, '더널리팀 목표 매출총이익 (원)'),
  ('tj_target',           8000000, '티제이웹팀 목표 매출총이익 (원)')
ON CONFLICT (key) DO NOTHING;

-- RLS
ALTER TABLE public.bonus_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can read bonus_settings" ON public.bonus_settings FOR SELECT USING (true);
CREATE POLICY "Authenticated can update bonus_settings" ON public.bonus_settings FOR UPDATE USING (auth.role() = 'authenticated');
