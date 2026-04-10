import { createAdminClient } from "@/utils/supabase/admin";
import { NextResponse } from "next/server";
import { getSessionEmployee, unauthorized } from "@/utils/apiAuth";

/** 비품구입 템플릿 목록 */
export async function GET() {
  const session = await getSessionEmployee();
  if (!session) return unauthorized();

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("approval_purchase_templates")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data ?? []);
}

/** 비품구입 템플릿 추가 */
export async function POST(req: Request) {
  const session = await getSessionEmployee();
  if (!session) return unauthorized();

  const supabase = createAdminClient();
  const body = await req.json();
  const {
    name,
    title,
    purchase_url,
    purchase_id,
    purchase_password,
    item_name,
    purpose,
  } = body;
  const payload = {
    name: name?.trim() ?? "",
    title: title?.trim() ?? "",
    purchase_url: purchase_url?.trim() ?? "",
    purchase_id: purchase_id?.trim() ?? "",
    purchase_password: purchase_password?.trim() ?? "",
    item_name: item_name?.trim() ?? "",
    purpose: purpose?.trim() ?? "",
  };
  const { data, error } = await supabase
    .from("approval_purchase_templates")
    .insert(payload)
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}
