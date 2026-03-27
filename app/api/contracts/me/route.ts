import { NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";
import { createAdminClient } from "@/utils/supabase/admin";

/** GET: 로그인한 사용자의 employee_id로 내 계약 목록 조회 */
export async function GET() {
  try {
    const authClient = await createClient();
    const {
      data: { user },
    } = await authClient.auth.getUser();
    if (!user?.email) {
      return NextResponse.json([]);
    }
    const supabase = createAdminClient();
    const { data: employees } = await supabase
      .from("employees")
      .select("id")
      .eq("email", user.email)
      .limit(1);
    const employeeId = employees?.[0]?.id;
    if (!employeeId) {
      return NextResponse.json([]);
    }
    const { data, error } = await supabase
      .from("contracts")
      .select("*")
      .eq("employee_id", employeeId)
      .order("created_at", { ascending: false });

    if (error) {
      const msg = error.message ?? "";
      if (msg.includes("contracts") && (msg.includes("schema cache") || msg.includes("does not exist") || msg.includes("relation"))) {
        return NextResponse.json(
          { error: "contracts 테이블이 없습니다. Supabase 대시보드 → SQL Editor에서 supabase-contracts.sql을 실행해 주세요.", code: "CONTRACTS_TABLE_MISSING" },
          { status: 503 }
        );
      }
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json(Array.isArray(data) ? data : []);
  } catch (e) {
    const err = e instanceof Error ? e : new Error(String(e));
    const msg = err.message ?? "";
    if (msg.includes("contracts") && (msg.includes("schema cache") || msg.includes("does not exist"))) {
      return NextResponse.json(
        { error: "contracts 테이블이 없습니다. Supabase 대시보드 → SQL Editor에서 supabase-contracts.sql을 실행해 주세요.", code: "CONTRACTS_TABLE_MISSING" },
        { status: 503 }
      );
    }
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
