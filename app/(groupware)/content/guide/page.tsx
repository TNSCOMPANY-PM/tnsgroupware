"use client";

import { useState } from "react";

export default function GuidePage() {
  const [topic, setTopic] = useState("");
  const [category, setCategory] = useState("창업 절차");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<unknown>(null);

  const run = async () => {
    setBusy(true);
    const res = await fetch("/api/geo/blog-generate/guide", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ topic, category }),
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
        <h2 className="text-sm font-semibold text-slate-700">창업 가이드 (타입 C)</h2>

        <div>
          <label className="text-xs text-slate-500">주제</label>
          <input type="text" value={topic} onChange={e => setTopic(e.target.value)}
            className="mt-1 w-full text-sm border border-slate-200 rounded-md px-2 py-1.5"
            placeholder="예: 프랜차이즈 계약서 보는 법" />
        </div>

        <div>
          <label className="text-xs text-slate-500">카테고리</label>
          <select value={category} onChange={e => setCategory(e.target.value)}
            className="mt-1 w-full text-sm border border-slate-200 rounded-md px-2 py-1.5">
            <option>창업 절차</option>
            <option>계약·법률</option>
            <option>자금 조달</option>
            <option>입지 선정</option>
            <option>운영 노하우</option>
          </select>
        </div>

        <button onClick={run} disabled={busy || !topic.trim()}
          className="text-xs px-3 py-1.5 rounded-md bg-emerald-600 text-white disabled:opacity-50">
          {busy ? "생성 중…" : "가이드 생성"}
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
