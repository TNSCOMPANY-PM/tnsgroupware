import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";
import { createAdminClient } from "@/utils/supabase/admin";

const DEFAULT_PASSWORD = "12345678";

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

/**
 * 단일 사용자 Auth 계정 생성 (rate limit/디버깅용)
 * 사용: /api/seed-users/single?email=... (emp_number는 employees에서 email로 찾음)
 * 또는 /api/seed-users/single?emp_number=TNS-... (RPC로 이메일 매핑이 되어있어야 함)
 *
 * 주의: 비밀번호는 응답으로 반환하지 않습니다.
 */
export async function GET(req: NextRequest) {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  let supabase;
  try {
    supabase = await createClient();
  } catch {
    return NextResponse.json({ ok: false, error: "Supabase가 설정되지 않았습니다." }, { status: 200 });
  }

  let admin: ReturnType<typeof createAdminClient> | null = null;
  try {
    admin = createAdminClient();
  } catch {
    admin = null;
  }

  const { searchParams } = new URL(req.url);
  const emailParam = (searchParams.get("email") ?? "").trim();
  const empNumberParam = (searchParams.get("emp_number") ?? "").trim();

  let email = emailParam;
  let emp_number = empNumberParam;

  if (!email && emp_number) {
    // 기존 로그인과 동일한 방식으로 사번→이메일 매핑을 사용
    const { data, error } = await supabase.rpc("get_email_for_emp_number", { p_emp_number: emp_number });
    if (error) return NextResponse.json({ ok: false, error: `사번→이메일 조회 실패: ${error.message}` }, { status: 500 });
    if (!data || typeof data !== "string") return NextResponse.json({ ok: false, error: "등록된 사번이 아닙니다." }, { status: 400 });
    email = data.trim();
  }

  if (!emp_number && email) {
    const { data } = await supabase.from("employees").select("emp_number").eq("email", email).maybeSingle();
    emp_number = String((data as { emp_number?: string } | null)?.emp_number ?? "").trim();
  }

  if (!email) return NextResponse.json({ ok: false, error: "email 또는 emp_number가 필요합니다." }, { status: 400 });
  if (!isValidEmail(email)) return NextResponse.json({ ok: false, error: `이메일 형식이 올바르지 않습니다: ${email}` }, { status: 400 });

  let auth = "skip";
  if (admin) {
    const { error: createErr } = await admin.auth.admin.createUser({
      email,
      password: DEFAULT_PASSWORD,
      email_confirm: true,
      user_metadata: { emp_number, email },
    });
    if (!createErr) {
      auth = "created";
    } else if (createErr.message?.toLowerCase().includes("already") || createErr.message?.toLowerCase().includes("registered")) {
      // 존재하면 비번 리셋
      let uid: string | null = null;
      for (let page = 1; page <= 5; page++) {
        const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
        if (error) break;
        const found = data?.users?.find((u) => (u.email ?? "").toLowerCase() === email.toLowerCase()) ?? null;
        if (found?.id) { uid = found.id; break; }
        if (!data?.users || data.users.length < 1000) break;
      }
      if (!uid) auth = "exists (user id not found)";
      else {
        const { error: updErr } = await admin.auth.admin.updateUserById(uid, { password: DEFAULT_PASSWORD });
        auth = updErr ? `exists (reset error: ${updErr.message})` : "exists (password reset)";
      }
    } else {
      auth = `error: ${createErr.message}`;
    }
  } else {
    const { error: signUpError } = await supabase.auth.signUp({
      email,
      password: DEFAULT_PASSWORD,
      options: { emailRedirectTo: undefined },
    });
    auth =
      !signUpError ? "created" :
      signUpError.message === "User already registered" ? "exists" :
      `error: ${signUpError.message}`;
  }

  try { await supabase.auth.signOut(); } catch {}

  return NextResponse.json({
    ok: auth === "created" || auth === "exists",
    emp_number: emp_number || null,
    email,
    auth,
    message: "해당 이메일에 초기 비밀번호(지정값)가 설정되었습니다. 로그인은 사번 + 초기 비밀번호로 진행하세요.",
  });
}

