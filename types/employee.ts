/**
 * Supabase public.employees 테이블 행 타입
 */
export interface Employee {
  id: string;
  emp_number: string;
  name: string;
  email: string | null;
  department: string;
  role: string;
  hire_date: string;
  created_at: string;
}
