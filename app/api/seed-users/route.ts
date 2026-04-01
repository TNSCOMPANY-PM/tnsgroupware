import { createClient } from "@/utils/supabase/server";
import { NextResponse } from "next/server";

const SEED_USERS = [
  { name: "김정섭", empNumber: "TNS-20250201" },
  { name: "김동균", empNumber: "TNS-20190709" },
  { name: "박재민", empNumber: "TNS-20210125" },
  { name: "김용준", empNumber: "TNS-20220117" },
  { name: "심규성", empNumber: "TNS-20220801" },
] as const;

const DEFAULT_PASSWORD = "12345678";

function empNumberToEmail(empNumber: string): string {
  return `${empNumber.replace(/-/g, "")}@example.com`;
}

function empNumberToHireDate(empNumber: string): string {
  const m = empNumber.match(/TNS-(\d{4})(\d{2})(\d{2})/i);
  if (!m) return "2020-01-01";
  return `${m[1]}-${m[2]}-${m[3]}`;
}

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
      error: "Supabase가 설정되지 않았습니다. 환경 변수를 확인하세요.",
    }, { status: 200 });
  }
  const results: { name: string; empNumber: string; employee: string; auth: string }[] = [];

  for (const u of SEED_USERS) {
    const email = empNumberToEmail(u.empNumber);
    const hireDate = empNumberToHireDate(u.empNumber);

    let employeeStatus = "skip";
    const { error: empError } = await supabase.rpc("create_employee", {
      p_emp_number: u.empNumber,
      p_name: u.name,
      p_email: email,
      p_department: "경영",
      p_role: "사원",
      p_hire_date: hireDate,
    });
    if (!empError) employeeStatus = "created";
    else if (String(empError.code) === "23505" || empError.message?.includes("duplicate")) employeeStatus = "exists";
    else employeeStatus = `error: ${empError.message}`;

    let authStatus = "skip";
    const { error: signUpError } = await supabase.auth.signUp({
      email,
      password: DEFAULT_PASSWORD,
      options: { emailRedirectTo: undefined },
    });
    if (!signUpError) authStatus = "created";
    else if (signUpError.message === "User already registered") authStatus = "exists";
    else authStatus = `error: ${signUpError.message}`;

    results.push({ name: u.name, empNumber: u.empNumber, employee: employeeStatus, auth: authStatus });
    await supabase.auth.signOut();
    if (SEED_USERS.indexOf(u) < SEED_USERS.length - 1) {
      await new Promise((r) => setTimeout(r, 2500));
    }
  }

  return NextResponse.json({
    ok: true,
    message: "시드 사용자 생성 완료. /login 에서 사번 + 비밀번호(12345678)로 로그인하세요.",
    password: DEFAULT_PASSWORD,
    results,
  });
}
