import { createAdminClient } from "@/utils/supabase/admin";
import { NextResponse } from "next/server";
import { getSessionEmployee, unauthorized, forbidden } from "@/utils/apiAuth";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string; scheduleId: string }> }
) {
  const session = await getSessionEmployee();
  if (!session) return unauthorized();

  const { id, scheduleId } = await params;
  const supabase = createAdminClient();

  const { data: member } = await supabase.from("cowork_members").select("role").eq("cowork_id", id).eq("employee_id", session.userId).single();
  if (!member) return forbidden();

  const body = await request.json();
  const { error } = await supabase.from("cowork_schedules").update(body).eq("id", scheduleId).eq("cowork_id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string; scheduleId: string }> }
) {
  const session = await getSessionEmployee();
  if (!session) return unauthorized();

  const { id, scheduleId } = await params;
  const supabase = createAdminClient();

  const { data: member } = await supabase.from("cowork_members").select("role").eq("cowork_id", id).eq("employee_id", session.userId).single();
  if (!member) return forbidden();

  const { error } = await supabase.from("cowork_schedules").delete().eq("id", scheduleId).eq("cowork_id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
