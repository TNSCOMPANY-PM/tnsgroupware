import { NextResponse } from "next/server";
import { createAdminClient } from "@/utils/supabase/admin";

/** 통합 입출금 원장용 finance 목록 (서버에서 Supabase 조회) */
export async function GET() {
  try {
    const supabase = createAdminClient();
    const allRows: unknown[] = [];
    const PAGE = 1000;
    let from = 0;

    while (true) {
      const { data, error } = await supabase
        .from("finance")
        .select("id,month,type,amount,category,description,created_at,status,client_name,date")
        .order("created_at", { ascending: false })
        .range(from, from + PAGE - 1);

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
