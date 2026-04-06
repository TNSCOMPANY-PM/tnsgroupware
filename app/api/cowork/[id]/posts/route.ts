import { createAdminClient } from "@/utils/supabase/admin";
import { NextResponse } from "next/server";
import { getSessionEmployee, unauthorized, forbidden } from "@/utils/apiAuth";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSessionEmployee();
  if (!session) return unauthorized();

  const { id } = await params;
  const supabase = createAdminClient();

  const { data, error } = await supabase
    .from("cowork_posts")
    .select("*")
    .eq("cowork_id", id)
    .order("pinned", { ascending: false })
    .order("created_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data ?? []);
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSessionEmployee();
  if (!session) return unauthorized();

  const { id } = await params;
  const supabase = createAdminClient();

  const { data: member } = await supabase
    .from("cowork_members")
    .select("role")
    .eq("cowork_id", id)
    .eq("employee_id", String(session.employeeId))
    .single();

  if (!member) return forbidden();

  const body = await request.json() as { title: string; content?: string; pinned?: boolean };
  if (!body.title?.trim()) return NextResponse.json({ error: "title required" }, { status: 400 });

  const { data, error } = await supabase
    .from("cowork_posts")
    .insert({
      cowork_id: id,
      title: body.title.trim(),
      content: body.content?.trim() ?? null,
      author_id: String(session.employeeId),
      author_name: session.name,
      pinned: body.pinned ?? false,
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await supabase.from("cowork_activities").insert({
    cowork_id: id,
    actor_id: String(session.employeeId),
    actor_name: session.name,
    action: "post_created",
    target_title: body.title.trim(),
  });

  return NextResponse.json(data, { status: 201 });
}
