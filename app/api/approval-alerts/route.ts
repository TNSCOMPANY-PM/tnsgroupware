import { createAdminClient } from "@/utils/supabase/admin";
import { NextResponse } from "next/server";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const userId = searchParams.get("userId");
  if (!userId) return NextResponse.json([]);

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("approval_alerts")
    .select("*")
    .eq("target_user_id", userId)
    .eq("is_done", false)
    .order("created_at", { ascending: false });

  if (error) return NextResponse.json([]);
  return NextResponse.json(data ?? []);
}

export async function PATCH(req: Request) {
  const { id } = await req.json();
  const supabase = createAdminClient();
  await supabase.from("approval_alerts").update({ is_done: true }).eq("id", id);
  return NextResponse.json({ ok: true });
}
