"use client";

import { useState, useEffect, useRef } from "react";

export default function SeedPage() {
  const [result, setResult] = useState<Record<string, unknown> | null>(null);
  const [usersResult, setUsersResult] = useState<Record<string, unknown> | null>(null);
  const [done, setDone] = useState(false);
  const ran = useRef(false);

  useEffect(() => {
    if (ran.current) return;
    ran.current = true;

    (async () => {
      const safeJson = async (url: string) => {
        const r = await fetch(url);
        const text = await r.text();
        try {
          return text ? JSON.parse(text) : { ok: false, error: `응답 없음 (${r.status})` };
        } catch {
          return { ok: false, error: r.status === 200 ? "Invalid JSON" : `${r.status} ${r.statusText}` };
        }
      };
      try {
        const [masterRes, usersRes] = await Promise.all([
          safeJson("/api/seed-master"),
          safeJson("/api/seed-users"),
        ]);
        setResult(masterRes);
        setUsersResult(usersRes);
      } catch (e) {
        setResult({ ok: false, error: String(e) });
      } finally {
        setDone(true);
      }
    })();
  }, []);

  const masterErr = String((result as { error?: string })?.error || "");
  const usersErr = String((usersResult as { error?: string })?.error || "");
  const needsSchema =
    done &&
    ((!(result as { ok?: boolean })?.ok && masterErr.includes("function")) ||
      (!(usersResult as { ok?: boolean })?.ok && usersErr.includes("function")));
  const needsEnv =
    done &&
    (masterErr.includes("Supabase가 설정되지") ||
      masterErr.includes("환경 변수") ||
      usersErr.includes("Supabase가 설정되지") ||
      usersErr.includes("환경 변수"));
  const signUpErr = String((result as { signUpError?: string })?.signUpError || "");
  const resultsList = (usersResult as { results?: { auth?: string }[] })?.results ?? [];
  const needsRateLimit =
    done &&
    (signUpErr.includes("rate limit") ||
      resultsList.some((r) => String(r?.auth || "").includes("rate limit")));

  return (
    <div className="mx-auto max-w-lg space-y-8 p-8 font-sans">
      <h1 className="text-xl font-bold">시드 실행</h1>
      {!done ? (
        <p className="text-sm text-slate-600">마스터 계정 및 5명 사용자 생성 중…</p>
      ) : (
        <>
          {needsRateLimit && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
              <p className="font-semibold">가입 한도 초과 (email rate limit)</p>
              <p className="mt-2">Supabase에서 짧은 시간에 많은 가입을 막고 있습니다.</p>
              <ul className="mt-2 list-inside list-disc">
                <li><strong>약 1시간 후</strong> 이 페이지를 새로고침해서 시드 다시 실행하거나</li>
                <li>Supabase 대시보드 → <strong>Authentication</strong> → <strong>Users</strong> → <strong>Add user</strong>에서 아래 이메일·비밀번호로 수동 추가하세요.</li>
              </ul>
              <p className="mt-2 text-amber-800">마스터: admin@example.com / REDACTED_MASTER_PW · 5명: tns20250201@example.com 등 / 12345678</p>
            </div>
          )}
          {needsEnv && (
            <div className="rounded-lg border border-blue-200 bg-blue-50 p-4 text-sm text-blue-900">
              <p className="font-semibold">Vercel에 Supabase 환경 변수 설정이 필요합니다.</p>
              <ol className="mt-2 list-inside list-decimal space-y-1">
                <li><a href="https://vercel.com" target="_blank" rel="noopener noreferrer" className="underline">vercel.com</a> → 로그인 후 해당 프로젝트 선택</li>
                <li><strong>Settings</strong> → <strong>Environment Variables</strong></li>
                <li><code className="rounded bg-blue-100 px-1">NEXT_PUBLIC_SUPABASE_URL</code> · <code className="rounded bg-blue-100 px-1">NEXT_PUBLIC_SUPABASE_ANON_KEY</code> 추가 (값은 Supabase 대시보드 → Project Settings → API에서 복사)</li>
                <li><strong>Production</strong> 체크 후 저장 → 상단 <strong>Redeploy</strong>로 재배포</li>
              </ol>
              <p className="mt-2 text-blue-700">재배포 후 이 페이지를 새로고침하세요.</p>
            </div>
          )}
          {needsSchema && !needsEnv && (
            <p className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
              Supabase 대시보드 → SQL Editor에서 <code className="rounded bg-amber-100 px-1">tns_database_schema.sql</code> 내용을 붙여넣어 실행한 뒤 이 페이지를 새로고침하세요.
            </p>
          )}
          {result && (
            <section className="space-y-2">
              <h2 className="text-sm font-semibold text-slate-700">마스터</h2>
              <pre className="rounded-xl border bg-slate-50 p-4 text-left text-sm whitespace-pre-wrap">
                {JSON.stringify(result, null, 2)}
              </pre>
              {(result as { ok?: boolean }).ok === true && (
                <p className="rounded-lg bg-emerald-50 p-3 text-sm text-emerald-800">
                  /login → 사번 <strong>{(result as { login?: { 사번?: string } }).login?.사번}</strong>, 비밀번호 <strong>{(result as { login?: { 비밀번호?: string } }).login?.비밀번호}</strong>
                </p>
              )}
            </section>
          )}
          {usersResult && (
            <section className="space-y-2 border-t pt-6">
              <h2 className="text-sm font-semibold text-slate-700">5명 사용자 (비밀번호 12345678)</h2>
              <pre className="rounded-xl border bg-slate-50 p-4 text-left text-sm whitespace-pre-wrap">
                {JSON.stringify(usersResult, null, 2)}
              </pre>
            </section>
          )}
        </>
      )}
    </div>
  );
}
