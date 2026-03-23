import { createClient } from "@/utils/supabase/server";
import { NextResponse } from "next/server";

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient();
  const { id } = await params;
  const body = await req.json() as Record<string, unknown>;
  const patch: Record<string, unknown> = {};
  if (body.date != null) patch.date = body.date;
  if (body.amount != null) patch.amount = body.amount;
  if (body.senderName != null) patch.sender_name = body.senderName;
  if (body.type != null) patch.type = body.type;
  if (body.bankName != null) patch.bank_name = body.bankName;
  if (body.status != null) patch.status = body.status;
  if (body.classification !== undefined) patch.classification = body.classification;
  if (body.clientName !== undefined) patch.client_name = body.clientName;
  if (body.description !== undefined) patch.description = body.description;

  const { data, error } = await supabase
    .from("ledger_custom_entries")
    .update(patch)
    .eq("id", id)
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient();
  const { id } = await params;
  const { error } = await supabase
    .from("ledger_custom_entries")
    .delete()
    .eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
