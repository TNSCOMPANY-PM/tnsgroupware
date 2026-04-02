import { createAdminClient } from "@/utils/supabase/admin";
import { NextResponse } from "next/server";

/**
 * GET /api/leave-events
 * 승인 완료된 휴가를 CalendarLeaveEvent 형태로 반환
 * (전사 캘린더, 번아웃 리스크 계산용)
 */
export async function GET() {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("leave_requests")
    .select("id, applicant_id, applicant_name, leave_type, start_date, end_date")
    .eq("status", "승인_완료")
    .order("start_date", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const events = (data ?? []).map((r) => ({
    id: r.id,
    userId: r.applicant_id,
    userName: r.applicant_name,
    leaveType: r.leave_type,
    startDate: r.start_date,
    endDate: r.end_date,
  }));

  return NextResponse.json(events);
}
