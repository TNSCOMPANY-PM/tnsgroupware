import { createAdminClient } from "@/utils/supabase/admin";
import { NextResponse } from "next/server";
import { getSessionEmployee, unauthorized, forbidden, isTeamLeadOrAbove } from "@/utils/apiAuth";

export async function GET(req: Request) {
  const session = await getSessionEmployee();
  if (!session) return unauthorized();

  const { searchParams } = new URL(req.url);
  const key = searchParams.get("key");
  if (!key) return NextResponse.json({ error: "key required" }, { status: 400 });
  const supabase = createAdminClient();
  const { data } = await supabase.from("finance_settings").select("value").eq("key", key).single();
  return NextResponse.json({ value: data?.value ?? null });
}

export async function POST(req: Request) {
  const session = await getSessionEmployee();
  if (!session) return unauthorized();

  const { key, value } = await req.json() as { key: string; value: string };
  if (!key) return NextResponse.json({ error: "key required" }, { status: 400 });

  if (!isTeamLeadOrAbove(session.role)) return forbidden();

  const supabase = createAdminClient();
  await supabase.from("finance_settings").upsert({ key, value, updated_at: new Date().toISOString() });
  return NextResponse.json({ ok: true });
}
