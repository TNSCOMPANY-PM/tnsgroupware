import { createAdminClient } from "@/utils/supabase/admin";
import { NextResponse } from "next/server";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const level = searchParams.get("level");
  const limit = Math.min(Number(searchParams.get("limit") ?? "200"), 500);

  const supabase = createAdminClient();
  let query = supabase
    .from("server_logs")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(limit);

  if (level) query = query.eq("level", level);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data ?? []);
}
