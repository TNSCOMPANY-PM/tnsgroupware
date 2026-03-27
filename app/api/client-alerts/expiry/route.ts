import { createAdminClient } from "@/utils/supabase/admin";
import { NextResponse } from "next/server";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const userName = searchParams.get("userName");

  // 김동균에게만 표시
  if (userName !== "김동균") return NextResponse.json([]);

  const supabase = createAdminClient();
  const today = new Date();
  const todayStr = today.toISOString().slice(0, 10);
  const limitDate = new Date(today);
  limitDate.setDate(limitDate.getDate() + 15);
  const limitStr = limitDate.toISOString().slice(0, 10);

  const { data, error } = await supabase
    .from("clients")
    .select("id, name, hosting_expires_at, domain_expires_at, ssl_expires_at")
    .eq("category", "티제이웹")
    .or(
      `hosting_expires_at.gte.${todayStr},domain_expires_at.gte.${todayStr},ssl_expires_at.gte.${todayStr}`
    );

  if (error) return NextResponse.json([]);

  type ClientRow = {
    id: string;
    name: string;
    hosting_expires_at: string | null;
    domain_expires_at: string | null;
    ssl_expires_at: string | null;
  };

  const alerts: { id: string; client_name: string; type: string; expires_at: string; days_left: number }[] = [];

  for (const c of (data ?? []) as ClientRow[]) {
    const checks = [
      { type: "호스팅", date: c.hosting_expires_at },
      { type: "도메인", date: c.domain_expires_at },
      { type: "인증서", date: c.ssl_expires_at },
    ];
    for (const { type, date } of checks) {
      if (!date) continue;
      if (date < todayStr || date > limitStr) continue;
      const ms = new Date(date).getTime() - today.getTime();
      const days = Math.ceil(ms / (1000 * 60 * 60 * 24));
      alerts.push({ id: `${c.id}-${type}`, client_name: c.name, type, expires_at: date, days_left: days });
    }
  }

  return NextResponse.json(alerts);
}
