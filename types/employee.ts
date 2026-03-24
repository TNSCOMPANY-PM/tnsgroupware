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
  avatar_url?: string | null;
  personal_color?: string | null;
  // 표시용 필드 (DB에서 관리)
  position?: string | null;
  position_display?: string | null;
  display_department?: string | null;
  phone?: string | null;
  employment_status?: string | null;
}
