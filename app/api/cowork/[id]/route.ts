import { createAdminClient } from "@/utils/supabase/admin";
import { NextResponse } from "next/server";
import { getSessionEmployee, unauthorized, forbidden } from "@/utils/apiAuth";

async function logActivity(
  supabase: ReturnType<typeof createAdminClient>,
  coworkId: string,
  actorId: string,
  actorName: string,
  action: string,
  targetTitle?: string
) {
  await supabase.from("cowork_activities").insert({
    cowork_id: coworkId,
    actor_id: actorId,
    actor_name: actorName,
    action,
    target_title: targetTitle,
  });
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSessionEmployee();
  if (!session) return unauthorized();

  const { id } = await params;
  const supabase = createAdminClient();

  const { data: cowork, error } = await supabase.from("coworks").select("*").eq("id", id).single();
  if (error) return NextResponse.json({ error: error.message }, { status: 404 });

  const [{ data: members }, { data: tasks }] = await Promise.all([
    supabase.from("cowork_members").select("*").eq("cowork_id", id),
    supabase.from("cowork_tasks").select("id, status").eq("cowork_id", id),
  ]);

  return NextResponse.json({
    ...cowork,
    members: members ?? [],
    task_counts: {
      todo: (tasks ?? []).filter((t) => t.status === "todo").length,
      in_progress: (tasks ?? []).filter((t) => t.status === "in_progress").length,
      done: (tasks ?? []).filter((t) => t.status === "done").length,
    },
  });
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSessionEmployee();
  if (!session) return unauthorized();

  const { id } = await params;
  const supabase = createAdminClient();

  const { data: member } = await supabase
    .from("cowork_members")
    .select("role")
    .eq("cowork_id", id)
    .eq("employee_id", session.userId)
    .single();

  if (!member) return forbidden();

  const body = await req.json() as { title?: string; description?: string; memo?: string };
  const updates: { title?: string; description?: string; memo?: string; updated_at: string } = {
    updated_at: new Date().toISOString(),
  };
  if (body.title !== undefined) updates.title = body.title;
  if (body.description !== undefined) updates.description = body.description;
  if (body.memo !== undefined) updates.memo = body.memo;

  const { data, error } = await supabase.from("coworks").update(updates).eq("id", id).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await logActivity(supabase, id, session.userId, session.name, "cowork_updated", data.title);

  return NextResponse.json(data);
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSessionEmployee();
  if (!session) return unauthorized();

  const { id } = await params;
  const supabase = createAdminClient();

  const { data: member } = await supabase
    .from("cowork_members")
    .select("role")
    .eq("cowork_id", id)
    .eq("employee_id", session.userId)
    .single();

  if (!member || member.role !== "owner") return forbidden();

  const { error } = await supabase.from("coworks").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
