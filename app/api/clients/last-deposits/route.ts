import { createClient } from "@/utils/supabase/server";
import { NextResponse } from "next/server";

export async function GET() {
  const supabase = await createClient();

  // finance 테이블에서 client_name별 최신 입금일 직접 집계
  const { data, error } = await supabase
    .from("finance")
    .select("client_name, date")
    .eq("type", "매출")
    .not("client_name", "is", null)
    .neq("client_name", "")
    .order("date", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // client_name별 최신 날짜만 추출
  const result: Record<string, string> = {};
  for (const row of data ?? []) {
    const name = (row.client_name as string | null)?.trim();
    if (!name) continue;
    if (!result[name]) result[name] = String(row.date ?? "");
  }

  return NextResponse.json(result);
}
