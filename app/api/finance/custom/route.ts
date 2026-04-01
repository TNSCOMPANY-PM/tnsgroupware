import { createAdminClient } from "@/utils/supabase/admin";
import { NextResponse } from "next/server";
import { getSessionEmployee, unauthorized } from "@/utils/apiAuth";

export async function GET() {
  const session = await getSessionEmployee();
  if (!session) return unauthorized();

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("ledger_custom_entries")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data ?? []);
}

export async function POST(req: Request) {
  const session = await getSessionEmployee();
  if (!session) return unauthorized();

  const supabase = createAdminClient();
  const body = await req.json() as Record<string, unknown>;
  const { data, error } = await supabase
    .from("ledger_custom_entries")
    .insert({
      id: body.id,
      date: body.date,
      amount: body.amount,
      sender_name: body.senderName ?? null,
      type: body.type,
      bank_name: body.bankName ?? null,
      status: body.status,
      classification: body.classification ?? null,
      client_name: body.clientName ?? null,
      description: body.description ?? null,
    })
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}
