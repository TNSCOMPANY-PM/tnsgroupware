"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui/button";

export default function GroupwareError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[groupware error]", error);
  }, [error]);

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 p-8">
      <p className="text-center text-slate-600">
        일시적인 오류가 발생했습니다.
      </p>
      <Button
        onClick={reset}
        className="rounded-xl bg-[var(--primary)] text-white hover:opacity-90"
      >
        다시 시도
      </Button>
      <Button
        variant="outline"
        onClick={() => (window.location.href = "/login")}
        className="rounded-xl"
      >
        로그인으로 이동
      </Button>
    </div>
  );
}
