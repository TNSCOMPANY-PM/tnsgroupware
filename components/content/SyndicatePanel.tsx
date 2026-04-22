"use client";

import { useState } from "react";
import type { SyndicateOutput, Angle, Platform } from "@/lib/geo/syndicate/types";

const ANGLES: { value: Angle; label: string }[] = [
  { value: "invest-focus",      label: "투자 포커스" },
  { value: "closure-focus",     label: "폐점률 포커스" },
  { value: "compare-peer",      label: "동종 비교" },
  { value: "faq-digest",        label: "FAQ 요약" },
  { value: "news-hook",         label: "뉴스 훅" },
  { value: "industry-overview", label: "업종 개요" },
  { value: "top-n-list",        label: "TOP N 리스트" },
];

const PLATFORMS: { value: Platform; label: string }[] = [
  { value: "tistory", label: "Tistory" },
  { value: "naver",   label: "네이버" },
  { value: "medium",  label: "Medium" },
];

type PlatformResult = { platform: Platform; output?: SyndicateOutput; error?: string };

export default function SyndicatePanel({ sourceUrl }: { sourceUrl: string }) {
  const [angle, setAngle] = useState<Angle>("invest-focus");
  const [selected, setSelected] = useState<Set<Platform>>(new Set(["tistory"]));
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<PlatformResult[]>([]);
  const [activeTab, setActiveTab] = useState<Platform | null>(null);
  const [copied, setCopied] = useState<Platform | null>(null);
  const [publishMsg, setPublishMsg] = useState<string | null>(null);

  function togglePlatform(p: Platform) {
    const next = new Set(selected);
    if (next.has(p)) next.delete(p);
    else next.add(p);
    setSelected(next);
  }

  async function run() {
    if (selected.size === 0) return;
    setLoading(true);
    setResults([]);
    setPublishMsg(null);
    const platforms = Array.from(selected);
    const outcomes = await Promise.all(
      platforms.map(async (p): Promise<PlatformResult> => {
        try {
          const res = await fetch("/api/geo/syndicate", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ sourceUrl, angle, platform: p }),
          });
          const json = await res.json();
          if (!res.ok) return { platform: p, error: json.message ?? json.error ?? `HTTP ${res.status}` };
          return { platform: p, output: json as SyndicateOutput };
        } catch (e) {
          return { platform: p, error: e instanceof Error ? e.message : "요청 실패" };
        }
      }),
    );
    setResults(outcomes);
    const firstOk = outcomes.find((o) => o.output);
    setActiveTab(firstOk?.platform ?? platforms[0]);
    setLoading(false);
  }

  async function copyHtml(p: Platform, html: string) {
    try {
      await navigator.clipboard.writeText(html);
      setCopied(p);
      setTimeout(() => setCopied(null), 1500);
    } catch {
      setCopied(null);
    }
  }

  async function publishTistory(out: SyndicateOutput) {
    setPublishMsg("발행 중…");
    try {
      const res = await fetch("/api/geo/tistory/publish", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: out.title, content: out.html, visibility: "3" }),
      });
      const json = await res.json();
      if (!res.ok) {
        setPublishMsg(`실패: ${json.error ?? json.message ?? res.status}`);
        return;
      }
      setPublishMsg(`발행 성공: ${json.url ?? "URL 없음"}`);
    } catch (e) {
      setPublishMsg(`실패: ${e instanceof Error ? e.message : "요청 실패"}`);
    }
  }

  const activeResult = results.find((r) => r.platform === activeTab);

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5 space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-slate-700">Syndicate</h3>
        <div className="text-[11px] text-slate-400 font-mono">{sourceUrl}</div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-[160px_1fr_auto] gap-2 items-end">
        <div>
          <label className="text-xs text-slate-500">angle</label>
          <select value={angle} onChange={(e) => setAngle(e.target.value as Angle)}
            className="mt-1 w-full text-sm border border-slate-200 rounded-md px-2 py-1.5">
            {ANGLES.map((a) => <option key={a.value} value={a.value}>{a.label}</option>)}
          </select>
        </div>
        <div>
          <label className="text-xs text-slate-500">platform</label>
          <div className="mt-1 flex gap-2 flex-wrap">
            {PLATFORMS.map((p) => {
              const active = selected.has(p.value);
              return (
                <button key={p.value} type="button" onClick={() => togglePlatform(p.value)}
                  className={`text-xs px-3 py-1.5 rounded-md border ${active ? "bg-violet-600 border-violet-600 text-white" : "bg-white border-slate-200 text-slate-600"}`}>
                  {p.label}
                </button>
              );
            })}
          </div>
        </div>
        <button onClick={run} disabled={loading || selected.size === 0}
          className="text-xs px-4 py-2 rounded-md bg-violet-600 text-white disabled:opacity-50 hover:bg-violet-700">
          {loading ? "생성 중…" : "syndicate 생성"}
        </button>
      </div>

      {results.length > 0 && (
        <div className="space-y-2">
          <div className="flex gap-1 border-b border-slate-200">
            {results.map((r) => (
              <button key={r.platform} onClick={() => setActiveTab(r.platform)}
                className={`text-xs px-3 py-1.5 border-b-2 ${activeTab === r.platform ? "border-violet-600 text-violet-700" : "border-transparent text-slate-500"}`}>
                {PLATFORMS.find((p) => p.value === r.platform)?.label}
                {r.error ? " ❌" : " ✓"}
              </button>
            ))}
          </div>

          {activeResult?.error && (
            <div className="rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-xs text-red-700">
              {activeResult.error}
            </div>
          )}

          {activeResult?.output && (
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <div className="text-xs font-semibold text-slate-700">
                  {activeResult.output.title}
                </div>
                <div className="flex gap-2">
                  <button onClick={() => copyHtml(activeResult.platform, activeResult.output!.html)}
                    className="text-[11px] px-2 py-1 rounded-md bg-slate-100 hover:bg-slate-200 text-slate-700">
                    {copied === activeResult.platform ? "복사됨 ✓" : "HTML 복사"}
                  </button>
                  {activeResult.platform === "tistory" && (
                    <button onClick={() => publishTistory(activeResult.output!)}
                      className="text-[11px] px-2 py-1 rounded-md bg-sky-600 hover:bg-sky-700 text-white">
                      Tistory 발행
                    </button>
                  )}
                </div>
              </div>
              {publishMsg && activeResult.platform === "tistory" && (
                <div className="text-[11px] text-slate-600 bg-sky-50 border border-sky-200 rounded-md px-2 py-1">
                  {publishMsg}
                </div>
              )}
              <div className="text-[11px] text-slate-500">
                canonical: <span className="font-mono">{activeResult.output.canonical}</span> · anchor: {activeResult.output.anchor}
              </div>
              <div className="border-t border-slate-100 pt-3 prose prose-sm max-w-none text-xs"
                dangerouslySetInnerHTML={{ __html: activeResult.output.html }} />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
