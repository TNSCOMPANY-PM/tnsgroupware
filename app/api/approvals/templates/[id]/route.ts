import { createAdminClient } from "@/utils/supabase/admin";
import { NextResponse } from "next/server";

/** 템플릿 수정 (이름 등) */
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const supabase = createAdminClient();
  const { id } = await params;
  const body = await req.json();
  const allowed = [
    "name",
    "title",
    "payment_reason",
    "sheet_classification",
    "bank",
    "account_number",
    "account_holder_name",
    "attachment_note",
  ];
  const payload: Record<string, string> = {};
  for (const key of allowed) {
    if (body[key] !== undefined) payload[key] = String(body[key] ?? "").trim();
  }
  if (Object.keys(payload).length === 0) return NextResponse.json({ error: "No fields to update" }, { status: 400 });
  const { data, error } = await supabase
    .from("approval_settlement_templates")
    .update(payload)
    .eq("id", id)
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

/** 템플릿 삭제 */
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const supabase = createAdminClient();
  const { id } = await params;
  const { error } = await supabase.from("approval_settlement_templates").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
