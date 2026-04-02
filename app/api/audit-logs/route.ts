import { createAdminClient } from "@/utils/supabase/admin";
import { NextResponse } from "next/server";
import { getSessionEmployee, unauthorized } from "@/utils/apiAuth";

export async function GET(req: Request) {
  const session = await getSessionEmployee();
  if (!session) return unauthorized();

  const supabase = createAdminClient();
  const { searchParams } = new URL(req.url);
  const limit = Math.min(parseInt(searchParams.get("limit") ?? "50"), 200);
  const targetType = searchParams.get("target_type");

  let query = supabase
    .from("audit_logs")
    .select("id, action, actor_name, target_id, target_type, detail, created_at")
    .order("created_at", { ascending: false })
    .limit(limit);

  if (targetType) query = query.eq("target_type", targetType);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data ?? []);
}
