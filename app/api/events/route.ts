import { createAdminClient } from "@/utils/supabase/admin";
import { NextResponse } from "next/server";
import { getSessionEmployee, unauthorized } from "@/utils/apiAuth";

export async function GET(req: Request) {
  const session = await getSessionEmployee();
  if (!session) return unauthorized();

  const supabase = createAdminClient();
  const { searchParams } = new URL(req.url);
  const from = searchParams.get("from");
  const to = searchParams.get("to");
  let query = supabase.from("calendar_events").select("*").order("start_date", { ascending: true });
  if (from && to) {
    query = query.lte("start_date", to).or(`end_date.gte.${from},end_date.is.null`);
  } else {
    if (from) query = query.gte("start_date", from);
    if (to) query = query.lte("start_date", to);
  }
  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function POST(req: Request) {
  const session = await getSessionEmployee();
  if (!session) return unauthorized();

  const supabase = createAdminClient();
  const body = await req.json();
  const { data, error } = await supabase.from("calendar_events").insert(body).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}
