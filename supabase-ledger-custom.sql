-- 수동 원장 항목 테이블 (기존 localStorage 데이터 이전용)
CREATE TABLE IF NOT EXISTS public.ledger_custom_entries (
  id TEXT PRIMARY KEY,                         -- 기존 'custom-{timestamp}' ID 유지
  date TEXT NOT NULL,                          -- YYYY-MM-DD
  amount NUMERIC NOT NULL DEFAULT 0,
  sender_name TEXT,
  type TEXT NOT NULL DEFAULT 'DEPOSIT',        -- 'DEPOSIT' | 'WITHDRAWAL'
  bank_name TEXT,
  status TEXT NOT NULL DEFAULT 'UNMAPPED',     -- 'UNMAPPED' | 'PAID'
  classification TEXT,
  client_name TEXT,
  description TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- RLS
ALTER TABLE public.ledger_custom_entries ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can read ledger_custom_entries" ON public.ledger_custom_entries FOR SELECT USING (true);
CREATE POLICY "Authenticated can insert ledger_custom_entries" ON public.ledger_custom_entries FOR INSERT WITH CHECK (auth.role() = 'authenticated');
CREATE POLICY "Authenticated can update ledger_custom_entries" ON public.ledger_custom_entries FOR UPDATE USING (auth.role() = 'authenticated');
CREATE POLICY "Authenticated can delete ledger_custom_entries" ON public.ledger_custom_entries FOR DELETE USING (auth.role() = 'authenticated');
