-- 감사 로그 테이블
CREATE TABLE IF NOT EXISTS public.audit_logs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  action TEXT NOT NULL,          -- 'approval.approved', 'approval.rejected', 'finance.delete', 'leave.approved', etc.
  actor_id TEXT,                 -- 수행자 user ID (nullable for system actions)
  actor_name TEXT,               -- 수행자 이름
  target_id TEXT,                -- 대상 레코드 ID
  target_type TEXT,              -- 'approval' | 'finance' | 'leave' | 'employee' 등
  detail JSONB,                  -- 추가 상세 정보
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS audit_logs_action_idx ON public.audit_logs (action);
CREATE INDEX IF NOT EXISTS audit_logs_created_at_idx ON public.audit_logs (created_at DESC);
CREATE INDEX IF NOT EXISTS audit_logs_actor_id_idx ON public.audit_logs (actor_id);

-- RLS
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can read audit_logs" ON public.audit_logs FOR SELECT USING (true);
CREATE POLICY "Authenticated can insert audit_logs" ON public.audit_logs FOR INSERT WITH CHECK (auth.role() = 'authenticated');
