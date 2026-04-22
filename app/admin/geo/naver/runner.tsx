"use client";

import { useState } from "react";

type Result = {
  ok: boolean;
  year_month?: string;
  fetched?: number;
  floor?: number;
  anomalies?: number;
  upserted?: number;
  warnings?: string[];
  error?: string;
};

export default function NaverSearchVolumeRunner() {
  const [secret, setSecret] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Result | null>(null);

  const run = async () => {
    setBusy(true);
    setResult(null);
    try {
      const res = await fetch("/api/cron/naver-search-volume", {
        method: "POST",
        headers: { "x-cron-secret": secret },
      });
      setResult(await res.json());
    } catch (e) {
      setResult({ ok: false, error: e instanceof Error ? e.message : "요청 실패" });
    }
    setBusy(false);
  };

  return (
    <div className="mt-4 space-y-3">
      <div>
        <label className="text-xs text-slate-500">CRON_SECRET</label>
        <input
          type="password"
          value={secret}
          onChange={(e) => setSecret(e.target.value)}
          className="mt-1 w-full rounded-md border border-slate-200 px-3 py-2 text-sm"
          placeholder="환경변수와 동일 값"
        />
      </div>
      <button
        onClick={run}
        disabled={busy}
        className="rounded-md bg-indigo-600 px-4 py-2 text-sm text-white disabled:opacity-50 hover:bg-indigo-700"
      >
        {busy ? "실행 중..." : "수동 trigger 실행"}
      </button>
      {result && (
        <pre className="mt-2 overflow-x-auto rounded-lg bg-slate-50 p-3 text-xs text-slate-700">
          {JSON.stringify(result, null, 2)}
        </pre>
      )}
    </div>
  );
}
