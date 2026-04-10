import { createAdminClient } from "@/utils/supabase/admin";
import { NextResponse } from "next/server";
import { getSessionEmployee, unauthorized } from "@/utils/apiAuth";

export async function GET() {
  const session = await getSessionEmployee();
  if (!session) return unauthorized();

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("granted_leaves")
    .select("*")
    .order("granted_at", { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function POST(req: Request) {
  const session = await getSessionEmployee();
  if (!session) return unauthorized();

  const supabase = createAdminClient();
  const body = await req.json();
  const { data, error } = await supabase
    .from("granted_leaves")
    .insert({
      id: body.id,
      user_id: body.userId,
      user_name: body.userName,
      year: body.year,
      days: body.days,
      type: body.type,
      reason: body.reason ?? null,
      granted_at: body.grantedAt ?? new Date().toISOString(),
    })
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}
