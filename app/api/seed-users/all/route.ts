import { NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";
import { createAdminClient } from "@/utils/supabase/admin";

const DEFAULT_PASSWORD = "12345678";
const SLEEP_MS = 3000;

function isValidEmail(email: string): boolean {
  // 과도하게 엄격하게 하지 않고 기본 형태만 체크
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

/**
 * employees 테이블의 모든 인원에 대해
 * - (1) Supabase Auth 계정 생성 (email + DEFAULT_PASSWORD)
 * - (2) 로그인은 기존처럼 사번(emp_number) + 비밀번호로 수행 (RPC: get_email_for_emp_number)
 *
 * 주의: 비밀번호를 응답으로 반환하지 않습니다.
 */
export async function GET() {
  let supabase;
  try {
    supabase = await createClient();
  } catch {
    return NextResponse.json({
      ok: false,
      error: "Supabase가 설정되지 않았습니다. 환경 변수를 확인하세요.",
    }, { status: 200 });
  }

  // Service Role이 있으면 Admin API로 처리 (rate limit 회피 + 비번 리셋 가능)
  let admin: ReturnType<typeof createAdminClient> | null = null;
  try {
    admin = createAdminClient();
  } catch {
    admin = null;
  }

  const { data: employees, error } = await supabase
    .from("employees")
    .select("id, emp_number, name, email")
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  const list = Array.isArray(employees) ? employees : [];
  const results: { emp_number: string; name: string; email: string; auth: string }[] = [];

  async function findUserIdByEmail(email: string): Promise<string | null> {
    if (!admin) return null;
    // 최대 5페이지(=5000명)까지만 탐색 – 내부용
    for (let page = 1; page <= 5; page++) {
      const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
      if (error) return null;
      const found = data?.users?.find((u) => (u.email ?? "").toLowerCase() === email.toLowerCase()) ?? null;
      if (found?.id) return found.id;
      if (!data?.users || data.users.length < 1000) break;
    }
    return null;
  }

  for (const e of list) {
    const empNumber = String((e as Record<string, unknown>).emp_number ?? "").trim();
    const name = String((e as Record<string, unknown>).name ?? "").trim();
    const email = String((e as Record<string, unknown>).email ?? "").trim();

    if (!empNumber || !email) {
      results.push({ emp_number: empNumber || "(missing)", name: name || "(missing)", email: email || "(missing)", auth: "skip (missing emp_number/email)" });
      continue;
    }
    if (!isValidEmail(email)) {
      results.push({ emp_number: empNumber, name, email, auth: "skip (invalid email format)" });
      continue;
    }

    // ── Admin API 사용 가능: 생성 또는 비번 리셋 ────────────────────────────
    if (admin) {
      const { data: created, error: createErr } = await admin.auth.admin.createUser({
        email,
        password: DEFAULT_PASSWORD,
        email_confirm: true,
        user_metadata: { emp_number: empNumber, name },
      });
      if (!createErr) {
        results.push({ emp_number: empNumber, name, email, auth: "created" });
      } else if (createErr.message?.toLowerCase().includes("already") || createErr.message?.toLowerCase().includes("registered")) {
        const uid = await findUserIdByEmail(email);
        if (!uid) {
          results.push({ emp_number: empNumber, name, email, auth: "exists (user id not found)" });
        } else {
          const { error: updErr } = await admin.auth.admin.updateUserById(uid, {
            password: DEFAULT_PASSWORD,
            user_metadata: { emp_number: empNumber, name },
          });
          results.push({ emp_number: empNumber, name, email, auth: updErr ? `exists (reset error: ${updErr.message})` : "exists (password reset)" });
        }
      } else {
        results.push({ emp_number: empNumber, name, email, auth: `error: ${createErr.message}` });
      }
      await new Promise((r) => setTimeout(r, 150));
      continue;
    }

    // ── Service Role 없음: 기존 signUp 방식(레이트리밋 위험) ───────────────
    let authStatus = "skip";
    const { error: signUpError } = await supabase.auth.signUp({
      email,
      password: DEFAULT_PASSWORD,
      options: { emailRedirectTo: undefined },
    });
    if (!signUpError) authStatus = "created";
    else if (signUpError.message === "User already registered") authStatus = "exists";
    else authStatus = `error: ${signUpError.message}`;
    results.push({ emp_number: empNumber, name, email, auth: authStatus });
    try { await supabase.auth.signOut(); } catch {}
    await new Promise((r) => setTimeout(r, SLEEP_MS));
  }

  const created = results.filter((r) => r.auth === "created").length;
  const exists = results.filter((r) => r.auth === "exists").length;
  const skipped = results.filter((r) => r.auth.startsWith("skip")).length;
  const errored = results.filter((r) => r.auth.startsWith("error")).length;

  return NextResponse.json({
    ok: true,
    message: "직원 전체 계정 생성 작업 완료. /login 에서 사번 + 지정된 초기 비밀번호로 로그인할 수 있습니다.",
    summary: { total: results.length, created, exists, skipped, errored },
    results,
  });
}

