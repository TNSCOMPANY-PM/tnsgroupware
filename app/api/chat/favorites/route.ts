import { createAdminClient } from "@/utils/supabase/admin";
import { NextResponse } from "next/server";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const userId = searchParams.get("userId");
  if (!userId) return NextResponse.json({ items: [] });

  const supabase = createAdminClient();
  const { data } = await supabase
    .from("chat_favorites")
    .select("items")
    .eq("user_id", userId)
    .single();

  return NextResponse.json({ items: data?.items ?? [] });
}

export async function POST(req: Request) {
  const { userId, items } = await req.json() as { userId: string; items: string[] };
  if (!userId) return NextResponse.json({ ok: false }, { status: 400 });

  const supabase = createAdminClient();
  await supabase
    .from("chat_favorites")
    .upsert({ user_id: userId, items, updated_at: new Date().toISOString() });

  return NextResponse.json({ ok: true });
}
