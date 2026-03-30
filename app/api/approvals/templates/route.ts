import { createClient } from "@/utils/supabase/server";
import { NextResponse } from "next/server";

/** 전체 공유 간단 정산 템플릿 목록 */
export async function GET() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("approval_settlement_templates")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data ?? []);
}

/** 새 템플릿 추가 (전체 공유) */
export async function POST(req: Request) {
  const supabase = await createClient();
  const body = await req.json();
  const {
    name,
    title,
    payment_reason,
    sheet_classification,
    bank,
    account_number,
    account_holder_name,
    attachment_note,
    ledger_category,
  } = body;
  const payload = {
    name: name?.trim() ?? "",
    title: title?.trim() ?? "",
    payment_reason: payment_reason?.trim() ?? "",
    sheet_classification: sheet_classification?.trim() ?? "",
    bank: bank?.trim() ?? "",
    account_number: account_number?.trim() ?? "",
    account_holder_name: account_holder_name?.trim() ?? "",
    attachment_note: attachment_note?.trim() ?? "",
    ledger_category: ledger_category?.trim() ?? null,
  };
  const { data, error } = await supabase
    .from("approval_settlement_templates")
    .insert(payload)
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}
