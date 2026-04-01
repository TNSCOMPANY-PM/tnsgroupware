import { createClient } from "@/utils/supabase/server";
import { NextResponse } from "next/server";
import { getSessionEmployee, unauthorized } from "@/utils/apiAuth";

export async function GET(req: Request) {
  const session = await getSessionEmployee();
  if (!session) return unauthorized();

  const supabase = await createClient();
  const { searchParams } = new URL(req.url);
  const userId = searchParams.get("userId");

  let query = supabase
    .from("client_alerts")
    .select("*")
    .eq("is_done", false)
    .order("triggered_date", { ascending: false });

  if (userId) query = query.eq("target_user_id", userId);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data ?? []);
}

export async function PATCH(req: Request) {
  const session = await getSessionEmployee();
  if (!session) return unauthorized();

  const supabase = await createClient();
  const { id } = await req.json();
  const { error } = await supabase
    .from("client_alerts")
    .update({ is_done: true })
    .eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
