import { NextResponse } from "next/server";
import { getAnnualLeaveGranted } from "@/utils/leaveCalculator";
import { createAdminClient } from "@/utils/supabase/admin";
import { getSessionEmployee, unauthorized } from "@/utils/apiAuth";

/**
 * GET /api/leaves/annual-grant
 * 입사일 기반 연차 자동 부여 계산
 *
 * Query params:
 *   join_date  string  입사일 (YYYY.MM.DD 또는 YYYY-MM-DD)
 *   year       number  계산 연도 (기본: 현재 연도)
 *   user_id    string  employees DB id (join_date 없을 때 조회용)
 */
export async function GET(req: Request) {
  const session = await getSessionEmployee();
  if (!session) return unauthorized();

  const { searchParams } = new URL(req.url);
  const year = Number(searchParams.get("year") ?? new Date().getFullYear());

  let joinDate = searchParams.get("join_date");

  // user_id로 DB에서 hire_date 조회
  if (!joinDate) {
    const userId = searchParams.get("user_id");
    if (userId) {
      const supabase = createAdminClient();
      const { data: empData } = await supabase
        .from("employees")
        .select("hire_date")
        .eq("id", userId)
        .single();
      joinDate = empData?.hire_date ? empData.hire_date.replace(/-/g, ".") : null;
    }
  }

  if (!joinDate) {
    return NextResponse.json({ error: "join_date or user_id required" }, { status: 400 });
  }

  const granted = getAnnualLeaveGranted(joinDate, year);

  return NextResponse.json({
    join_date: joinDate,
    year,
    granted,
    description: `${year}년 연차 발생 일수: ${granted}일`,
  });
}
