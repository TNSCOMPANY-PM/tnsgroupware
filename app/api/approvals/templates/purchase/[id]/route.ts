import { createAdminClient } from "@/utils/supabase/admin";
import { NextResponse } from "next/server";

const ALLOWED_KEYS = [
  "name",
  "title",
  "purchase_url",
  "purchase_id",
  "purchase_password",
  "item_name",
  "purpose",
];

/** 비품구입 템플릿 수정 */
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const supabase = createAdminClient();
  const { id } = await params;
  const body = await req.json();
  const payload: Record<string, string> = {};
  for (const key of ALLOWED_KEYS) {
    if (body[key] !== undefined) payload[key] = String(body[key] ?? "").trim();
  }
  if (Object.keys(payload).length === 0) return NextResponse.json({ error: "No fields to update" }, { status: 400 });
  const { data, error } = await supabase
    .from("approval_purchase_templates")
    .update(payload)
    .eq("id", id)
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

/** 비품구입 템플릿 삭제 */
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const supabase = createAdminClient();
  const { id } = await params;
  const { error } = await supabase.from("approval_purchase_templates").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
