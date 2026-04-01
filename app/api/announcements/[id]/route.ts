import { createAdminClient } from "@/utils/supabase/admin";
import { NextResponse } from "next/server";
import { getSessionEmployee, unauthorized, forbidden, isTeamLeadOrAbove } from "@/utils/apiAuth";

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSessionEmployee();
  if (!session) return unauthorized();
  if (!isTeamLeadOrAbove(session.role)) return forbidden();

  const supabase = createAdminClient();
  const body = await req.json();
  const { id } = await params;
  const { data, error } = await supabase
    .from("announcements")
    .update({
      ...(body.title !== undefined && { title: body.title }),
      ...(body.body !== undefined && { body: body.body }),
      ...(body.isImportant !== undefined && { is_important: body.isImportant }),
      ...(body.images !== undefined && { images: body.images }),
    })
    .eq("id", id)
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSessionEmployee();
  if (!session) return unauthorized();
  if (!isTeamLeadOrAbove(session.role)) return forbidden();

  const supabase = createAdminClient();
  const { id } = await params;
  const { error } = await supabase.from("announcements").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
