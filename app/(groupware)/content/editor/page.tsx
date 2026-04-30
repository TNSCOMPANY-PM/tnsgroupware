"use client";

import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { INDUSTRIES_15 } from "@/lib/geo/v2/industries";

type Tier = "A" | "B" | "C";
type Mode = "brand" | "industry";

type FtcBrand = {
  id: string;
  name: string;
  corp: string | null;
  industry: string | null;
};

type GenerateV2Response = {
  draftId: string | null;
  saveError: string | null;
  title: string;
  content: string;
  frontmatter: Record<string, unknown>;
  factsUsed: number;
  unmatchedRetries: number;
  lintWarnings: string[];
};

export default function EditorPage() {
  // v2-18: brand vs industry 모드 토글
  const [mode, setMode] = useState<Mode>("brand");
  const [industry, setIndustry] = useState<string>("");

  const [tiers, setTiers] = useState<Set<Tier>>(new Set(["A", "B", "C"]));
  const [topic, setTopic] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<GenerateV2Response | null>(null);
  // v2-10: ftc 9552 brand 검색 typeahead
  const [searchTerm, setSearchTerm] = useState<string>("");
  const [searchResults, setSearchResults] = useState<FtcBrand[]>([]);
  const [searching, setSearching] = useState<boolean>(false);
  const [selectedBrand, setSelectedBrand] = useState<FtcBrand | null>(null);
  const [error, setError] = useState<string>("");

  // debounced typeahead (200ms)
  useEffect(() => {
    if (selectedBrand) return; // 선택 후엔 검색 X
    if (!searchTerm.trim() || searchTerm.length < 1) {
      setSearchResults([]);
      return;
    }
    const t = setTimeout(async () => {
      setSearching(true);
      try {
        const res = await fetch(
          `/api/geo/ftc-brands?q=${encodeURIComponent(searchTerm)}&limit=20`,
        );
        if (res.ok) {
          const data = (await res.json()) as FtcBrand[];
          setSearchResults(Array.isArray(data) ? data : []);
        } else {
          setSearchResults([]);
        }
      } catch {
        setSearchResults([]);
      } finally {
        setSearching(false);
      }
    }, 200);
    return () => clearTimeout(t);
  }, [searchTerm, selectedBrand]);

  const toggleTier = (tier: Tier) => {
    setTiers((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(tier)) newSet.delete(tier);
      else newSet.add(tier);
      return newSet;
    });
  };

  const handleGenerate = useCallback(async () => {
    setError("");
    setResult(null);
    setLoading(true);
    // v3-03: AbortController — 서버 maxDuration 60s + 5s margin
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 65000);
    try {
      const body =
        mode === "brand"
          ? {
              mode: "brand" as const,
              brandId: selectedBrand?.id ?? "",
              topic,
              tiers: Array.from(tiers),
            }
          : {
              mode: "industry" as const,
              industry,
              topic,
              tiers: Array.from(tiers),
            };
      const res = await fetch("/api/geo/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      if (!res.ok) {
        // v3-03: JSON 파싱 실패 가능성 (504 / HTML body) → text fallback
        let msg: string;
        try {
          const errData = await res.json();
          msg = errData.message
            ? `${errData.message}${errData.error ? ` [${errData.error}]` : ""}`
            : errData.error || `API ${res.status}`;
          if (Array.isArray(errData.unmatched) && errData.unmatched.length > 0) {
            msg = `${msg}\n\nunmatched 샘플:\n${errData.unmatched.slice(0, 5).join("\n")}`;
          }
        } catch {
          const text = await res.text().catch(() => "");
          msg = `API ${res.status} ${res.statusText}: ${text.slice(0, 300)}`;
        }
        setError(msg);
        return;
      }
      const data = (await res.json()) as GenerateV2Response;
      setResult(data);
    } catch (err) {
      // v3-03: AbortError 명시적 메시지
      if (err instanceof Error && err.name === "AbortError") {
        setError("타임아웃 (65초 초과). 서버 응답이 너무 늦습니다 — 다시 시도해 주세요.");
      } else {
        setError(err instanceof Error ? err.message : "오류 발생");
      }
    } finally {
      clearTimeout(timeoutId);
      setLoading(false);
    }
  }, [mode, selectedBrand, industry, topic, tiers]);

  const isGenerateDisabled =
    loading ||
    !topic.trim() ||
    tiers.size === 0 ||
    (mode === "brand" ? !selectedBrand : !industry);

  return (
    <div className="space-y-6 max-w-4xl">
      {/* 1. 데이터 등급 선택 */}
      <div className="rounded-xl border border-slate-200 bg-white p-6">
        <h2 className="text-sm font-semibold text-slate-800 mb-4">1. 데이터 등급 선택</h2>
        <div className="flex gap-4 items-center flex-wrap">
          {(["A", "B", "C"] as const).map((tier) => {
            const active = tiers.has(tier);
            return (
              <label
                key={tier}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg border-2 cursor-pointer transition-all ${
                  active
                    ? "border-blue-500 bg-blue-50 shadow-sm"
                    : "border-slate-200 bg-white hover:border-slate-300"
                }`}
              >
                <input
                  type="checkbox"
                  checked={active}
                  onChange={() => toggleTier(tier)}
                  className="hidden"
                />
                <span
                  className={`inline-flex items-center justify-center w-4 h-4 rounded border ${
                    active ? "bg-blue-500 border-blue-500 text-white" : "border-slate-300 bg-white"
                  }`}
                  aria-hidden="true"
                >
                  {active && (
                    <svg viewBox="0 0 16 16" className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth="3">
                      <polyline points="3 8 7 12 13 4" />
                    </svg>
                  )}
                </span>
                <span
                  className={`text-sm ${
                    active ? "font-semibold text-blue-900" : "font-medium text-slate-600"
                  }`}
                >
                  {tier === "A" && "A급 (공정위 정보공개서)"}
                  {tier === "B" && "B급 (공공API · KOSIS)"}
                  {tier === "C" && "C급 (본사 docx)"}
                </span>
              </label>
            );
          })}
        </div>
        <p className="text-xs text-slate-500 mt-3">
          체크된 tier 의 facts 만 LLM3 에 전달됩니다. 각 tier 는 brand_facts pool 의 source_tier 와 매칭됩니다.
        </p>
      </div>

      {/* 2. 모드 + 브랜드/업종 선택 */}
      <div className="rounded-xl border border-slate-200 bg-white p-6">
        <h2 className="text-sm font-semibold text-slate-800 mb-4">2. 분석 단위 선택</h2>
        {/* 모드 토글 */}
        <div className="flex gap-2 mb-4">
          <button
            type="button"
            onClick={() => setMode("brand")}
            className={`px-4 py-2 rounded-lg text-sm font-medium border-2 transition-all ${
              mode === "brand"
                ? "border-blue-500 bg-blue-50 text-blue-700"
                : "border-slate-200 text-slate-600"
            }`}
          >
            브랜드 단위
          </button>
          <button
            type="button"
            onClick={() => setMode("industry")}
            className={`px-4 py-2 rounded-lg text-sm font-medium border-2 transition-all ${
              mode === "industry"
                ? "border-blue-500 bg-blue-50 text-blue-700"
                : "border-slate-200 text-slate-600"
            }`}
          >
            업종 단위 (A 데이터만)
          </button>
        </div>

        {mode === "brand" && (
          <div className="space-y-3 relative">
            <p className="text-xs text-slate-500">ftc 9,552 brand 중 선택</p>
            {selectedBrand ? (
              <div className="flex items-center gap-2 p-3 border border-blue-200 bg-blue-50 rounded-lg">
                <div className="flex-1">
                  <p className="text-sm font-medium text-slate-900">{selectedBrand.name}</p>
                  <p className="text-xs text-slate-500">
                    {selectedBrand.corp ?? "-"}
                    {selectedBrand.industry ? ` · ${selectedBrand.industry}` : ""}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setSelectedBrand(null);
                    setSearchTerm("");
                  }}
                  className="text-xs text-blue-600 hover:underline"
                >
                  변경
                </button>
              </div>
            ) : (
              <>
                <input
                  type="text"
                  placeholder="브랜드명 검색 (예: 오공김밥)"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                {searching && <p className="text-xs text-slate-400">검색 중...</p>}
                {!searching && searchResults.length > 0 && (
                  <ul className="border border-slate-200 rounded-lg max-h-72 overflow-y-auto bg-white">
                    {searchResults.map((b) => (
                      <li
                        key={b.id}
                        onClick={() => {
                          setSelectedBrand(b);
                          setSearchTerm("");
                          setSearchResults([]);
                        }}
                        className="px-3 py-2 hover:bg-blue-50 cursor-pointer border-b border-slate-100 last:border-0"
                      >
                        <p className="text-sm font-medium text-slate-800">{b.name}</p>
                        <p className="text-xs text-slate-500">
                          {b.corp ?? "-"}
                          {b.industry ? ` · ${b.industry}` : ""}
                        </p>
                      </li>
                    ))}
                  </ul>
                )}
                {!searching && searchTerm.trim() && searchResults.length === 0 && (
                  <p className="text-xs text-slate-400">검색 결과 없음</p>
                )}
              </>
            )}
          </div>
        )}

        {mode === "industry" && (
          <div className="space-y-3">
            <p className="text-xs text-slate-500">외식 15 업종 중 선택. 글은 industry_facts (A급) 만 활용.</p>
            <select
              value={industry}
              onChange={(e) => setIndustry(e.target.value)}
              className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">업종 선택</option>
              {INDUSTRIES_15.map((ind) => (
                <option key={ind} value={ind}>
                  {ind}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      {/* 3. 주제 입력 */}
      <div className="rounded-xl border border-slate-200 bg-white p-6">
        <h2 className="text-sm font-semibold text-slate-800 mb-4">3. 주제 입력</h2>
        <textarea
          placeholder="예: 오공김밥 분식 평균 비교 / 본사 영업이익률 분석 / 공정위 vs 본사 발표 차이"
          value={topic}
          onChange={(e) => setTopic(e.target.value)}
          className="w-full px-4 py-3 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
          rows={3}
        />
        <p className="text-xs text-slate-400 mt-2">
          발행 채널: <span className="font-semibold">/frandoor 블로그</span>
        </p>
      </div>

      {/* 에러 */}
      {error && (
        <div className="rounded-lg bg-red-50 border-2 border-red-200 p-4 space-y-1">
          <div className="text-sm font-semibold text-red-700">⚠️ 생성 실패</div>
          <pre className="text-sm text-red-800 whitespace-pre-wrap break-words">{error}</pre>
        </div>
      )}

      {/* 생성 중 안내 */}
      {loading && (
        <div className="rounded-lg bg-blue-50 border border-blue-200 p-4 text-sm text-blue-800">
          <div className="font-semibold">⏳ 생성 중...</div>
          <div className="text-xs text-blue-700 mt-1">
            4-step 파이프라인 (Plan → Structure → Write → Polish). 약 40~60초 소요.
          </div>
        </div>
      )}

      {/* Generate 버튼 */}
      <div className="rounded-xl border border-slate-200 bg-white p-6">
        <Button onClick={handleGenerate} disabled={isGenerateDisabled} className="w-full" size="lg">
          {loading ? "생성 중..." : "콘텐츠 생성 (v3 4-step)"}
        </Button>
      </div>

      {/* 결과 */}
      {result && <ResultPreview result={result} />}
    </div>
  );
}

function ResultPreview({ result }: { result: GenerateV2Response }) {
  const detailHref = result.draftId ? `/content/posts/${result.draftId}` : "/content/posts";
  const excerpt = result.content.slice(0, 800);

  return (
    <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-6">
      <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-semibold text-emerald-900">생성 완료</h3>
          {result.draftId && (
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700">
              저장됨 · {result.draftId.slice(0, 8)}
            </span>
          )}
        </div>
        <a href={detailHref} className="text-xs text-blue-600 hover:underline">
          발행 관리에서 열기 →
        </a>
      </div>

      {result.saveError && (
        <div className="mb-4 rounded-lg border border-amber-300 bg-amber-50 p-3">
          <p className="text-xs font-medium text-amber-800">저장 실패</p>
          <p className="text-xs text-amber-700 mt-0.5 whitespace-pre-wrap break-words">
            {result.saveError}
          </p>
        </div>
      )}

      <div className="space-y-3">
        <div>
          <p className="text-xs text-slate-500 mb-1">제목</p>
          <p className="text-sm font-medium text-slate-800">{result.title || "(제목 없음)"}</p>
        </div>

        <div>
          <p className="text-xs text-slate-500 mb-1">본문 발췌</p>
          <pre className="text-xs text-slate-600 whitespace-pre-wrap bg-white/60 rounded p-2 max-h-64 overflow-y-auto">
            {excerpt}
          </pre>
        </div>

        {result.lintWarnings.length > 0 && (
          <div>
            <p className="text-xs text-amber-600 mb-1">⚠️ Lint warnings ({result.lintWarnings.length})</p>
            <ul className="text-xs text-amber-700 space-y-0.5 list-disc list-inside">
              {result.lintWarnings.slice(0, 5).map((w, i) => (
                <li key={i}>{w}</li>
              ))}
            </ul>
          </div>
        )}

        <div className="flex items-center gap-3 text-[11px] text-slate-500 pt-2 border-t border-emerald-200">
          <span>facts={result.factsUsed}</span>
          <span>·</span>
          <span>retries={result.unmatchedRetries}</span>
          <span>·</span>
          <span>warnings={result.lintWarnings.length}</span>
        </div>
      </div>
    </div>
  );
}
