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

  const { data, error } = await supabase
    .from("cowork_schedules")
    .select("*")
    .eq("cowork_id", id)
    .order("start_date", { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json(data);
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
    start_date: string;
    end_date?: string;
    assignee_id?: string;
    assignee_name?: string;
    color?: string;
  };

  const { title, start_date, end_date, assignee_id, assignee_name, color } = body;

  if (!title || !start_date) {
    return NextResponse.json({ error: "title and start_date are required" }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("cowork_schedules")
    .insert({ cowork_id: id, title, start_date, end_date, assignee_id, assignee_name, color })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await logActivity(supabase, id, session.userId, session.name, "schedule_created", title);

  return NextResponse.json(data, { status: 201 });
}
