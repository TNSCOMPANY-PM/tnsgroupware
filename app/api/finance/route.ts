import { NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";

/** 통합 입출금 원장용 finance 목록 (서버에서 Supabase 조회) */
export async function GET() {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("finance")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) {
      return NextResponse.json(
        { error: error.message, code: error.code },
        { status: 500 }
      );
    }

    return NextResponse.json(Array.isArray(data) ? data : []);
  } catch (e) {
    const err = e instanceof Error ? e : new Error(String(e));
    return NextResponse.json(
      { error: err.message },
      { status: 500 }
    );
  }
}
