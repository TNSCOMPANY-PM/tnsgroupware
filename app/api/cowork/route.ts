import { createAdminClient } from "@/utils/supabase/admin";
import { NextResponse } from "next/server";
import { getSessionEmployee, unauthorized } from "@/utils/apiAuth";

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

export async function GET() {
  const session = await getSessionEmployee();
  if (!session) return unauthorized();

  const supabase = createAdminClient();

  const { data: coworks, error } = await supabase
    .from("coworks")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const ids = (coworks ?? []).map((c) => c.id);

  const [{ data: members }, { data: tasks }] = await Promise.all([
    supabase.from("cowork_members").select("cowork_id, employee_id, employee_name, role").in("cowork_id", ids),
    supabase.from("cowork_tasks").select("cowork_id, status").in("cowork_id", ids),
  ]);

  const result = (coworks ?? []).map((cowork) => {
    const coworkMembers = (members ?? []).filter((m) => m.cowork_id === cowork.id);
    const coworkTasks = (tasks ?? []).filter((t) => t.cowork_id === cowork.id);
    return {
      ...cowork,
      member_count: coworkMembers.length,
      members: coworkMembers,
      task_counts: {
        todo: coworkTasks.filter((t) => t.status === "todo").length,
        in_progress: coworkTasks.filter((t) => t.status === "in_progress").length,
        done: coworkTasks.filter((t) => t.status === "done").length,
      },
    };
  });

  return NextResponse.json(result);
}

export async function POST(req: Request) {
  const session = await getSessionEmployee();
  if (!session) return unauthorized();

  const body = await req.json() as { title: string; description?: string; memberIds: string[]; memberNames: string[] };
  const { title, description, memberIds, memberNames } = body;

  if (!title) return NextResponse.json({ error: "title is required" }, { status: 400 });

  const supabase = createAdminClient();

  const { data: cowork, error } = await supabase
    .from("coworks")
    .insert({ title, description, created_by: session.userId, creator_name: session.name })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const memberInserts = [
    { cowork_id: cowork.id, employee_id: session.userId, employee_name: session.name, role: "owner" },
    ...(memberIds ?? []).map((id, i) => ({
      cowork_id: cowork.id,
      employee_id: id,
      employee_name: memberNames?.[i] ?? "",
      role: "member",
    })),
  ];

  const { error: memberError } = await supabase.from("cowork_members").insert(memberInserts);
  if (memberError) return NextResponse.json({ error: memberError.message }, { status: 500 });

  await logActivity(supabase, cowork.id, session.userId, session.name, "cowork_created", title);

  return NextResponse.json(cowork, { status: 201 });
}
