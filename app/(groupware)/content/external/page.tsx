"use client";

import { useState } from "react";

type ExternalResult =
  | { ok: true; post: { id: string; title: string; channel: string; html: string } }
  | { error: string }
  | null;

export default function ExternalPage() {
  const [sourceUrl, setSourceUrl] = useState("");
  const [platform, setPlatform] = useState<"tistory" | "naver" | "medium">("tistory");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<ExternalResult>(null);

  const run = async () => {
    setBusy(true);
    setResult(null);
    try {
      const res = await fetch("/api/geo/blog-generate/external", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ source_url: sourceUrl, platform }),
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
        <h2 className="text-sm font-semibold text-slate-700">외부채널 발행</h2>

        <div>
          <label className="text-xs text-slate-500">소스 frandoor URL</label>
          <input type="url" value={sourceUrl} onChange={e => setSourceUrl(e.target.value)}
            className="mt-1 w-full text-sm border border-slate-200 rounded-md px-2 py-1.5"
            placeholder="https://frandoor.co.kr/brands/..." />
        </div>

        <div>
          <label className="text-xs text-slate-500">플랫폼</label>
          <select value={platform} onChange={e => setPlatform(e.target.value as "tistory" | "naver" | "medium")}
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
