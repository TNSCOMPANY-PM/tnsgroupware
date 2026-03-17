-- ============================================================
-- TNS Workspace - 직원 퍼스널컬러 컬럼 추가
-- Supabase SQL Editor에서 실행하세요
-- ============================================================

-- 1. personal_color 컬럼 추가
ALTER TABLE public.employees
  ADD COLUMN IF NOT EXISTS personal_color text DEFAULT NULL;

-- 2. 기존 정책 제거 후 재생성 (충돌 방지)
DROP POLICY IF EXISTS anon_update_employees ON public.employees;
DROP POLICY IF EXISTS anon_select_employees ON public.employees;
DROP POLICY IF EXISTS anon_insert_employees ON public.employees;

-- 3. RLS 활성화
ALTER TABLE public.employees ENABLE ROW LEVEL SECURITY;

-- 4. 전체 허용 정책 재설정
CREATE POLICY anon_select_employees ON public.employees FOR SELECT TO anon USING (true);
CREATE POLICY anon_update_employees ON public.employees FOR UPDATE TO anon USING (true) WITH CHECK (true);
CREATE POLICY anon_insert_employees ON public.employees FOR INSERT TO anon WITH CHECK (true);
