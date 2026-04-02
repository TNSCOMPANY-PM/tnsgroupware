import { createAdminClient } from "@/utils/supabase/admin";
import { NextResponse } from "next/server";

export async function GET() {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("planned_leaves")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function POST(req: Request) {
  const supabase = createAdminClient();
  const body = await req.json();
  const { data, error } = await supabase
    .from("planned_leaves")
    .insert({
      id: body.id,
      applicant_id: body.applicantId,
      applicant_name: body.applicantName,
      applicant_department: body.applicantDepartment,
      leave_type: body.leaveType ?? "annual",
      start_date: body.startDate,
      end_date: body.endDate,
      days: body.days,
      reason: body.reason ?? "연차 사용 계획 제출",
      status: "PLANNED",
    })
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}
