-- ============================================================
-- 사원 목록 등이 안 불러와질 때 (RLS 적용 후)
-- Supabase SQL Editor에서 **전체** 복사해 한 번에 실행하세요.
-- 기존 정책이 있으면 제거한 뒤 anon 조회(SELECT) 정책을 다시 만듭니다.
-- ============================================================

-- 1) 기존 anon SELECT 정책 제거 (있으면)
DROP POLICY IF EXISTS "anon_select_employees" ON public.employees;
DROP POLICY IF EXISTS "anon_select_projects" ON public.projects;
DROP POLICY IF EXISTS "anon_select_leaves" ON public.leaves;
DROP POLICY IF EXISTS "anon_select_finance" ON public.finance;

-- 2) anon이 조회만 할 수 있도록 정책 생성
CREATE POLICY "anon_select_employees"
  ON public.employees FOR SELECT
  TO anon
  USING (true);

CREATE POLICY "anon_select_projects"
  ON public.projects FOR SELECT
  TO anon
  USING (true);

CREATE POLICY "anon_select_leaves"
  ON public.leaves FOR SELECT
  TO anon
  USING (true);

CREATE POLICY "anon_select_finance"
  ON public.finance FOR SELECT
  TO anon
  USING (true);
