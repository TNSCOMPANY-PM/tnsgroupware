import { createAdminClient } from "@/utils/supabase/admin";
import { NextResponse } from "next/server";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const key = searchParams.get("key");
  if (!key) return NextResponse.json({ error: "key required" }, { status: 400 });
  const supabase = createAdminClient();
  const { data } = await supabase.from("finance_settings").select("value").eq("key", key).single();
  return NextResponse.json({ value: data?.value ?? null });
}

export async function POST(req: Request) {
  const { key, value } = await req.json() as { key: string; value: string };
  if (!key) return NextResponse.json({ error: "key required" }, { status: 400 });
  const supabase = createAdminClient();
  await supabase.from("finance_settings").upsert({ key, value, updated_at: new Date().toISOString() });
  return NextResponse.json({ ok: true });
}
