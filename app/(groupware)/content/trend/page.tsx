"use client";

import { useState } from "react";

type TrendResult =
  | { ok: true; post: { id: string; title: string; html: string } }
  | { error: string }
  | null;

export default function TrendPage() {
  const now = new Date();
  const [ym, setYm] = useState(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`);
  const [industry, setIndustry] = useState("음식점업");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<TrendResult>(null);

  const run = async () => {
    setBusy(true);
    setResult(null);
    try {
      const res = await fetch("/api/geo/blog-generate/trend", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ym, industry }),
      });
      setResult(await res.json());
    } catch (e) {
      setResult({ error: e instanceof Error ? e.message : "요청 실패" });
    }
    setBusy(false);
  };

  return (
    <div className="max-w-3xl space-y-4">
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

      {result && "error" in result && (
        <div className="rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-xs text-red-700">
          {result.error}
        </div>
      )}

      {result && "ok" in result && result.ok && (
        <div className="rounded-xl border border-slate-200 bg-white p-5 space-y-3">
          <div className="text-xs text-slate-500">{result.post.title}</div>
          <div className="border-t border-slate-100 pt-3 prose prose-sm max-w-none"
            dangerouslySetInnerHTML={{ __html: result.post.html }} />
        </div>
      )}
    </div>
  );
}
