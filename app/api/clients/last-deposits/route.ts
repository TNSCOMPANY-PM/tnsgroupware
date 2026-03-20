import { createClient } from "@/utils/supabase/server";
import { NextResponse } from "next/server";

export async function GET() {
  const supabase = await createClient();

  // Postgres 함수로 GROUP BY 집계
  const { data, error } = await supabase.rpc("get_client_last_deposits");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // { [client_name]: "YYYY-MM-DD" } 형태로 반환
  const result: Record<string, string> = {};
  for (const row of data ?? []) {
    if (row.client_name) result[row.client_name] = row.last_deposit_date;
  }
  return NextResponse.json(result);
}
