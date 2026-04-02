import { createAdminClient } from "@/utils/supabase/admin";
import { NextResponse } from "next/server";
import { getSessionEmployee, unauthorized, forbidden } from "@/utils/apiAuth";

async function notifyPushbullet(title: string, body: string) {
  const apiKey = process.env.PUSHBULLET_API_KEY?.trim();
  if (!apiKey) return;
  try {
    await fetch("https://api.pushbullet.com/v2/pushes", {
      method: "POST",
      headers: { "Access-Token": apiKey, "Content-Type": "application/json" },
      body: JSON.stringify({ type: "note", title, body }),
    });
  } catch { /* ignore */ }
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSessionEmployee();
  if (!session) return unauthorized();

  const { id } = await params;
  const { searchParams } = new URL(request.url);
  const type = searchParams.get("type");

  const supabase = createAdminClient();
  let query = supabase.from("cowork_requests").select("*").eq("cowork_id", id).order("created_at", { ascending: false });
  if (type === "sent") query = query.eq("from_id", String(session.employeeId));
  else if (type === "received") query = query.eq("to_id", String(session.employeeId));

  const { data, error } = await query;
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

  const { data: member } = await supabase.from("cowork_members").select("role").eq("cowork_id", id).eq("employee_id", String(session.employeeId)).single();
  if (!member) return forbidden();

  const body = await request.json() as { to_id: string; to_name: string; title: string; content?: string; due_date?: string };
  const { to_id, to_name, title, content, due_date } = body;
  if (!to_id || !title) return NextResponse.json({ error: "to_id and title required" }, { status: 400 });

  const { data, error } = await supabase.from("cowork_requests").insert({
    cowork_id: id,
    from_id: String(session.employeeId),
    from_name: session.name,
    to_id,
    to_name,
    title,
    content,
    due_date,
    status: "pending",
  }).select().single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await supabase.from("cowork_activities").insert({ cowork_id: id, actor_id: String(session.employeeId), actor_name: session.name, action: "request_sent", target_title: title });
  await notifyPushbullet(`📋 업무요청: ${title}`, `${session.name}님이 요청을 보냈습니다.\n${content ?? ""}`);

  return NextResponse.json(data, { status: 201 });
}
