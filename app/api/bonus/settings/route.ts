import { createClient } from "@/utils/supabase/server";
import { NextResponse } from "next/server";
import { logAudit } from "@/lib/auditLog";

export async function GET() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("bonus_settings")
    .select("key, value, label")
    .order("key");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  // key→value 맵으로 변환
  const map: Record<string, number> = {};
  for (const row of data ?? []) map[row.key] = Number(row.value);
  return NextResponse.json(map);
}

export async function PATCH(req: Request) {
  const supabase = await createClient();
  const body = await req.json() as Record<string, number>;
  const errors: string[] = [];
  for (const [key, value] of Object.entries(body)) {
    const { error } = await supabase
      .from("bonus_settings")
      .update({ value, updated_at: new Date().toISOString() })
      .eq("key", key);
    if (error) errors.push(`${key}: ${error.message}`);
  }
  if (errors.length > 0) return NextResponse.json({ error: errors.join(", ") }, { status: 500 });
  logAudit("bonus.settings.updated", { targetType: "bonus_settings", detail: body as Record<string, unknown> }).catch(() => {});
  return NextResponse.json({ ok: true });
}
