"use client";

import { useState } from "react";

export default function TrendPage() {
  const now = new Date();
  const [ym, setYm] = useState(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`);
  const [industry, setIndustry] = useState("음식점업");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<unknown>(null);

  const run = async () => {
    setBusy(true);
    const res = await fetch("/api/geo/blog-generate/trend", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ym, industry }),
    });
    setResult(await res.json());
    setBusy(false);
  };

  return (
    <div className="max-w-2xl space-y-4">
      <div className="rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 text-xs text-amber-700">
        준비중 — API 가 stub 응답(501)만 반환합니다.
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-5 space-y-3">
        <h2 className="text-sm font-semibold text-slate-700">트렌드 (타입 D)</h2>

        <div>
          <label className="text-xs text-slate-500">연월</label>
          <input type="month" value={ym} onChange={e => setYm(e.target.value)}
            className="mt-1 w-full text-sm border border-slate-200 rounded-md px-2 py-1.5" />
        </div>

        <div>
          <label className="text-xs text-slate-500">업종</label>
          <select value={industry} onChange={e => setIndustry(e.target.value)}
            className="mt-1 w-full text-sm border border-slate-200 rounded-md px-2 py-1.5">
            <option>음식점업</option>
            <option>소매업</option>
            <option>서비스업</option>
          </select>
        </div>

        <button onClick={run} disabled={busy}
          className="text-xs px-3 py-1.5 rounded-md bg-amber-500 text-white disabled:opacity-50">
          {busy ? "생성 중…" : "트렌드 생성"}
        </button>
      </div>

      {result !== null && (
        <pre className="text-[10px] bg-slate-900 text-green-400 p-3 rounded-lg overflow-x-auto">
          {JSON.stringify(result, null, 2)}
        </pre>
      )}
    </div>
  );
}
