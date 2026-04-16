"use client";

import { useState } from "react";

type GuideResult =
  | { ok: true; post: { id: string; title: string; html: string } }
  | { error: string }
  | null;

export default function GuidePage() {
  const [topic, setTopic] = useState("");
  const [category, setCategory] = useState("창업 절차");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<GuideResult>(null);

  const run = async () => {
    setBusy(true);
    setResult(null);
    try {
      const res = await fetch("/api/geo/blog-generate/guide", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ topic, category }),
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
