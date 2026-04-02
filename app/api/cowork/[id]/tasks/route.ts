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

  const { data: tasks, error } = await supabase
    .from("cowork_tasks")
    .select("*")
    .eq("cowork_id", id)
    .order("order_index", { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const taskIds = (tasks ?? []).map((t) => t.id);

  const { data: deps } = await supabase
    .from("cowork_task_deps")
    .select("task_id, depends_on_id")
    .in("task_id", taskIds);

  const result = (tasks ?? []).map((task) => ({
    ...task,
    depends_on: (deps ?? []).filter((d) => d.task_id === task.id).map((d) => d.depends_on_id),
  }));

  return NextResponse.json(result);
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
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

  const body = await req.json() as {
    title: string;
    description?: string;
    assignee_id?: string;
    assignee_name?: string;
    status?: "todo" | "in_progress" | "done";
    priority?: "low" | "normal" | "high";
    due_date?: string;
    depends_on?: string[];
  };

  const { title, description, assignee_id, assignee_name, status, priority, due_date, depends_on } = body;

  if (!title) return NextResponse.json({ error: "title is required" }, { status: 400 });

  const { data: lastTask } = await supabase
    .from("cowork_tasks")
    .select("order_index")
    .eq("cowork_id", id)
    .order("order_index", { ascending: false })
    .limit(1)
    .single();

  const orderIndex = (lastTask?.order_index ?? 0) + 1;

  const { data: task, error } = await supabase
    .from("cowork_tasks")
    .insert({
      cowork_id: id,
      title,
      description,
      assignee_id,
      assignee_name,
      status: status ?? "todo",
      priority: priority ?? "normal",
      due_date,
      created_by: session.userId,
      creator_name: session.name,
      order_index: orderIndex,
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  if (depends_on && depends_on.length > 0) {
    const depInserts = depends_on.map((depId) => ({ task_id: task.id, depends_on_id: depId }));
    await supabase.from("cowork_task_deps").insert(depInserts);
  }

  await logActivity(supabase, id, session.userId, session.name, "task_created", title);

  return NextResponse.json({ ...task, depends_on: depends_on ?? [] }, { status: 201 });
}
