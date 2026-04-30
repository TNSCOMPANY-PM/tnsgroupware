"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { INDUSTRIES_15 } from "@/lib/geo/v2/industries";

type Tier = "A" | "B" | "C";
type Mode = "brand" | "industry";
type Phase = "idle" | "planning" | "plan_done" | "writing" | "write_done";

type FtcBrand = {
  id: string;
  name: string;
  corp: string | null;
  industry: string | null;
};

type PlanResult = {
  selected_facts: Array<{
    metric_id: string;
    value: number | string | null;
    source_tier: "A" | "B" | "C";
    label: string;
    unit: string | null;
  }>;
  outliers: Array<{ metric_id: string; value: number | null; reason: string }>;
  population_n: Record<string, number>;
  key_angle: string;
};

type OutlineResult = {
  blocks: Array<{
    h2: string;
    fact_ids: string[];
    format: "table" | "prose";
    summary_line: string;
  }>;
};

type PhaseAResponse = {
  draftId: string;
  plan: PlanResult;
  outline: OutlineResult;
  factsCount: number;
};

type PhaseBResponse = {
  draftId: string;
  title: string;
  content: string;
  frontmatter: Record<string, unknown>;
  polishLog: string[];
  lintWarnings: string[];
};

export default function EditorPage() {
  // 폼 상태
  const [mode, setMode] = useState<Mode>("brand");
  const [industry, setIndustry] = useState<string>("");
  const [tiers, setTiers] = useState<Set<Tier>>(new Set(["A", "B", "C"]));
  const [topic, setTopic] = useState<string>("");
  const [searchTerm, setSearchTerm] = useState<string>("");
  const [searchResults, setSearchResults] = useState<FtcBrand[]>([]);
  const [searching, setSearching] = useState<boolean>(false);
  const [selectedBrand, setSelectedBrand] = useState<FtcBrand | null>(null);

  // v3-03: 2단계 phase state machine
  const [phase, setPhase] = useState<Phase>("idle");
  const [draftId, setDraftId] = useState<string | null>(null);
  const [planResult, setPlanResult] = useState<PlanResult | null>(null);
  const [outline, setOutline] = useState<OutlineResult | null>(null);
  const [factsCount, setFactsCount] = useState<number>(0);
  const [writeResult, setWriteResult] = useState<PhaseBResponse | null>(null);
  const [error, setError] = useState<string>("");

  // debounced typeahead (200ms)
  useEffect(() => {
    if (selectedBrand) return;
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

  // v3-03: 에러 응답 → 메시지 추출
  async function readErrorMessage(res: Response): Promise<string> {
    try {
      const errData = await res.json();
      let msg = errData.message
        ? `${errData.message}${errData.error ? ` [${errData.error}]` : ""}`
        : errData.error || `API ${res.status}`;
      if (Array.isArray(errData.unmatched) && errData.unmatched.length > 0) {
        msg = `${msg}\n\nunmatched 샘플:\n${errData.unmatched.slice(0, 5).join("\n")}`;
      }
      if (Array.isArray(errData.lintErrors) && errData.lintErrors.length > 0) {
        msg = `${msg}\n\nlint errors:\n${errData.lintErrors.slice(0, 5).join("\n")}`;
      }
      return msg;
    } catch {
      const text = await res.text().catch(() => "");
      return `API ${res.status} ${res.statusText}: ${text.slice(0, 300)}`;
    }
  }

  // Phase A — 콘텐츠 생성 (Plan + Outline)
  const handlePlan = useCallback(async () => {
    setError("");
    setPhase("planning");
    setDraftId(null);
    setPlanResult(null);
    setOutline(null);
    setFactsCount(0);
    setWriteResult(null);

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
      const res = await fetch("/api/geo/plan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      if (!res.ok) {
        setError(await readErrorMessage(res));
        setPhase("idle");
        return;
      }
      const data = (await res.json()) as PhaseAResponse;
      setDraftId(data.draftId);
      setPlanResult(data.plan);
      setOutline(data.outline);
      setFactsCount(data.factsCount);
      setPhase("plan_done");
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") {
        setError("타임아웃 (65초 초과). 콘텐츠 생성 단계 — 다시 시도해 주세요.");
      } else {
        setError(err instanceof Error ? err.message : "오류 발생");
      }
      setPhase("idle");
    } finally {
      clearTimeout(timeoutId);
    }
  }, [mode, selectedBrand, industry, topic, tiers]);

  // Phase B — 블로그 글 발행 (Write + Polish)
  const handleWrite = useCallback(async () => {
    if (!draftId) return;
    setError("");
    setPhase("writing");

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 65000);

    try {
      const res = await fetch(`/api/geo/write/${draftId}`, {
        method: "POST",
        signal: controller.signal,
      });
      if (!res.ok) {
        setError(await readErrorMessage(res));
        setPhase("plan_done"); // 다시 시도 가능
        return;
      }
      const data = (await res.json()) as PhaseBResponse;
      setWriteResult(data);
      setPhase("write_done");
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") {
        setError("타임아웃 (65초 초과). 본문 작성 단계 — 다시 시도해 주세요.");
      } else {
        setError(err instanceof Error ? err.message : "오류 발생");
      }
      setPhase("plan_done");
    } finally {
      clearTimeout(timeoutId);
    }
  }, [draftId]);

  const handleReset = () => {
    setError("");
    setPhase("idle");
    setDraftId(null);
    setPlanResult(null);
    setOutline(null);
    setFactsCount(0);
    setWriteResult(null);
  };

  const formInputDisabled = phase !== "idle";
  const isPlanDisabled =
    phase !== "idle" ||
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
                className={`flex items-center gap-2 px-4 py-2 rounded-lg border-2 transition-all ${
                  active
                    ? "border-blue-500 bg-blue-50 shadow-sm"
                    : "border-slate-200 bg-white hover:border-slate-300"
                } ${formInputDisabled ? "opacity-60 cursor-not-allowed" : "cursor-pointer"}`}
              >
                <input
                  type="checkbox"
                  checked={active}
                  onChange={() => !formInputDisabled && toggleTier(tier)}
                  className="hidden"
                  disabled={formInputDisabled}
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
        <div className="flex gap-2 mb-4">
          <button
            type="button"
            onClick={() => !formInputDisabled && setMode("brand")}
            disabled={formInputDisabled}
            className={`px-4 py-2 rounded-lg text-sm font-medium border-2 transition-all ${
              mode === "brand"
                ? "border-blue-500 bg-blue-50 text-blue-700"
                : "border-slate-200 text-slate-600"
            } ${formInputDisabled ? "opacity-60 cursor-not-allowed" : ""}`}
          >
            브랜드 단위
          </button>
          <button
            type="button"
            onClick={() => !formInputDisabled && setMode("industry")}
            disabled={formInputDisabled}
            className={`px-4 py-2 rounded-lg text-sm font-medium border-2 transition-all ${
              mode === "industry"
                ? "border-blue-500 bg-blue-50 text-blue-700"
                : "border-slate-200 text-slate-600"
            } ${formInputDisabled ? "opacity-60 cursor-not-allowed" : ""}`}
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
                {!formInputDisabled && (
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
                )}
              </div>
            ) : (
              <>
                <input
                  type="text"
                  placeholder="브랜드명 검색 (예: 오공김밥)"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  disabled={formInputDisabled}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-slate-50"
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
              disabled={formInputDisabled}
              className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-slate-50"
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
          disabled={formInputDisabled}
          className="w-full px-4 py-3 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none disabled:bg-slate-50"
          rows={3}
        />
        <p className="text-xs text-slate-400 mt-2">
          발행 채널: <span className="font-semibold">/frandoor 블로그</span>
        </p>
      </div>

      {/* 에러 */}
      {error && (
        <div className="rounded-lg bg-red-50 border-2 border-red-200 p-4 space-y-1">
          <div className="text-sm font-semibold text-red-700">⚠️ 실패</div>
          <pre className="text-sm text-red-800 whitespace-pre-wrap break-words">{error}</pre>
        </div>
      )}

      {/* Phase A — 콘텐츠 생성 */}
      {phase === "idle" && (
        <div className="rounded-xl border border-slate-200 bg-white p-6">
          <Button onClick={handlePlan} disabled={isPlanDisabled} className="w-full" size="lg">
            1단계: 콘텐츠 생성 (facts + 구조)
          </Button>
          <p className="text-xs text-slate-400 mt-2 text-center">
            ~20초 소요. Plan(facts 선별) + Outline(5블럭) 까지 만들고 멈춥니다.
          </p>
        </div>
      )}

      {phase === "planning" && (
        <div className="rounded-lg bg-blue-50 border border-blue-200 p-4 text-sm text-blue-800">
          <div className="font-semibold">⏳ 1단계 진행 중...</div>
          <div className="text-xs text-blue-700 mt-1">
            facts 선별 + 5블럭 구조 작성 (haiku × 2). 약 20초 소요.
          </div>
        </div>
      )}

      {/* Phase A 결과 + Phase B 트리거 */}
      {(phase === "plan_done" || phase === "writing" || phase === "write_done") && planResult && outline && (
        <div className="rounded-xl border border-emerald-300 bg-emerald-50 p-6 space-y-4">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <h3 className="text-sm font-semibold text-emerald-900">
              ✓ 1단계 완료 — facts + outline (draft={draftId?.slice(0, 8)})
            </h3>
            <div className="flex items-center gap-3 text-[11px] text-emerald-800">
              <span>facts={factsCount}</span>
              <span>·</span>
              <span>selected={planResult.selected_facts.length}</span>
              <span>·</span>
              <span>blocks={outline.blocks.length}</span>
            </div>
          </div>

          {planResult.key_angle && (
            <div className="text-xs text-slate-700">
              <span className="font-semibold">핵심 각도: </span>
              {planResult.key_angle}
            </div>
          )}

          <details className="rounded-lg border border-emerald-200 bg-white px-4 py-3 text-xs">
            <summary className="cursor-pointer font-semibold text-slate-700">
              선별된 facts ({planResult.selected_facts.length}개) + outliers ({planResult.outliers.length}개)
            </summary>
            <pre className="mt-2 whitespace-pre-wrap break-words text-[11px] text-slate-700 max-h-72 overflow-y-auto">
              {JSON.stringify(planResult, null, 2)}
            </pre>
          </details>

          <details className="rounded-lg border border-emerald-200 bg-white px-4 py-3 text-xs">
            <summary className="cursor-pointer font-semibold text-slate-700">
              5블럭 outline
            </summary>
            <pre className="mt-2 whitespace-pre-wrap break-words text-[11px] text-slate-700 max-h-72 overflow-y-auto">
              {JSON.stringify(outline, null, 2)}
            </pre>
          </details>

          {/* Phase B 버튼 */}
          {phase === "plan_done" && (
            <div className="flex gap-2 pt-2 border-t border-emerald-200">
              <Button onClick={handleWrite} className="flex-1" size="lg">
                2단계: 블로그 글 발행 (본문 작성)
              </Button>
              <Button onClick={handleReset} variant="outline" size="lg">
                다시 facts 선별
              </Button>
            </div>
          )}

          {phase === "writing" && (
            <div className="rounded-lg bg-blue-50 border border-blue-200 p-4 text-sm text-blue-800">
              <div className="font-semibold">⏳ 2단계 진행 중...</div>
              <div className="text-xs text-blue-700 mt-1">
                Write(sonnet 본문) + Polish(haiku 미세교정 + post-process). 약 40초 소요.
              </div>
            </div>
          )}
        </div>
      )}

      {/* Phase B 결과 */}
      {phase === "write_done" && writeResult && <PhaseBPreview result={writeResult} onReset={handleReset} />}
    </div>
  );
}

