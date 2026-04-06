import { createAdminClient } from "@/utils/supabase/admin";
import { NextResponse } from "next/server";
import { getSessionEmployee, unauthorized, forbidden } from "@/utils/apiAuth";

// Vercel body 제한 우회: presigned URL로 클라이언트가 직접 Storage에 업로드
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

  const body = await request.json() as { file_name: string; folder?: string };
  const { file_name, folder } = body;
  if (!file_name) return NextResponse.json({ error: "file_name required" }, { status: 400 });

  const safeName = file_name.replace(/[^a-zA-Z0-9._-]/g, "_");
  const storagePath = `cowork/${id}/${Date.now()}_${safeName}`;

  // presigned upload URL 생성 (클라이언트가 이 URL로 직접 PUT)
  const { data: signedData, error: signErr } = await supabase.storage
    .from("documents")
    .createSignedUploadUrl(storagePath);

  if (signErr || !signedData) {
    return NextResponse.json({ error: signErr?.message || "서명 URL 생성 실패" }, { status: 500 });
  }

  const { data: urlData } = supabase.storage.from("documents").getPublicUrl(storagePath);

  // DB에 문서 레코드 미리 추가
  const { data: doc, error: dbErr } = await supabase
    .from("cowork_documents")
    .insert({
      cowork_id: id,
      type: "file",
      file_name,
      file_url: urlData.publicUrl,
      ...(folder ? { folder } : {}),
      uploaded_by: String(session.employeeId),
      uploader_name: session.name,
    })
    .select()
    .single();

  if (dbErr) return NextResponse.json({ error: dbErr.message }, { status: 500 });

  await supabase.from("cowork_activities").insert({
    cowork_id: id,
    actor_id: String(session.employeeId),
    actor_name: session.name,
    action: "document_uploaded",
    target_title: file_name,
  });

  return NextResponse.json({
    ...doc,
    signed_url: signedData.signedUrl,
    token: signedData.token,
    storage_path: storagePath,
  }, { status: 201 });
}
