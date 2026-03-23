-- 전자결재 ↔ finance 연결을 위한 approval_id 컬럼 추가
ALTER TABLE public.finance ADD COLUMN IF NOT EXISTS approval_id TEXT;
CREATE INDEX IF NOT EXISTS idx_finance_approval_id ON public.finance(approval_id);
