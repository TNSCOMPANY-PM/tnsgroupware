import { createAdminClient } from "@/utils/supabase/admin";
import { NextResponse } from "next/server";
import { getSessionEmployee, unauthorized, forbidden } from "@/utils/apiAuth";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string; postId: string }> }
) {
  const session = await getSessionEmployee();
  if (!session) return unauthorized();

  const { id, postId } = await params;
  const supabase = createAdminClient();

  const { data: member } = await supabase
    .from("cowork_members")
    .select("role")
    .eq("cowork_id", id)
    .eq("employee_id", String(session.employeeId))
    .single();

  if (!member) return forbidden();

  const body = await request.json() as { title?: string; content?: string; pinned?: boolean };
  const { error } = await supabase.from("cowork_posts").update(body).eq("id", postId).eq("cowork_id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string; postId: string }> }
) {
  const session = await getSessionEmployee();
  if (!session) return unauthorized();

  const { id, postId } = await params;
  const supabase = createAdminClient();

  const { data: member } = await supabase
    .from("cowork_members")
    .select("role")
    .eq("cowork_id", id)
    .eq("employee_id", String(session.employeeId))
    .single();

  if (!member) return forbidden();

  const { error } = await supabase.from("cowork_posts").delete().eq("id", postId).eq("cowork_id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
