import { createAdminClient } from "@/utils/supabase/admin";
import { NextResponse } from "next/server";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("client_comments")
    .select("id, author_name, content, created_at")
    .eq("client_id", id)
    .order("created_at", { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data ?? []);
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const { author_name, content } = await req.json() as { author_name: string; content: string };
  if (!content?.trim()) return NextResponse.json({ error: "내용을 입력하세요." }, { status: 400 });
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("client_comments")
    .insert({ client_id: id, author_name: author_name || "알 수 없음", content: content.trim() })
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  await params;
  const { commentId } = await req.json() as { commentId: string };
  const supabase = createAdminClient();
  const { error } = await supabase.from("client_comments").delete().eq("id", commentId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
