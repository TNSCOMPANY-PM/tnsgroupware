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

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string; taskId: string }> }
) {
  const session = await getSessionEmployee();
  if (!session) return unauthorized();

  const { id, taskId } = await params;
  const supabase = createAdminClient();

  const { data: member } = await supabase
    .from("cowork_members")
    .select("role")
    .eq("cowork_id", id)
    .eq("employee_id", String(session.employeeId))
    .single();

  if (!member) return forbidden();

  const { data: existingTask } = await supabase
    .from("cowork_tasks")
    .select("title, status")
    .eq("id", taskId)
    .single();

  const body = await req.json() as {
    title?: string;
    description?: string;
    assignee_id?: string;
    assignee_name?: string;
    status?: "todo" | "in_progress" | "done";
    priority?: "low" | "normal" | "high";
    due_date?: string;
    order_index?: number;
    depends_on?: string[];
  };

  // depends_on은 별도 테이블이므로 분리
  const { depends_on, ...updateFields } = body;

  const { data: task, error } = await supabase
    .from("cowork_tasks")
    .update(updateFields)
    .eq("id", taskId)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // 의존성 업데이트
  if (depends_on !== undefined) {
    await supabase.from("cowork_task_deps").delete().eq("task_id", taskId);
    if (depends_on.length > 0) {
      await supabase.from("cowork_task_deps").insert(
        depends_on.map((depId: string) => ({ task_id: taskId, depends_on_id: depId }))
      );
    }
  }

  if (body.status && existingTask && body.status !== existingTask.status) {
    await logActivity(supabase, id, String(session.employeeId), session.name, "task_moved", task.title);
  } else {
    await logActivity(supabase, id, String(session.employeeId), session.name, "task_updated", task.title);
  }

  return NextResponse.json(task);
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string; taskId: string }> }
) {
  const session = await getSessionEmployee();
  if (!session) return unauthorized();

  const { id, taskId } = await params;
  const supabase = createAdminClient();

  const { data: member } = await supabase
    .from("cowork_members")
    .select("role")
    .eq("cowork_id", id)
    .eq("employee_id", String(session.employeeId))
    .single();

  if (!member) return forbidden();

  const { data: task } = await supabase
    .from("cowork_tasks")
    .select("title")
    .eq("id", taskId)
    .single();

  await supabase.from("cowork_task_deps").delete().eq("task_id", taskId);
  await supabase.from("cowork_task_deps").delete().eq("depends_on_id", taskId);

  const { error } = await supabase.from("cowork_tasks").delete().eq("id", taskId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await logActivity(supabase, id, String(session.employeeId), session.name, "task_deleted", task?.title);

  return NextResponse.json({ ok: true });
}
