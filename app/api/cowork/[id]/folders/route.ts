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
  const { data, error } = await supabase.from("cowork_folders").select("*").eq("cowork_id", id).order("created_at");
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

  const body = await request.json() as { name: string };
  if (!body.name?.trim()) return NextResponse.json({ error: "name required" }, { status: 400 });

  const { data, error } = await supabase.from("cowork_folders").insert({ cowork_id: id, name: body.name.trim() }).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data, { status: 201 });
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSessionEmployee();
  if (!session) return unauthorized();

  const { id } = await params;
  const supabase = createAdminClient();

  const { data: member } = await supabase.from("cowork_members").select("role").eq("cowork_id", id).eq("employee_id", String(session.employeeId)).single();
  if (!member) return forbidden();

  const { searchParams } = new URL(request.url);
  const folderName = searchParams.get("name");
  if (!folderName) return NextResponse.json({ error: "name required" }, { status: 400 });

  // 폴더 안 파일들 → 미분류로 이동
  await supabase.from("cowork_documents").update({ folder: "" }).eq("cowork_id", id).eq("folder", folderName);

  // 폴더 삭제
  const { error } = await supabase.from("cowork_folders").delete().eq("cowork_id", id).eq("name", folderName);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
