"use client";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="ko">
      <body className="flex min-h-screen items-center justify-center bg-[#f8fafc] font-sans text-slate-800">
        <div className="flex flex-col items-center gap-4 rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
          <p className="text-slate-600">일시적인 오류가 발생했습니다.</p>
          <div className="flex gap-3">
            <button
              onClick={reset}
              className="rounded-xl bg-indigo-600 px-4 py-2 text-white hover:opacity-90"
            >
              다시 시도
            </button>
            <a
              href="/login"
              className="rounded-xl border border-slate-300 px-4 py-2 hover:bg-slate-50"
            >
              로그인
            </a>
          </div>
        </div>
      </body>
    </html>
  );
}
