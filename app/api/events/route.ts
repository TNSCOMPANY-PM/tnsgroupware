import { createAdminClient } from "@/utils/supabase/admin";
import { NextResponse } from "next/server";

export async function GET(req: Request) {
  const supabase = createAdminClient();
  const { searchParams } = new URL(req.url);
  const from = searchParams.get("from");
  const to = searchParams.get("to");
  let query = supabase.from("calendar_events").select("*").order("start_date", { ascending: true });
  // 범위 내 시작하는 이벤트 + 이전 시작했지만 범위 내 종료일 있는 이벤트
  if (from && to) {
    // start_date <= to AND (end_date >= from OR end_date IS NULL)
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
  const supabase = createAdminClient();
  const body = await req.json();
  const { data, error } = await supabase.from("calendar_events").insert(body).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}
