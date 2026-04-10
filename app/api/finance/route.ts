import { NextResponse } from "next/server";
import { createAdminClient } from "@/utils/supabase/admin";
import { getSessionEmployee, unauthorized } from "@/utils/apiAuth";

/** 통합 입출금 원장용 finance 목록 — 월 필터 지원 */
export async function GET(request: Request) {
  const session = await getSessionEmployee();
  if (!session) return unauthorized();

  try {
    const { searchParams } = new URL(request.url);
    const month = searchParams.get("month"); // YYYY-MM 형식

    const supabase = createAdminClient();
    const allRows: unknown[] = [];
    const PAGE = 1000;
    let from = 0;

    while (true) {
      let query = supabase
        .from("finance")
        .select("id,month,type,amount,category,description,created_at,status,client_name,date")
        .order("created_at", { ascending: false })
        .range(from, from + PAGE - 1);

      if (month) {
        query = query.eq("month", month);
      }

      const { data, error } = await query;

      if (error) {
        return NextResponse.json(
          { error: error.message, code: error.code },
          { status: 500 }
        );
      }

      allRows.push(...(data ?? []));
      if (!data || data.length < PAGE) break;
      from += PAGE;
    }

    return NextResponse.json(allRows);
  } catch (e) {
    const err = e instanceof Error ? e : new Error(String(e));
    return NextResponse.json(
      { error: err.message },
      { status: 500 }
    );
  }
}
