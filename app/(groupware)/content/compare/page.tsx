"use client";

import { useState } from "react";

export default function ComparePage() {
  const [industry, setIndustry] = useState("음식점업");
  const [brands, setBrands] = useState<string[]>([]);
  const [criteria, setCriteria] = useState("창업비용");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<unknown>(null);

  const run = async () => {
    setBusy(true);
    const res = await fetch("/api/geo/blog-generate/compare", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ industry, brands, criteria }),
    });
    setResult(await res.json());
    setBusy(false);
  };

  return (
    <div className="max-w-2xl space-y-4">
      <div className="rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 text-xs text-amber-700">
        준비중 — API 가 stub 응답(501)만 반환합니다. 입력 UI 만 미리 구성.
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-5 space-y-3">
        <h2 className="text-sm font-semibold text-slate-700">업종 비교 (타입 B)</h2>

        <div>
          <label className="text-xs text-slate-500">업종</label>
          <select value={industry} onChange={e => setIndustry(e.target.value)}
            className="mt-1 w-full text-sm border border-slate-200 rounded-md px-2 py-1.5">
            <option>음식점업</option>
            <option>소매업</option>
            <option>서비스업</option>
          </select>
        </div>

        <div>
          <label className="text-xs text-slate-500">비교 브랜드 (쉼표 구분)</label>
          <input type="text" value={brands.join(",")}
            onChange={e => setBrands(e.target.value.split(",").map(s => s.trim()).filter(Boolean))}
            className="mt-1 w-full text-sm border border-slate-200 rounded-md px-2 py-1.5"
            placeholder="예: 오공김밥, 바르다김선생" />
        </div>

        <div>
          <label className="text-xs text-slate-500">비교 항목</label>
          <select value={criteria} onChange={e => setCriteria(e.target.value)}
            className="mt-1 w-full text-sm border border-slate-200 rounded-md px-2 py-1.5">
            <option>창업비용</option>
            <option>월평균매출</option>
            <option>가맹점수</option>
            <option>폐점률</option>
          </select>
        </div>

        <button onClick={run} disabled={busy}
          className="text-xs px-3 py-1.5 rounded-md bg-sky-600 text-white disabled:opacity-50">
          {busy ? "생성 중…" : "비교 콘텐츠 생성"}
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
