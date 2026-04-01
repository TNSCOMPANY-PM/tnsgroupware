import { createClient } from "@/utils/supabase/server";
import { NextResponse } from "next/server";

export type EmployeeSession = {
  userId: string;
  email: string;
  employeeId: number;
  empNumber: string;
  name: string;
  role: string;
  department: string;
};

/**
 * API Route에서 인증된 사용자 정보를 가져옵니다.
 * 로그인하지 않은 경우 null을 반환합니다.
 */
export async function getSessionEmployee(): Promise<EmployeeSession | null> {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user?.email) return null;

    const { data: emp } = await supabase
      .from("employees")
      .select("id, emp_number, name, role, department")
      .eq("email", user.email)
      .single();

    if (!emp) return null;

    return {
      userId: user.id,
      email: user.email,
      employeeId: emp.id,
      empNumber: emp.emp_number,
      name: emp.name,
      role: emp.role,
      department: emp.department,
    };
  } catch {
    return null;
  }
}

/** 인증 실패 응답 */
export const unauthorized = () =>
  NextResponse.json({ error: "Unauthorized" }, { status: 401 });

/** 권한 부족 응답 */
export const forbidden = () =>
  NextResponse.json({ error: "Forbidden" }, { status: 403 });

/** C레벨 여부 */
export const isCLevel = (role: string) => role === "C레벨";

/** 팀장 이상 여부 */
export const isTeamLeadOrAbove = (role: string) =>
  role === "C레벨" || role === "팀장";
