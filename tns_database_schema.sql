-- ============================================================
-- TNS Workspace · Supabase 초기 스키마
-- Supabase 대시보드 → SQL Editor에서 이 파일 내용을 붙여넣어 실행하세요.
-- ============================================================

-- 1. 직원 (employees)
CREATE TABLE IF NOT EXISTS public.employees (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  emp_number TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  email TEXT UNIQUE,
  department TEXT NOT NULL,
  role TEXT NOT NULL,
  hire_date DATE NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.employees IS 'TNS 직원 마스터 (사번·이름·이메일·부서·권한·입사일)';
COMMENT ON COLUMN public.employees.emp_number IS '사번 (예: TNS-20260311-01)';
COMMENT ON COLUMN public.employees.email IS '로그인용 이메일 (Supabase Auth와 동일 값)';
COMMENT ON COLUMN public.employees.role IS '직급/권한: 사원, 팀장, C레벨';

-- (기존 employees 테이블이 이미 있다면) 로그인 연동을 위해 email 컬럼 추가:
-- ALTER TABLE public.employees ADD COLUMN email TEXT UNIQUE;

-- 사번으로 로그인 시 이메일 조회 (anon 호출 가능, RLS 우회하지 않음)
CREATE OR REPLACE FUNCTION public.get_email_for_emp_number(p_emp_number TEXT)
RETURNS TEXT
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT email FROM public.employees WHERE emp_number = p_emp_number AND email IS NOT NULL LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public.get_email_for_emp_number(TEXT) TO anon;
GRANT EXECUTE ON FUNCTION public.get_email_for_emp_number(TEXT) TO authenticated;
COMMENT ON FUNCTION public.get_email_for_emp_number(TEXT) IS '로그인: 사번으로 이메일 조회 (Supabase Auth 연동용)';

-- 마스터 계정용 직원 행 1건 생성 (시드 시 1회 호출, anon/authenticated 실행 가능)
CREATE OR REPLACE FUNCTION public.create_master_employee_if_missing()
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.employees WHERE emp_number = 'REDACTED_MASTER_EMP') THEN
    RETURN 'exists';
  END IF;
  INSERT INTO public.employees (emp_number, name, email, department, role, hire_date)
  VALUES (
    'REDACTED_MASTER_EMP',
    '마스터',
    'admin@example.com',
    '경영',
    'C레벨',
    '2026-01-01'
  );
  RETURN 'created';
END;
$$;
GRANT EXECUTE ON FUNCTION public.create_master_employee_if_missing() TO anon;
GRANT EXECUTE ON FUNCTION public.create_master_employee_if_missing() TO authenticated;
COMMENT ON FUNCTION public.create_master_employee_if_missing() IS '테스트용 마스터 직원 1건 생성 (이메일 admin@example.com, 사번 REDACTED_MASTER_EMP)';

-- 신규 직원 등록 (HR에서 호출, anon/authenticated 실행 가능)
CREATE OR REPLACE FUNCTION public.create_employee(
  p_emp_number TEXT,
  p_name TEXT,
  p_email TEXT,
  p_department TEXT,
  p_role TEXT,
  p_hire_date DATE
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id UUID;
BEGIN
  INSERT INTO public.employees (emp_number, name, email, department, role, hire_date)
  VALUES (p_emp_number, p_name, NULLIF(TRIM(p_email), ''), p_department, p_role, p_hire_date)
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;
GRANT EXECUTE ON FUNCTION public.create_employee(TEXT, TEXT, TEXT, TEXT, TEXT, DATE) TO anon;
GRANT EXECUTE ON FUNCTION public.create_employee(TEXT, TEXT, TEXT, TEXT, TEXT, DATE) TO authenticated;

-- 2. 프로젝트 (projects)
CREATE TABLE IF NOT EXISTS public.projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  team TEXT,
  status TEXT,
  progress INTEGER DEFAULT 0,
  start_date DATE,
  end_date DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.projects IS 'TNS 프로젝트 (제목·팀·상태·진행률·기간)';

-- 3. 휴가/연차 (leaves)
CREATE TABLE IF NOT EXISTS public.leaves (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  emp_id UUID NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  days INTEGER NOT NULL,
  status TEXT NOT NULL,
  approved_by UUID REFERENCES public.employees(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  start_date DATE,
  end_date DATE,
  auto_approved BOOLEAN NOT NULL DEFAULT false
);

COMMENT ON TABLE public.leaves IS '직원 휴가/연차 신청 (emp_id·종류·일수·상태·승인자)';
COMMENT ON COLUMN public.leaves.status IS 'pending | approved | rejected';
COMMENT ON COLUMN public.leaves.auto_approved IS '3영업일/휴가당일 미승인 시 시스템 자동 승인 여부';

-- 기존 leaves 테이블이 이미 있으면 자동 승인·휴가일자 컬럼 추가 (한 번만 실행)
ALTER TABLE public.leaves ADD COLUMN IF NOT EXISTS start_date DATE;
ALTER TABLE public.leaves ADD COLUMN IF NOT EXISTS end_date DATE;
ALTER TABLE public.leaves ADD COLUMN IF NOT EXISTS auto_approved BOOLEAN NOT NULL DEFAULT false;

-- 기존 시드 계정 이메일을 Auth용(@example.com)으로 통일 (한 번 실행해 두면 됨)
UPDATE public.employees SET email = 'admin@example.com' WHERE emp_number = 'REDACTED_MASTER_EMP';
UPDATE public.employees SET email = 'tns20250201@example.com' WHERE emp_number = 'TNS-20250201';
UPDATE public.employees SET email = 'tns20190709@example.com' WHERE emp_number = 'TNS-20190709';
UPDATE public.employees SET email = 'tns20210125@example.com' WHERE emp_number = 'TNS-20210125';
UPDATE public.employees SET email = 'tns20220117@example.com' WHERE emp_number = 'TNS-20220117';
UPDATE public.employees SET email = 'tns20220801@example.com' WHERE emp_number = 'TNS-20220801';

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

-- ============================================================
-- 안내: 재무(finance) 테이블을 새로 적용하려면
-- Supabase 대시보드 → SQL Editor에서 위 finance 블록만 복사해 붙여넣고 실행하세요.
-- (이미 적용된 상태라면 "relation already exists" 등으로 무시해도 됩니다.)
-- ============================================================

-- (선택) RLS 활성화 시 아래 주석 해제 후 정책 추가
-- ALTER TABLE public.employees ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE public.leaves ENABLE ROW LEVEL SECURITY;
