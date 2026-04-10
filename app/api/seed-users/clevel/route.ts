import { NextResponse } from "next/server";
import { createAdminClient } from "@/utils/supabase/admin";
import { getSessionEmployee, unauthorized } from "@/utils/apiAuth";

const DEFAULT_PASSWORD = "12345678";

const CLEVEL_USERS = [
  {
    name: "김태정",
    empNumber: "TNS-20161104",
    email: "taejeong@tns.kr",
    department: "경영",
    role: "C레벨",
    hireDate: "2016-11-04",
  },
  {
    name: "한혜경",
    empNumber: "TNS-20170102",
    email: "hyekyung@tns.kr",
    department: "경영",
    role: "C레벨",
    hireDate: "2017-01-02",
  },
];

export async function GET() {
  const session = await getSessionEmployee();
  if (!session) return unauthorized();

  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  let admin: ReturnType<typeof createAdminClient>;
  try {
    admin = createAdminClient();
  } catch (e) {
    return NextResponse.json({ ok: false, error: `Service role key 미설정 (process.env.${"SUPABASE_SERVICE_ROLE_KEY"})` }, { status: 500 });
  }

  const results = [];

  for (const u of CLEVEL_USERS) {
    // 1. employees 테이블 upsert (email 기준 — 사번 변경 시에도 기존 행 업데이트)
    const { error: empError } = await admin
      .from("employees")
      .upsert(
        {
          emp_number: u.empNumber,
          name: u.name,
          email: u.email,
          department: u.department,
          role: u.role,
          hire_date: u.hireDate,
        },
        { onConflict: "email" }
      );

    const employeeStatus = empError ? `error: ${empError.message}` : "upserted";

    // 2. Supabase Auth 계정 생성
    const { error: createErr } = await admin.auth.admin.createUser({
      email: u.email,
      password: DEFAULT_PASSWORD,
      email_confirm: true,
      user_metadata: { emp_number: u.empNumber, name: u.name },
    });

    let authStatus = "created";
    if (createErr) {
      if (createErr.message?.toLowerCase().includes("already") || createErr.message?.toLowerCase().includes("registered")) {
        // 이미 있으면 비밀번호 리셋
        let uid: string | null = null;
        for (let page = 1; page <= 5; page++) {
          const { data } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
          const found = data?.users?.find((uu) => (uu.email ?? "").toLowerCase() === u.email.toLowerCase());
          if (found?.id) { uid = found.id; break; }
          if (!data?.users || data.users.length < 1000) break;
        }
        if (uid) {
          const { error: updErr } = await admin.auth.admin.updateUserById(uid, {
            password: DEFAULT_PASSWORD,
            user_metadata: { emp_number: u.empNumber, name: u.name },
          });
          authStatus = updErr ? `exists (reset error: ${updErr.message})` : "exists (password reset)";
        } else {
          authStatus = "exists (uid not found)";
        }
      } else {
        authStatus = `error: ${createErr.message}`;
      }
    }

    results.push({ name: u.name, empNumber: u.empNumber, email: u.email, employee: employeeStatus, auth: authStatus });
  }

  return NextResponse.json({
    ok: true,
    message: "C레벨 계정 생성 완료. 사번 + 비밀번호(12345678)로 로그인하세요.",
    accounts: results.map((r) => ({ 이름: r.name, 사번: r.empNumber, 이메일: r.email, employee: r.employee, auth: r.auth })),
  });
}
