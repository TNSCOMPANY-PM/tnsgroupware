-- ============================================================
-- TNS Workspace · 전자계약(contracts) 테이블
-- Supabase SQL Editor에서 실행하세요.
-- (앱에서 "contracts 테이블이 없습니다" 오류가 나면 이 파일 전체를 실행하세요.)
-- ============================================================

-- contracts 테이블 (employee_id는 employees 테이블 참조)
CREATE TABLE IF NOT EXISTS public.contracts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id UUID NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  contract_type TEXT NOT NULL CHECK (contract_type IN ('salary', 'employment', 'privacy', 'non_compete', 'nda')),
  content JSONB NOT NULL DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'signed')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  signed_at TIMESTAMPTZ
);

COMMENT ON TABLE public.contracts IS '전자계약서 (연봉/근로/개인정보/경업금지/비밀유지)';
COMMENT ON COLUMN public.contracts.contract_type IS 'salary=연봉계약서, employment=근로계약서, privacy=개인정보동의, non_compete=경업금지, nda=비밀유지';
COMMENT ON COLUMN public.contracts.content IS '계약서별 동적 데이터 (이름, 생년월일, 기간, 금액 등)';
COMMENT ON COLUMN public.contracts.status IS 'pending=서명대기, signed=서명완료';

-- RLS (선택: anon/authenticated에서 조회·삽입·갱신 허용)
ALTER TABLE public.contracts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_contracts" ON public.contracts;
DROP POLICY IF EXISTS "anon_insert_contracts" ON public.contracts;
DROP POLICY IF EXISTS "anon_update_contracts" ON public.contracts;

CREATE POLICY "anon_select_contracts"
  ON public.contracts FOR SELECT TO anon USING (true);

CREATE POLICY "anon_insert_contracts"
  ON public.contracts FOR INSERT TO anon WITH CHECK (true);

CREATE POLICY "anon_update_contracts"
  ON public.contracts FOR UPDATE TO anon USING (true) WITH CHECK (true);

-- 인덱스 (직원별·상태별 조회)
CREATE INDEX IF NOT EXISTS idx_contracts_employee_id ON public.contracts(employee_id);
CREATE INDEX IF NOT EXISTS idx_contracts_status ON public.contracts(status);
CREATE INDEX IF NOT EXISTS idx_contracts_created_at ON public.contracts(created_at DESC);