function PhaseBPreview({ result, onReset }: { result: PhaseBResponse; onReset: () => void }) {
  const detailHref = `/content/posts/${result.draftId}`;

  return (
    <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-6">
      <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-semibold text-emerald-900">✓ 2단계 완료 — 본문 발행</h3>
          <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700">
            저장됨 · {result.draftId.slice(0, 8)}
          </span>
        </div>
        <div className="flex items-center gap-3">
          <Link href={detailHref} className="text-xs text-blue-600 hover:underline">
            발행 관리에서 열기 →
          </Link>
          <button onClick={onReset} className="text-xs text-slate-500 hover:underline">
            새로 시작
          </button>
        </div>
      </div>

      <div className="space-y-3">
        <div>
          <p className="text-xs text-slate-500 mb-1">제목</p>
          <p className="text-sm font-medium text-slate-800">{result.title || "(제목 없음)"}</p>
        </div>

        <div>
          <p className="text-xs text-slate-500 mb-1">최종 본문 ({result.content.length.toLocaleString()}자)</p>
          <pre className="text-xs text-slate-700 whitespace-pre-wrap break-words bg-white rounded p-3 max-h-[600px] overflow-y-auto border border-slate-200">
            {result.content}
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

        {result.polishLog.length > 0 && (
          <div>
            <p className="text-xs text-slate-500 mb-1">Polish log</p>
            <ul className="text-xs text-slate-600 space-y-0.5 list-disc list-inside">
              {result.polishLog.map((w, i) => (
                <li key={i}>{w}</li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}
