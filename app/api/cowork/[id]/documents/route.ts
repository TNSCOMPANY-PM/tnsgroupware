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
  const { data, error } = await supabase.from("cowork_documents").select("*").eq("cowork_id", id).order("created_at", { ascending: false });
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

  const { data: member } = await supabase.from("cowork_members").select("role").eq("cowork_id", id).eq("employee_id", session.userId).single();
  if (!member) return forbidden();

  const body = await request.json() as { type: "file" | "link"; file_name?: string; file_url?: string; link_url?: string; link_title?: string };
  const { data, error } = await supabase.from("cowork_documents").insert({
    cowork_id: id,
    type: body.type,
    file_name: body.file_name,
    file_url: body.file_url,
    link_url: body.link_url,
    link_title: body.link_title,
    uploaded_by: session.userId,
    uploader_name: session.name,
  }).select().single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await supabase.from("cowork_activities").insert({ cowork_id: id, actor_id: session.userId, actor_name: session.name, action: "document_uploaded", target_title: body.file_name ?? body.link_title ?? "" });
  return NextResponse.json(data, { status: 201 });
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSessionEmployee();
  if (!session) return unauthorized();

  const { id } = await params;
  const { searchParams } = new URL(request.url);
  const docId = searchParams.get("doc_id");
  if (!docId) return NextResponse.json({ error: "doc_id required" }, { status: 400 });

  const supabase = createAdminClient();
  const { data: member } = await supabase.from("cowork_members").select("role").eq("cowork_id", id).eq("employee_id", session.userId).single();
  if (!member) return forbidden();

  const { error } = await supabase.from("cowork_documents").delete().eq("id", docId).eq("cowork_id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
