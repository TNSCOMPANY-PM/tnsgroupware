"use server";

import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { createClient } from "@/utils/supabase/server";
import {
  isMasterLogin,
  createMasterToken,
  getMasterCookieName,
} from "@/utils/masterAuth";

/** 로그아웃: 마스터·Supabase 쿠키 제거. 리다이렉트는 호출 측에서 처리. */
export async function logout() {
  try {
    const cookieStore = await cookies();
    cookieStore.delete(getMasterCookieName());
  } catch {
    // 쿠키 삭제만 실패해도 진행
  }
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
  if (url && key) {
    try {
      const supabase = await createClient();
      await supabase.auth.signOut();
    } catch {
      // ignore
    }
  }
}

export async function loginWithEmpNumber(formData: FormData) {
  const empNumber = (formData.get("emp_number") as string)?.trim();
  const password = formData.get("password") as string;

  if (!empNumber || !password) {
    return { error: "사번과 비밀번호를 입력해 주세요." };
  }

  // 마스터 계정: Supabase 없이 바로 로그인 (테스트용)
  if (isMasterLogin(empNumber, password)) {
    const cookieStore = await cookies();
    cookieStore.set(getMasterCookieName(), await createMasterToken(), {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 60 * 60 * 24 * 30, // 30일
      path: "/",
    });
    const next = formData.get("next") as string | null;
    redirect(next && next.startsWith("/") ? next : "/dashboard");
  }

  const supabase = await createClient();

  const { data: email, error: rpcError } = await supabase.rpc(
    "get_email_for_emp_number",
    { p_emp_number: empNumber }
  );

  if (rpcError) {
    console.error("[login] get_email_for_emp_number:", rpcError);
    return { error: "사번 조회에 실패했습니다. 관리자에게 문의해 주세요." };
  }

  if (!email || typeof email !== "string") {
    return { error: "등록된 사번이 아닙니다." };
  }

  const { error: signInError } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (signInError) {
    const msg = signInError.message;
    if (msg.includes("Invalid login credentials")) return { error: "비밀번호가 올바르지 않습니다." };
    if (msg.includes("Email not confirmed")) return { error: "이메일 인증이 완료되지 않았습니다. 메일함을 확인해 주세요." };
    if (msg.includes("rate limit") || msg.includes("too many")) return { error: "요청이 너무 많습니다. 잠시 후 다시 시도해 주세요." };
    return { error: "로그인에 실패했습니다. 다시 시도해 주세요." };
  }

  const next = formData.get("next") as string | null;
  redirect(next && next.startsWith("/") ? next : "/dashboard");
}

/** 비밀번호 변경 (Supabase 세션 사용, 마스터 쿠키 로그인 시 불가) */
export async function changePassword(
  newPassword: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
  if (!url || !key) {
    return { ok: false, error: "Supabase가 설정되지 않았습니다." };
  }
  if (!newPassword || newPassword.length < 6) {
    return { ok: false, error: "비밀번호는 6자 이상이어야 합니다." };
  }
  try {
    const supabase = await createClient();
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    if (error) return { ok: false, error: error.message };
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "비밀번호 변경에 실패했습니다." };
  }
}
