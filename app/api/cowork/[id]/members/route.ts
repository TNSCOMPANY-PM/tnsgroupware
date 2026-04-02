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
    .from("cowork_members")
    .select("*")
    .eq("cowork_id", id)
    .order("joined_at", { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json(data);
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSessionEmployee();
  if (!session) return unauthorized();

  const { id } = await params;
  const supabase = createAdminClient();

  const { data: memberCheck } = await supabase
    .from("cowork_members")
    .select("role")
    .eq("cowork_id", id)
    .eq("employee_id", session.userId)
    .single();

  if (!memberCheck) {
    // 생성자인 경우에도 허용
    const { data: cw } = await supabase.from("coworks").select("created_by").eq("id", id).single();
    if (!cw || cw.created_by !== session.userId) return forbidden();
  }

  const body = await req.json() as { employee_id: string; employee_name: string };
  const { employee_id, employee_name } = body;

  if (!employee_id || !employee_name) {
    return NextResponse.json({ error: "employee_id and employee_name are required" }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("cowork_members")
    .insert({ cowork_id: id, employee_id, employee_name, role: "member" })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await logActivity(supabase, id, session.userId, session.name, "member_added", employee_name);

  return NextResponse.json(data, { status: 201 });
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSessionEmployee();
  if (!session) return unauthorized();

  const { id } = await params;
  const supabase = createAdminClient();

  const { data: ownerCheck } = await supabase
    .from("cowork_members")
    .select("role")
    .eq("cowork_id", id)
    .eq("employee_id", session.userId)
    .single();

  if (!ownerCheck || ownerCheck.role !== "owner") return forbidden();

  const { searchParams } = new URL(req.url);
  const employeeId = searchParams.get("employee_id");

  if (!employeeId) return NextResponse.json({ error: "employee_id query param required" }, { status: 400 });

  const { data: target } = await supabase
    .from("cowork_members")
    .select("employee_name")
    .eq("cowork_id", id)
    .eq("employee_id", employeeId)
    .single();

  const { error } = await supabase
    .from("cowork_members")
    .delete()
    .eq("cowork_id", id)
    .eq("employee_id", employeeId);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await logActivity(supabase, id, session.userId, session.name, "member_removed", target?.employee_name);

  return NextResponse.json({ ok: true });
}
