import { createAdminClient } from "@/utils/supabase/admin";
import { NextResponse } from "next/server";
import { getSessionEmployee, unauthorized } from "@/utils/apiAuth";

/**
 * GET /api/clients/unmatched
 * finance 테이블에서 category가 null(미매핑)이고 client_name이 있는 항목을
 * client_name별로 집계해 반환합니다.
 */
export async function GET() {
  const session = await getSessionEmployee();
  if (!session) return unauthorized();

  const supabase = createAdminClient();

  const { data, error } = await supabase
    .from("finance")
    .select("id, date, amount, type, client_name, sender_name, description")
    .is("category", null)
    .not("client_name", "is", null)
    .neq("client_name", "")
    .order("date", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // client_name별 집계
  const map = new Map<
    string,
    { count: number; total: number; lastDate: string; type: string; ids: string[] }
  >();
  for (const row of data ?? []) {
    const key = (row.client_name as string).trim();
    if (!key) continue;
    const prev = map.get(key);
    if (prev) {
      prev.count++;
      prev.total += Number(row.amount) || 0;
      if ((row.date ?? "") > prev.lastDate) prev.lastDate = String(row.date ?? "");
      prev.ids.push(row.id);
    } else {
      map.set(key, {
        count: 1,
        total: Number(row.amount) || 0,
        lastDate: String(row.date ?? ""),
        type: String(row.type ?? ""),
        ids: [row.id],
      });
    }
  }

  const result = Array.from(map.entries())
    .map(([name, v]) => ({ name, ...v }))
    .sort((a, b) => b.total - a.total);

  return NextResponse.json(result);
}
