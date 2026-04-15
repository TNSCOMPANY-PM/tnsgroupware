"use client";

import { useState } from "react";

export default function ExternalPage() {
  const [sourceUrl, setSourceUrl] = useState("");
  const [platform, setPlatform] = useState("tistory");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<unknown>(null);

  const run = async () => {
    setBusy(true);
    const res = await fetch("/api/geo/blog-generate/external", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ source_url: sourceUrl, platform }),
    });
    setResult(await res.json());
    setBusy(false);
  };

  return (
    <div className="max-w-2xl space-y-4">
      <div className="rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 text-xs text-amber-700">
        준비중 — API 가 stub 응답(501)만 반환합니다. 발행 시 frandoor 출처 인용 구조 자동 적용 예정.
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-5 space-y-3">
        <h2 className="text-sm font-semibold text-slate-700">외부채널 발행</h2>

        <div>
          <label className="text-xs text-slate-500">소스 frandoor URL</label>
          <input type="url" value={sourceUrl} onChange={e => setSourceUrl(e.target.value)}
            className="mt-1 w-full text-sm border border-slate-200 rounded-md px-2 py-1.5"
            placeholder="https://frandoor.co.kr/brands/..." />
        </div>

        <div>
          <label className="text-xs text-slate-500">플랫폼</label>
          <select value={platform} onChange={e => setPlatform(e.target.value)}
            className="mt-1 w-full text-sm border border-slate-200 rounded-md px-2 py-1.5">
            <option value="tistory">티스토리</option>
            <option value="naver">네이버 블로그</option>
            <option value="medium">Medium</option>
          </select>
        </div>

        <button onClick={run} disabled={busy || !sourceUrl.trim()}
          className="text-xs px-3 py-1.5 rounded-md bg-rose-600 text-white disabled:opacity-50">
          {busy ? "생성 중…" : "외부 포스팅 생성"}
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
