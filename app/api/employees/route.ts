import { NextResponse } from "next/server";
import { createAdminClient } from "@/utils/supabase/admin";
import { getSessionEmployee, unauthorized } from "@/utils/apiAuth";

/** 사원 목록 조회 (서버에서 Supabase 호출 → 브라우저는 이 API만 호출) */
export async function GET() {
  const session = await getSessionEmployee();
  if (!session) return unauthorized();

  try {
    const supabase = createAdminClient();
    const { data, error } = await supabase.from("employees").select("*").eq("employment_status", "재직").order("created_at", { ascending: false });

    if (error) {
      return NextResponse.json(
        { error: error.message, code: error.code },
        { status: 500 }
      );
    }

    return NextResponse.json(Array.isArray(data) ? data : []);
  } catch (e) {
    const err = e instanceof Error ? e : new Error(String(e));
    return NextResponse.json(
      { error: err.message },
      { status: 500 }
    );
  }
}
