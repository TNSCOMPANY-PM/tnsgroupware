-- clients 테이블
CREATE TABLE IF NOT EXISTS public.clients (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  category TEXT,
  aliases TEXT[] DEFAULT '{}',
  contact TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_clients_aliases ON public.clients USING GIN(aliases);

ALTER TABLE public.clients ENABLE ROW LEVEL SECURITY;

-- 모든 인증 사용자 읽기 허용 (webhook에서도 사용)
CREATE POLICY "clients_read" ON public.clients FOR SELECT USING (true);
CREATE POLICY "clients_write" ON public.clients FOR ALL USING (auth.role() = 'authenticated');
