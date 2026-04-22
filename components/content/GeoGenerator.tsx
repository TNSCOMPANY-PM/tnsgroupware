"use client";

import { useEffect, useState } from "react";
import type { GeoOutput, Depth } from "@/lib/geo/types";
import SyndicatePanel from "./SyndicatePanel";

const INDUSTRIES = [
  "치킨", "카페", "분식/김밥", "피자", "중식", "한식", "일식", "주점",
  "베이커리/제과", "디저트/아이스크림", "편의점", "배달전문", "패스트푸드",
  "학원/교육", "세탁/생활서비스",
] as const;

type BrandRow = { id: string; name: string };

export default function GeoGenerator({ depth }: { depth: Depth }) {
  const [topic, setTopic] = useState("");
  const [industry, setIndustry] = useState<string>(INDUSTRIES[0]);
  const [brands, setBrands] = useState<BrandRow[]>([]);
  const [brandId, setBrandId] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<GeoOutput | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [jsonLdOpen, setJsonLdOpen] = useState(false);

  useEffect(() => {
    if (depth !== "D3") return;
    fetch("/api/geo/brands")
      .then((r) => (r.ok ? r.json() : []))
      .then((rows) => {
        const list: BrandRow[] = Array.isArray(rows)
          ? rows.map((r: { id: string; name: string }) => ({ id: r.id, name: r.name }))
          : [];
        setBrands(list);
        if (list.length > 0 && !brandId) setBrandId(list[0].id);
      })
      .catch(() => setBrands([]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [depth]);

  const selectedBrand = brands.find((b) => b.id === brandId);

  function buildBody(): Record<string, unknown> | null {
    if (depth === "D0" || depth === "D1") {
      if (!topic.trim()) { setError("topic 필수"); return null; }
      return { depth, topic: topic.trim() };
    }
    if (depth === "D2") {
      if (!industry) { setError("industry 필수"); return null; }
      const body: Record<string, unknown> = { depth, industry };
      if (topic.trim()) body.topic = topic.trim();
      return body;
    }
    if (!brandId || !selectedBrand) { setError("브랜드 선택 필수"); return null; }
    return { depth, brandId, brand: selectedBrand.name };
  }

  async function run() {
    setError(null);
    setResult(null);
    const body = buildBody();
    if (!body) return;
    setLoading(true);
    try {
      const res = await fetch("/api/geo/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.message ?? json.error ?? `HTTP ${res.status}`);
        return;
      }
      setResult(json);
    } catch (e) {
      setError(e instanceof Error ? e.message : "요청 실패");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[320px_1fr] gap-4">
      {/* 좌: 입력 */}
      <div className="rounded-xl border border-slate-200 bg-white p-5 space-y-3 h-fit">
        <h2 className="text-sm font-semibold text-slate-700">{depthLabel(depth)} 생성</h2>

        {(depth === "D0" || depth === "D1") && (
          <div>
            <label className="text-xs text-slate-500">주제 (topic)</label>
            <input value={topic} onChange={(e) => setTopic(e.target.value)}
              placeholder={depth === "D0" ? "예: 창업 자금 마련 방법" : "예: 프랜차이즈 가맹 절차"}
              className="mt-1 w-full text-sm border border-slate-200 rounded-md px-2 py-1.5" />
          </div>
        )}

        {depth === "D2" && (
          <>
            <div>
              <label className="text-xs text-slate-500">업종 (industry)</label>
              <select value={industry} onChange={(e) => setIndustry(e.target.value)}
                className="mt-1 w-full text-sm border border-slate-200 rounded-md px-2 py-1.5">
                {INDUSTRIES.map((i) => <option key={i} value={i}>{i}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs text-slate-500">세부 주제 (선택)</label>
              <input value={topic} onChange={(e) => setTopic(e.target.value)}
                placeholder="예: 수익 구조, 투자 추세"
                className="mt-1 w-full text-sm border border-slate-200 rounded-md px-2 py-1.5" />
            </div>
          </>
        )}

        {depth === "D3" && (
          <div>
            <label className="text-xs text-slate-500">브랜드</label>
            <select value={brandId} onChange={(e) => setBrandId(e.target.value)}
              className="mt-1 w-full text-sm border border-slate-200 rounded-md px-2 py-1.5">
              {brands.length === 0 && <option value="">브랜드 로딩 중…</option>}
              {brands.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
          </div>
        )}

        <button onClick={run} disabled={loading}
          className="w-full text-xs px-3 py-2 rounded-md bg-violet-600 text-white disabled:opacity-50 hover:bg-violet-700">
          {loading ? "생성 중…" : "canonical 생성"}
        </button>

        {error && (
          <div className="rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-xs text-red-700">
            {error}
          </div>
        )}
      </div>

      {/* 우: 결과 */}
      <div className="space-y-3">
        {!result && !loading && (
          <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-10 text-center text-xs text-slate-400">
            입력 후 &quot;canonical 생성&quot; 누르면 여기에 결과가 표시됩니다.
          </div>
        )}

        {loading && (
          <div className="rounded-xl border border-slate-200 bg-white p-10 text-center text-xs text-slate-500">
            생성 중 — prefetch → GPT facts → Sonnet write → lint/crosscheck → DB upsert
          </div>
        )}

        {result && (
          <>
            {/* 헤더: canonical + tier 카운트 */}
            <div className="rounded-xl border border-slate-200 bg-white p-5 space-y-2">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <div>
                  <div className="text-[11px] text-slate-400">canonical URL</div>
                  <div className="font-mono text-xs text-slate-700">{result.canonicalUrl}</div>
                </div>
                <div className="flex items-center gap-1">
                  {(["A", "B", "C", "D"] as const).map((k) => {
                    const n = result.tiers[k].length;
                    return (
                      <span key={k}
                        className={`text-[10px] px-2 py-1 rounded-md border ${n > 0 ? "bg-emerald-50 border-emerald-200 text-emerald-700" : "bg-slate-50 border-slate-200 text-slate-400"}`}>
                        Tier {k}: {n}
                      </span>
                    );
                  })}
                </div>
              </div>
              <div className="flex items-center gap-1 flex-wrap text-[11px]">
                {result.lint.errors.length === 0 ? (
                  <span className="px-2 py-0.5 rounded-md bg-emerald-50 border border-emerald-200 text-emerald-700">
                    lint OK
                  </span>
                ) : (
                  <span className="px-2 py-0.5 rounded-md bg-red-50 border border-red-200 text-red-700">
                    lint err {result.lint.errors.length}건
                  </span>
                )}
                {result.lint.warns.length > 0 && (
                  <span className="px-2 py-0.5 rounded-md bg-amber-50 border border-amber-200 text-amber-700">
                    warn {result.lint.warns.length}건
                  </span>
                )}
                <span className={`px-2 py-0.5 rounded-md border ${result.crosscheck.ok ? "bg-emerald-50 border-emerald-200 text-emerald-700" : "bg-red-50 border-red-200 text-red-700"}`}>
                  crosscheck matched={result.crosscheck.matchedCount} unmatched={result.crosscheck.unmatched.length}
                </span>
              </div>
              {result.lint.errors.length > 0 && (
                <ul className="text-[11px] text-red-700 bg-red-50 rounded-md p-2 space-y-0.5">
                  {result.lint.errors.map((e, i) => (
                    <li key={i}>{e.code} · {e.msg}{e.where ? ` [${e.where}]` : ""}</li>
                  ))}
                </ul>
              )}
            </div>

            {/* 본문 발췌 */}
            <div className="rounded-xl border border-slate-200 bg-white p-5">
              <div className="text-xs font-semibold text-slate-700 mb-2">
                payload.kind = <span className="font-mono">{result.payload.kind}</span>
              </div>
              <PayloadPreview payload={result.payload} />
            </div>

            {/* JSON-LD 토글 */}
            <div className="rounded-xl border border-slate-200 bg-white p-5">
              <button onClick={() => setJsonLdOpen((v) => !v)}
                className="text-xs text-slate-600 hover:text-slate-900">
                {jsonLdOpen ? "▼" : "▶"} JSON-LD {result.jsonLd.length}종
              </button>
              {jsonLdOpen && (
                <pre className="mt-2 text-[10px] bg-slate-50 rounded-md p-2 overflow-auto max-h-80">
                  {JSON.stringify(result.jsonLd, null, 2)}
                </pre>
              )}
            </div>

            {/* Syndicate 패널 — lint OK && canonical 있을 때만 */}
            {result.lint.errors.length === 0 && result.canonicalUrl && (
              <SyndicatePanel sourceUrl={result.canonicalUrl} />
            )}
          </>
        )}
      </div>
    </div>
  );
}

function depthLabel(d: Depth): string {
  return d === "D0" ? "창업일반 (D0)"
    : d === "D1" ? "프차일반 (D1)"
    : d === "D2" ? "업종 (D2)"
    : "브랜드 (D3)";
}

function PayloadPreview({ payload }: { payload: GeoOutput["payload"] }) {
  if (payload.kind === "markdown") {
    return (
      <pre className="text-[11px] bg-slate-50 rounded-md p-3 overflow-auto max-h-[480px] whitespace-pre-wrap">
        {payload.body.slice(0, 2000)}
        {payload.body.length > 2000 && "\n\n… (truncated)"}
      </pre>
    );
  }
  if (payload.kind === "industryDoc") {
    return (
      <div className="space-y-3">
        {payload.sections.slice(0, 6).map((s, i) => (
          <div key={i}>
            <div className="text-xs font-semibold text-slate-700">{s.heading}</div>
            <div className="text-[11px] text-slate-600 whitespace-pre-wrap line-clamp-6">{s.body}</div>
          </div>
        ))}
      </div>
    );
  }
  return (
    <div className="space-y-3">
      {payload.sections.slice(0, 3).map((s, i) => (
        <div key={i}>
          <div className="text-xs font-semibold text-slate-700">{s.heading}</div>
          <div className="text-[11px] text-slate-600 whitespace-pre-wrap line-clamp-4">{s.body}</div>
        </div>
      ))}
      <div className="border-t border-slate-100 pt-2">
        <div className="text-xs font-semibold text-slate-700">FAQ ({payload.faq25.length}문항)</div>
        <ul className="text-[11px] text-slate-600 space-y-1 mt-1">
          {payload.faq25.slice(0, 3).map((f, i) => (
            <li key={i}>· {f.q}</li>
          ))}
        </ul>
      </div>
    </div>
  );
}
