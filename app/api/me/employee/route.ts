import { NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";
import { createAdminClient } from "@/utils/supabase/admin";

/** 로그인한 사용자의 직원 정보 (이메일로 employees 조회) */
export async function GET() {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user?.email) {
      return NextResponse.json(null);
    }
    const admin = createAdminClient();
    const { data, error } = await admin
      .from("employees")
      .select("id, emp_number, name, email, department, role, hire_date, position, position_display, display_department, phone, employment_status")
      .eq("email", user.email)
      .limit(1)
      .single();

    if (error || !data) {
      return NextResponse.json(null);
    }
    return NextResponse.json(data);
  } catch {
    return NextResponse.json(null);
  }
}
