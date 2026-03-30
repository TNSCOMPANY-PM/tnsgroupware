import { createAdminClient } from "@/utils/supabase/admin";
import { NextResponse } from "next/server";

/** 다음 연락 예정일이 오늘~7일 이내인 활성 고객 목록 */
export async function GET() {
  const supabase = createAdminClient();
  const today = new Date().toISOString().slice(0, 10);
  const limit = new Date();
  limit.setDate(limit.getDate() + 7);
  const limitStr = limit.toISOString().slice(0, 10);

  const { data, error } = await supabase
    .from("clients")
    .select("id, name, category, next_contact_at")
    .neq("status", "종료")
    .gte("next_contact_at", today)
    .lte("next_contact_at", limitStr)
    .order("next_contact_at", { ascending: true });

  if (error) return NextResponse.json([]);

  return NextResponse.json(
    (data ?? []).map((c) => {
      const days = Math.ceil((new Date(c.next_contact_at).getTime() - new Date(today).getTime()) / 86400000);
      return { id: c.id, name: c.name, category: c.category, next_contact_at: c.next_contact_at, days_left: days };
    })
  );
}
