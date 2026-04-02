import { createAdminClient } from "@/utils/supabase/admin";
import { NextResponse } from "next/server";
import { getSessionEmployee, unauthorized, forbidden } from "@/utils/apiAuth";

export async function GET(req: Request) {
  const session = await getSessionEmployee();
  if (!session) return unauthorized();

  const { searchParams } = new URL(req.url);
  const userId = searchParams.get("userId");
  if (!userId) return NextResponse.json({ items: [] });

  // 본인 데이터만 조회 가능
  if (String(userId) !== String(session.employeeId)) return forbidden();

  const supabase = createAdminClient();
  const { data } = await supabase
    .from("chat_favorites")
    .select("items")
    .eq("user_id", userId)
    .single();

  return NextResponse.json({ items: data?.items ?? [] });
}

export async function POST(req: Request) {
  const session = await getSessionEmployee();
  if (!session) return unauthorized();

  const { userId, items } = await req.json() as { userId: string; items: string[] };
  if (!userId) return NextResponse.json({ ok: false }, { status: 400 });

  // 본인 데이터만 수정 가능
  if (String(userId) !== String(session.employeeId)) return forbidden();

  const supabase = createAdminClient();
  await supabase
    .from("chat_favorites")
    .upsert({ user_id: userId, items, updated_at: new Date().toISOString() });

  return NextResponse.json({ ok: true });
}
