-- client_alerts 테이블
CREATE TABLE IF NOT EXISTS public.client_alerts (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  client_id UUID REFERENCES public.clients(id) ON DELETE CASCADE,
  client_name TEXT NOT NULL,
  category TEXT NOT NULL,
  last_deposit_date DATE,
  days_since INTEGER,
  threshold INTEGER,
  triggered_date DATE NOT NULL,
  target_user_id TEXT NOT NULL,
  is_done BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.client_alerts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "client_alerts_read" ON public.client_alerts FOR SELECT USING (true);
CREATE POLICY "client_alerts_write" ON public.client_alerts FOR ALL USING (auth.role() = 'authenticated');

-- 고객사별 마지막 입금일 집계 함수
CREATE OR REPLACE FUNCTION get_client_last_deposits()
RETURNS TABLE(client_name TEXT, last_deposit_date TEXT) AS $$
  SELECT client_name, MAX(date) AS last_deposit_date
  FROM finance
  WHERE type = '매출' AND client_name IS NOT NULL
  GROUP BY client_name
$$ LANGUAGE SQL SECURITY DEFINER;
