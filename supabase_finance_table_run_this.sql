-- ============================================================
-- 👇 아래 전체를 복사해서 Supabase SQL Editor에 붙여넣고 [Run] 누르세요.
-- ============================================================

-- 4. 재무 (finance) — 매출/매입 집계용
CREATE TABLE IF NOT EXISTS public.finance (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  month TEXT NOT NULL,
  type TEXT NOT NULL,
  amount BIGINT NOT NULL,
  category TEXT,
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.finance IS 'TNS 재무 데이터 (월별 매출/매입)';
COMMENT ON COLUMN public.finance.month IS '월 키 (예: 2026-02)';
COMMENT ON COLUMN public.finance.type IS '매출 또는 매입';
COMMENT ON COLUMN public.finance.amount IS '금액';
COMMENT ON COLUMN public.finance.category IS '분류(카테고리)';
COMMENT ON COLUMN public.finance.description IS '적요/설명';
