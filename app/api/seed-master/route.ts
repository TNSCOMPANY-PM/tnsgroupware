import { createClient } from "@/utils/supabase/server";
import { NextResponse } from "next/server";

const MASTER_EMAIL = "admin@example.com";
const MASTER_PASSWORD = "REDACTED_MASTER_PW";

export async function GET() {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  let supabase;
  try {
    supabase = await createClient();
  } catch (e) {
    return NextResponse.json({
      ok: false,
      error: "Supabase가 설정되지 않았습니다. 환경 변수(NEXT_PUBLIC_SUPABASE_URL, ANON_KEY)를 확인하세요.",
    }, { status: 200 });
  }

  const { error: signUpError } = await supabase.auth.signUp({
    email: MASTER_EMAIL,
    password: MASTER_PASSWORD,
    options: { emailRedirectTo: undefined },
  });

  const signUpOk =
    !signUpError || signUpError.message === "User already registered";

  const { data: rpcResult, error: rpcError } = await supabase.rpc(
    "create_master_employee_if_missing"
  );

  const duplicateEmployee =
    rpcError &&
    (String(rpcError.code) === "23505" || rpcError.message?.includes("duplicate"));
  if (rpcError && !duplicateEmployee) {
    return NextResponse.json({
      ok: false,
      error: rpcError.message,
      signUpError: signUpError?.message ?? null,
      hint: "Supabase SQL Editor에서 tns_database_schema.sql 전체를 실행한 뒤 다시 호출하세요.",
      login: { 사번: "REDACTED_MASTER_EMP", 비밀번호: MASTER_PASSWORD },
    });
  }

  const message = signUpOk
    ? "마스터 계정이 준비되었습니다. /login 에서 아래 계정으로 로그인하세요."
    : signUpError?.message?.includes("rate limit")
      ? "직원 행은 있습니다. 가입 한도 초과로 Auth 생성 실패. 1시간 후 시드 재실행하거나 Supabase Authentication → Users에서 수동 추가 후 로그인하세요."
      : "직원 행은 있습니다. Supabase Authentication → Users에서 해당 이메일로 사용자 수동 추가 후 로그인하세요.";
  return NextResponse.json({
    ok: true,
    message,
    login: {
      사번: "REDACTED_MASTER_EMP",
      비밀번호: MASTER_PASSWORD,
      이메일: MASTER_EMAIL,
    },
    employee: duplicateEmployee ? "exists" : rpcResult,
    signUpError: signUpOk ? null : signUpError?.message,
  });
}
