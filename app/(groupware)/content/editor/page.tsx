"use client";

import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import type { GeoOutput } from "@/lib/geo/types";

type Depth = "D0" | "D1" | "D2" | "D3";
type Tier = "A" | "B" | "C";

type Brand = {
  id: string;
  name: string;
};

// 서버가 반환하는 shape: GeoOutput + PR028 에서 추가된 draftId / saveError.
type GenerateResponse = GeoOutput & {
  draftId?: string | null;
  saveError?: string | null;
};

const DEPTH_DESCRIPTIONS: Record<Depth, { label: string; example: string }> = {
  D0: { label: "창업 할까말까", example: "퇴직금 5천만원으로 시작할 프랜차이즈" },
  D1: { label: "카테고리 탐색", example: "프랜차이즈 창업 카테고리 비교" },
  D2: { label: "카테고리 내 브랜드 비교", example: "치킨 프랜차이즈 추천" },
  D3: { label: "브랜드 상세 분석", example: "오공김밥 창업비용, 가맹점주 수익" },
};

export default function EditorPage() {
  const [depth, setDepth] = useState<Depth>("D3");
  const [tiers, setTiers] = useState<Set<Tier>>(new Set(["A", "B"]));
  const [brandId, setBrandId] = useState<string>("");
  const [topic, setTopic] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<GenerateResponse | null>(null);
  const [brands, setBrands] = useState<Brand[]>([]);
  const [searchTerm, setSearchTerm] = useState<string>("");
  const [error, setError] = useState<string>("");

  const cDisabled = depth !== "D3";
  const brandRequired = depth === "D3";

  const channelHint: Record<Depth, string> = {
    D0: "/frandoor 블로그",
    D1: "/frandoor 블로그",
    D2: "/industry/[slug]",
    D3: "/franchise/[slug]",
  };

  useEffect(() => {
    const fetchBrands = async () => {
      try {
        const res = await fetch("/api/geo/brands");
        if (res.ok) {
          const data = await res.json();
          setBrands(Array.isArray(data) ? data : []);
        }
      } catch (err) {
        setBrands([]);
      }
    };

    fetchBrands();
  }, []);

  useEffect(() => {
    if (cDisabled && tiers.has("C")) {
      setTiers(prev => {
        const newSet = new Set(prev);
        newSet.delete("C");
        return newSet;
      });
    }
  }, [cDisabled, tiers]);

  const filteredBrands = searchTerm.trim()
    ? brands.filter(b => b.name.toLowerCase().includes(searchTerm.toLowerCase()))
    : brands;

  const toggleTier = (tier: Tier) => {
    if (cDisabled && tier === "C") return;
    setTiers(prev => {
      const newSet = new Set(prev);
      if (newSet.has(tier)) {
        newSet.delete(tier);
      } else {
        newSet.add(tier);
      }
      return newSet;
    });
  };

  const handleGenerate = useCallback(async () => {
    setError("");
    setLoading(true);

    try {
      const body: Record<string, unknown> = {
        depth,
        tiers: Array.from(tiers),
        topic,
      };

      if (depth === "D3") {
        body.brandId = brandId;
        const selectedBrand = brands.find(b => b.id === brandId);
        if (selectedBrand) {
          body.brand = selectedBrand.name;
        }
      }

      const res = await fetch("/api/geo/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const errData = await res.json();
        // PR061 — message 우선 (정확한 사유), code 보조.
        const msg = errData.message
          ? `${errData.message}${errData.error ? ` [${errData.error}]` : ""}`
          : errData.error || "생성 실패";
        setError(msg);
        setLoading(false);
        return;
      }

      const data = await res.json();
      setResult(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "오류 발생");
    } finally {
      setLoading(false);
    }
  }, [depth, tiers, topic, brandId, brands]);

  const isGenerateDisabled = loading || !topic.trim() || (brandRequired && !brandId);

  return (
    <div className="space-y-6 max-w-4xl">
      {/* 깊이 선택 */}
      <div className="rounded-xl border border-slate-200 bg-white p-6">
        <h2 className="text-sm font-semibold text-slate-800 mb-4">1. 독자 여정 선택</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {(["D0", "D1", "D2", "D3"] as const).map(d => (
            <button
              key={d}
              onClick={() => setDepth(d)}
              className={`p-4 rounded-lg border-2 transition-all text-left ${
                depth === d
                  ? "border-blue-500 bg-blue-50"
                  : "border-slate-200 hover:border-slate-300"
              }`}
            >
              <p className="font-semibold text-sm">{d}</p>
              <p className="text-xs text-slate-600 mt-1">
                {DEPTH_DESCRIPTIONS[d].label}
              </p>
              <p className="text-[10px] text-slate-400 mt-2 line-clamp-2">
                예: {DEPTH_DESCRIPTIONS[d].example}
              </p>
            </button>
          ))}
        </div>
      </div>

      {/* 소스 등급 선택 */}
      <div className="rounded-xl border border-slate-200 bg-white p-6">
        <h2 className="text-sm font-semibold text-slate-800 mb-4">2. 소스 등급 선택</h2>
        <div className="flex gap-4 items-center flex-wrap">
          {(["A", "B", "C"] as const).map(tier => (
            <label
              key={tier}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg border-2 cursor-pointer transition-all ${
                tiers.has(tier)
                  ? "border-blue-500 bg-blue-50"
                  : "border-slate-200"
              } ${cDisabled && tier === "C" ? "opacity-50 cursor-not-allowed" : ""}`}
            >
              <input
                type="checkbox"
                checked={tiers.has(tier)}
                onChange={() => toggleTier(tier)}
                disabled={cDisabled && tier === "C"}
                className="hidden"
              />
              <span className="text-sm font-medium">
                {tier === "A" && "A급 (공정위)"}
                {tier === "B" && "B급 (공공API)"}
                {tier === "C" && "C급 (내부)"}
              </span>
            </label>
          ))}
        </div>
        {cDisabled && (
          <p className="text-xs text-slate-500 mt-3">
            C급은 D3 전용입니다
          </p>
        )}
      </div>

      {/* 브랜드 선택 (D3만) */}
      {brandRequired && (
        <div className="rounded-xl border border-slate-200 bg-white p-6">
          <h2 className="text-sm font-semibold text-slate-800 mb-4">3. 브랜드 선택</h2>
          <div className="space-y-3">
            <input
              type="text"
              placeholder="브랜드 검색..."
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <select
              value={brandId}
              onChange={e => setBrandId(e.target.value)}
              className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">브랜드를 선택하세요</option>
              {filteredBrands.map(b => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
          </div>
        </div>
      )}

      {/* 주제 입력 */}
      <div className="rounded-xl border border-slate-200 bg-white p-6">
        <h2 className="text-sm font-semibold text-slate-800 mb-4">
          {brandRequired ? "4. 주제 입력" : "3. 주제 입력"}
        </h2>
        <textarea
          placeholder="예: 오공김밥 창업비용, 프랜차이즈 추천, 초보자 가이드"
          value={topic}
          onChange={e => setTopic(e.target.value)}
          className="w-full px-4 py-3 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
          rows={3}
        />
        <p className="text-xs text-slate-400 mt-2">
          발행 채널: <span className="font-semibold">{channelHint[depth]}</span>
        </p>
      </div>

      {/* 에러 표시 */}
      {error && (
        <div className="rounded-lg bg-red-50 border border-red-200 p-4">
          <p className="text-sm text-red-800">{error}</p>
        </div>
      )}

      {/* Generate 버튼 */}
      <div className="rounded-xl border border-slate-200 bg-white p-6">
        <Button
          onClick={handleGenerate}
          disabled={isGenerateDisabled}
          className="w-full"
          size="lg"
        >
          {loading ? "생성 중..." : "콘텐츠 생성"}
        </Button>
      </div>

      {/* 결과 표시 */}
      {result && <ResultPreview result={result} />}
    </div>
  );
}

function ResultPreview({ result }: { result: GenerateResponse }) {
  const preview = buildPreview(result);
  const detailHref = result.draftId
    ? `/content/posts/${result.draftId}`
    : "/content/posts";

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
          <p className="text-sm font-medium text-slate-800">{preview.title || "(제목 없음)"}</p>
        </div>

        {preview.sections.length > 0 && (
          <div>
            <p className="text-xs text-slate-500 mb-2">섹션 미리보기</p>
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {preview.sections.slice(0, 3).map((s, i) => (
                <div key={i} className="text-xs">
                  <p className="font-semibold text-slate-700">{s.heading}</p>
                  <p className="text-slate-600 line-clamp-2">{s.body}</p>
                </div>
              ))}
              {preview.sections.length > 3 && (
                <p className="text-xs text-slate-400 text-center">
                  외 {preview.sections.length - 3}개 섹션...
                </p>
              )}
            </div>
          </div>
        )}

        {preview.bodyExcerpt && (
          <div>
            <p className="text-xs text-slate-500 mb-1">본문 발췌</p>
            <pre className="text-xs text-slate-600 whitespace-pre-wrap bg-white/60 rounded p-2 max-h-48 overflow-y-auto">
              {preview.bodyExcerpt}
            </pre>
          </div>
        )}

        <div className="flex items-center gap-3 text-[11px] text-slate-500 pt-2 border-t border-emerald-200">
          <span>depth {result.depth}</span>
          <span>·</span>
          <span>canonical {result.canonicalUrl}</span>
          {result.lint && (
            <>
              <span>·</span>
              <span>lint err={result.lint.errors.length}</span>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function buildPreview(result: GenerateResponse): {
  title: string;
  sections: Array<{ heading: string; body: string }>;
  bodyExcerpt: string;
} {
  const p = result.payload;
  if (p.kind === "markdown") {
    const title = typeof p.frontmatter?.title === "string" ? p.frontmatter.title : "";
    return { title, sections: [], bodyExcerpt: (p.body ?? "").slice(0, 500) };
  }
  if (p.kind === "industryDoc") {
    const title = p.sections?.[0]?.heading ?? "";
    return { title, sections: p.sections ?? [], bodyExcerpt: "" };
  }
  if (p.kind === "franchiseDoc") {
    const title = p.closure?.headline ?? p.sections?.[0]?.heading ?? "";
    const excerpt = (p.closure?.bodyHtml ?? "")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 500);
    return { title, sections: p.sections ?? [], bodyExcerpt: excerpt };
  }
  return { title: "", sections: [], bodyExcerpt: "" };
}
