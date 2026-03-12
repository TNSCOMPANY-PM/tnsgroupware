"use client";

import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";
import { loginWithEmpNumber } from "./actions";

function LoginForm() {
  const searchParams = useSearchParams();
  const next = searchParams.get("next") ?? "";
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const form = e.currentTarget;
    const formData = new FormData(form);
    if (next) formData.set("next", next);

    const result = await loginWithEmpNumber(formData);

    if (result?.error) {
      setError(result.error);
      setLoading(false);
      return;
    }
    setLoading(false);
  }

  return (
    <div className="flex min-h-screen w-full items-center justify-center p-6 font-sans">
      <div className="w-full max-w-md">
        <div className="rounded-3xl border border-white/40 bg-white/70 p-8 shadow-2xl backdrop-blur-xl">
          <div className="mb-8 text-center">
            <h1 className="text-2xl font-bold tracking-tight text-slate-800">
              TNS Groupware
            </h1>
            <p className="mt-2 text-sm text-slate-500">
              사번과 비밀번호를 입력해 주세요
            </p>
          </div>
          <form onSubmit={handleSubmit} className="space-y-5">
            {error && (
              <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
                {error}
              </p>
            )}
            <div className="space-y-2">
              <Label htmlFor="emp_number" className="text-slate-700">
                사번 (ID)
              </Label>
              <Input
                id="emp_number"
                name="emp_number"
                type="text"
                placeholder="TNS-YYYYMMDD"
                className="w-full"
                autoComplete="username"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password" className="text-slate-700">
                비밀번호
              </Label>
              <Input
                id="password"
                name="password"
                type="password"
                placeholder="비밀번호"
                className="w-full"
                autoComplete="current-password"
                required
              />
            </div>
            <Button
              type="submit"
              disabled={loading}
              className="h-12 w-full rounded-xl bg-[var(--primary)] text-base font-medium text-white hover:opacity-90"
            >
              {loading ? (
                <>
                  <Loader2 className="size-5 animate-spin" />
                  로그인 중...
                </>
              ) : (
                "로그인"
              )}
            </Button>
          </form>
        </div>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="flex min-h-screen w-full items-center justify-center p-6 font-sans">로딩 중...</div>}>
      <LoginForm />
    </Suspense>
  );
}
