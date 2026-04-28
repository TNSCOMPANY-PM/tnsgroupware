"use client";

import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";

type Tier = "A" | "B" | "C";

type Brand = {
  id: string;
  name: string;
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
  const [tiers, setTiers] = useState<Set<Tier>>(new Set(["A", "B", "C"]));
  const [brandId, setBrandId] = useState<string>("");
  const [topic, setTopic] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<GenerateV2Response | null>(null);
  const [brands, setBrands] = useState<Brand[]>([]);
  const [searchTerm, setSearchTerm] = useState<string>("");
  const [error, setError] = useState<string>("");

  useEffect(() => {
    const fetchBrands = async () => {
      try {
        const res = await fetch("/api/geo/brands");
        if (res.ok) {
          const data = await res.json();
          setBrands(Array.isArray(data) ? data : []);
        }
      } catch {
        setBrands([]);
      }
    };
    fetchBrands();
  }, []);

  const filteredBrands = searchTerm.trim()
    ? brands.filter((b) => b.name.toLowerCase().includes(searchTerm.toLowerCase()))
    : brands;

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
    try {
      const body = {
        brandId,
        topic,
        tiers: Array.from(tiers),
      };
      const res = await fetch("/api/geo/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const errData = await res.json();
        const msg = errData.message
          ? `${errData.message}${errData.error ? ` [${errData.error}]` : ""}`
          : errData.error || "생성 실패";
        setError(msg);
        if (Array.isArray(errData.unmatched) && errData.unmatched.length > 0) {
          setError(`${msg}\n\nunmatched 샘플:\n${errData.unmatched.slice(0, 5).join("\n")}`);
        }
        setLoading(false);
        return;
      }
      const data = (await res.json()) as GenerateV2Response;
      setResult(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "오류 발생");
    } finally {
      setLoading(false);
    }
  }, [brandId, topic, tiers]);

  const isGenerateDisabled = loading || !topic.trim() || !brandId || tiers.size === 0;

  return (
    <div className="space-y-6 max-w-4xl">
      {/* 1. 데이터 등급 선택 */}
      <div className="rounded-xl border border-slate-200 bg-white p-6">
        <h2 className="text-sm font-semibold text-slate-800 mb-4">1. 데이터 등급 선택</h2>
        <div className="flex gap-4 items-center flex-wrap">
          {(["A", "B", "C"] as const).map((tier) => (
            <label
              key={tier}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg border-2 cursor-pointer transition-all ${
                tiers.has(tier) ? "border-blue-500 bg-blue-50" : "border-slate-200"
              }`}
            >
              <input
                type="checkbox"
                checked={tiers.has(tier)}
                onChange={() => toggleTier(tier)}
                className="hidden"
              />
              <span className="text-sm font-medium">
                {tier === "A" && "A급 (공정위 정보공개서)"}
                {tier === "B" && "B급 (공공API · KOSIS)"}
                {tier === "C" && "C급 (본사 docx)"}
              </span>
            </label>
          ))}
        </div>
        <p className="text-xs text-slate-500 mt-3">
          체크된 tier 의 facts 만 LLM3 에 전달됩니다. 각 tier 는 brand_facts pool 의 source_tier 와 매칭됩니다.
        </p>
      </div>

      {/* 2. 브랜드 선택 */}
      <div className="rounded-xl border border-slate-200 bg-white p-6">
        <h2 className="text-sm font-semibold text-slate-800 mb-4">2. 브랜드 선택</h2>
        <div className="space-y-3">
          <input
            type="text"
            placeholder="브랜드 검색..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <select
            value={brandId}
            onChange={(e) => setBrandId(e.target.value)}
            className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="">브랜드를 선택하세요</option>
            {filteredBrands.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
        </div>
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
        <div className="rounded-lg bg-red-50 border border-red-200 p-4">
          <pre className="text-sm text-red-800 whitespace-pre-wrap">{error}</pre>
        </div>
      )}

      {/* Generate 버튼 */}
      <div className="rounded-xl border border-slate-200 bg-white p-6">
        <Button onClick={handleGenerate} disabled={isGenerateDisabled} className="w-full" size="lg">
          {loading ? "생성 중..." : "콘텐츠 생성 (v2 RAG)"}
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
