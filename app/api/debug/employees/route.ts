import { NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

/**
 * 사원 목록 미표시 원인 파악용 진단 API.
 * 브라우저에서 /api/debug/employees 호출 후 응답 JSON을 공유하면 됩니다.
 * 프로덕션에서는 삭제하거나 보호하는 것을 권장합니다.
 */
export async function GET() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
  const hasEnv = !!(url && key && url !== "undefined" && key !== "undefined");

  if (!hasEnv) {
    return NextResponse.json({
      ok: false,
      hasEnv: false,
      message: "NEXT_PUBLIC_SUPABASE_URL 또는 NEXT_PUBLIC_SUPABASE_ANON_KEY가 없거나 비어 있음",
      hint: "로컬: .env.local / 배포: Vercel 환경 변수 확인",
    });
  }

  try {
    const cookieStore = await cookies();
    const supabase = createServerClient(url!, key!, {
      cookies: {
        getAll() {
          return cookieStore.getAll().map((c) => ({ name: c.name, value: c.value }));
        },
        setAll() {},
      },
    });

    const { data, error } = await supabase.from("employees").select("id, name").limit(5);

    if (error) {
      return NextResponse.json({
        ok: false,
        hasEnv: true,
        message: "Supabase 조회 실패",
        supabaseError: {
          message: error.message,
          code: error.code,
          details: error.details,
        },
        hint: "RLS 정책(anon_select_employees) 또는 테이블/컬럼 존재 여부 확인",
      });
    }

    return NextResponse.json({
      ok: true,
      hasEnv: true,
      count: Array.isArray(data) ? data.length : 0,
      sample: Array.isArray(data) ? data : null,
      message: "서버에서 employees 조회 성공. 클라이언트 쪽(브라우저/네트워크) 문제일 수 있음",
    });
  } catch (e) {
    const err = e instanceof Error ? e : new Error(String(e));
    return NextResponse.json({
      ok: false,
      hasEnv: true,
      message: "예외 발생",
      error: err.message,
      stack: process.env.NODE_ENV === "development" ? err.stack : undefined,
    });
  }
}
