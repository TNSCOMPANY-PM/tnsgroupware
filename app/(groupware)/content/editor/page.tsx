"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";

type GeoBrand = {
  id: string;
  name: string;
  ftc_brand_id: string | null;
};

type V4Result = {
  draftId: string | null;
  saveError: string | null;
  title: string;
  content: string;
  lintWarnings: string[];
  ccUnmatched: string[];
};

export default function EditorPage() {
  const [topic, setTopic] = useState<string>("");
  const [searchTerm, setSearchTerm] = useState<string>("");
  const [searchResults, setSearchResults] = useState<GeoBrand[]>([]);
  const [searching, setSearching] = useState(false);
  const [selectedBrand, setSelectedBrand] = useState<GeoBrand | null>(null);

  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<V4Result | null>(null);
  const [error, setError] = useState<string>("");

  // brand 검색 (geo_brands typeahead — ftc_brand_id 매핑된 것만)
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
          `/api/geo/brands-search?q=${encodeURIComponent(searchTerm)}&limit=20`,
        );
        if (res.ok) {
          const data = await res.json();
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

  const handleGenerate = useCallback(async () => {
    if (!selectedBrand || !topic.trim()) return;
    setError("");
    setResult(null);
    setLoading(true);

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 65000);

    try {
      const res = await fetch("/api/geo/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ brand_id: selectedBrand.id, topic }),
        signal: controller.signal,
      });
      if (!res.ok) {
        let msg: string;
        try {
          const errData = await res.json();
          msg = errData.message
            ? `${errData.message}${errData.error ? ` [${errData.error}]` : ""}${errData.hint ? `\n\n${errData.hint}` : ""}`
            : errData.error || `API ${res.status}`;
        } catch {
          const text = await res.text().catch(() => "");
          msg = `API ${res.status} ${res.statusText}: ${text.slice(0, 300)}`;
        }
        setError(msg);
        return;
      }
      const data = (await res.json()) as V4Result;
      setResult(data);
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") {
        setError("타임아웃 (65초 초과). 다시 시도해 주세요.");
      } else {
        setError(err instanceof Error ? err.message : "오류 발생");
      }
    } finally {
      clearTimeout(timeoutId);
      setLoading(false);
    }
  }, [selectedBrand, topic]);

  const handleReset = () => {
    setError("");
    setResult(null);
  };

  const isDisabled = loading || !selectedBrand || !topic.trim();

  return (
    <div className="space-y-6 max-w-4xl">
      {/* 1. 브랜드 선택 */}
      <div className="rounded-xl border border-slate-200 bg-white p-6">
        <h2 className="text-sm font-semibold text-slate-800 mb-4">1. 브랜드 선택</h2>
        <p className="text-xs text-slate-500 mb-3">
          geo_brands 에 등록된 브랜드 중 선택. ftc_brand_id 매핑 필수 (자동 데이터 fetch 용).
        </p>
        {selectedBrand ? (
          <div className="flex items-center gap-2 p-3 border border-blue-200 bg-blue-50 rounded-lg">
            <div className="flex-1">
              <p className="text-sm font-medium text-slate-900">{selectedBrand.name}</p>
              <p className="text-xs text-slate-500">
                ftc_brand_id: {selectedBrand.ftc_brand_id ?? "(미매핑 — 생성 시 에러)"}
              </p>
            </div>
            {!loading && (
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
              disabled={loading}
              className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-slate-50"
            />
            {searching && <p className="text-xs text-slate-400 mt-2">검색 중...</p>}
            {!searching && searchResults.length > 0 && (
              <ul className="mt-2 border border-slate-200 rounded-lg max-h-72 overflow-y-auto bg-white">
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
                      ftc_brand_id: {b.ftc_brand_id ?? "(미매핑)"}
                    </p>
                  </li>
                ))}
              </ul>
            )}
            {!searching && searchTerm.trim() && searchResults.length === 0 && (
              <p className="text-xs text-slate-400 mt-2">검색 결과 없음</p>
            )}
          </>
        )}
      </div>

      {/* 2. 토픽 */}
      <div className="rounded-xl border border-slate-200 bg-white p-6">
        <h2 className="text-sm font-semibold text-slate-800 mb-4">2. 토픽 입력</h2>
        <textarea
          placeholder="예: 오공김밥 분식 업종 포지션 분석 / 한식 폐점률 분석 / 본사 운영 모델 차별점"
          value={topic}
          onChange={(e) => setTopic(e.target.value)}
          disabled={loading}
          className="w-full px-4 py-3 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none disabled:bg-slate-50"
          rows={3}
        />
        <p className="text-xs text-slate-400 mt-2">
          공정위 정보공개서 (152 컬럼) + 본사 docx (있으면) + 업종 분포 자동 fetch.
        </p>
      </div>

      {/* 에러 */}
      {error && (
        <div className="rounded-lg bg-red-50 border-2 border-red-200 p-4 space-y-1">
          <div className="text-sm font-semibold text-red-700">⚠️ 생성 실패</div>
          <pre className="text-sm text-red-800 whitespace-pre-wrap break-words">{error}</pre>
        </div>
      )}

      {/* 생성 중 */}
      {loading && (
        <div className="rounded-lg bg-blue-50 border border-blue-200 p-4 text-sm text-blue-800">
          <div className="font-semibold">⏳ 콘텐츠 생성 중...</div>
          <div className="text-xs text-blue-700 mt-1">
            sonnet 1회 호출 (raw 데이터 통째 입력). 약 40초 소요.
          </div>
        </div>
      )}

      {/* 생성 버튼 */}
      <div className="rounded-xl border border-slate-200 bg-white p-6">
        <Button onClick={handleGenerate} disabled={isDisabled} className="w-full" size="lg">
          {loading ? "생성 중..." : "콘텐츠 생성 (v4 freestyle)"}
        </Button>
      </div>

      {/* 결과 */}
      {result && <V4ResultPreview result={result} onReset={handleReset} />}
    </div>
  );
}

function V4ResultPreview({ result, onReset }: { result: V4Result; onReset: () => void }) {
  const detailHref = result.draftId ? `/content/posts/${result.draftId}` : "/content/posts";

  return (
    <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-6">
      <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-semibold text-emerald-900">✓ 생성 완료</h3>
          {result.draftId && (
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700">
              저장됨 · {result.draftId.slice(0, 8)}
            </span>
          )}
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
          <p className="text-xs text-slate-500 mb-1">최종 본문 ({result.content.length.toLocaleString()}자)</p>
          <pre className="text-xs text-slate-700 whitespace-pre-wrap break-words bg-white rounded p-3 max-h-[600px] overflow-y-auto border border-slate-200">
            {result.content}
          </pre>
        </div>

        {result.ccUnmatched.length > 0 && (
          <div>
            <p className="text-xs text-amber-600 mb-1">
              ⚠️ crosscheck unmatched ({result.ccUnmatched.length}건)
            </p>
            <ul className="text-xs text-amber-700 space-y-0.5 list-disc list-inside max-h-32 overflow-y-auto">
              {result.ccUnmatched.slice(0, 10).map((u, i) => (
                <li key={i}>{u}</li>
              ))}
            </ul>
          </div>
        )}

        {result.lintWarnings.length > 0 && (
          <div>
            <p className="text-xs text-amber-600 mb-1">
              ⚠️ lint warnings ({result.lintWarnings.length}건)
            </p>
            <ul className="text-xs text-amber-700 space-y-0.5 list-disc list-inside max-h-32 overflow-y-auto">
              {result.lintWarnings.slice(0, 10).map((w, i) => (
                <li key={i}>{w}</li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}
