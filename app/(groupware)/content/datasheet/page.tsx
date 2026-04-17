"use client";

import { useState, useMemo, useCallback } from "react";

/* ── DS 타입 정의 ── */
const DS_OPTIONS = [
  { group: "업종 단위", items: [
    { value: "DS-01", label: "업종별 평균 창업비용표" },
    { value: "DS-02", label: "업종별 폐점률 순위표" },
    { value: "DS-03", label: "업종별 월평균매출 순위" },
    { value: "DS-04", label: "지역별 업종 평균매출표" },
    { value: "DS-05", label: "지역별 가맹점 포화도표" },
    { value: "DS-06", label: "업종별 로열티 비교표" },
    { value: "DS-07", label: "직영점 비율 순위표" },
    { value: "DS-08", label: "월간 신규 브랜드 리스트" },
    { value: "DS-27", label: "업종 개황 종합 리포트" },
    { value: "DS-28", label: "월간 신규 등록 브랜드" },
  ]},
  { group: "지역·컨텍스트", items: [
    { value: "DS-17", label: "지역 관광 상권 현황" },
    { value: "DS-18", label: "지역 업종 사업자 생존율" },
    { value: "DS-19", label: "상권 업종 밀도 분포" },
    { value: "DS-20", label: "지역 축제·창업 타이밍" },
  ]},
  { group: "브랜드 단위", items: [
    { value: "DS-09", label: "브랜드 팩트시트" },
    { value: "DS-10", label: "브랜드 본사 재무 요약" },
    { value: "DS-11", label: "브랜드 계약조건 요약" },
    { value: "DS-21", label: "브랜드 신뢰도 스코어카드" },
    { value: "DS-24", label: "브랜드 가맹점 증감 추이" },
  ]},
  { group: "시장·계보", items: [
    { value: "DS-25", label: "외국계 프랜차이즈 특집" },
    { value: "DS-26", label: "대기업 프랜차이즈 계보도" },
  ]},
  { group: "법령·실무", items: [
    { value: "DS-12", label: "가맹사업거래법 핵심 조항" },
    { value: "DS-13", label: "차액가맹금 해설" },
    { value: "DS-14", label: "계약해지 조건 체크리스트" },
    { value: "DS-22", label: "분쟁조정 실전 가이드" },
    { value: "DS-23", label: "계약 전 20개 체크리스트" },
  ]},
  { group: "식품·시장", items: [
    { value: "DS-29", label: "업종 식품안전 이슈" },
    { value: "DS-30", label: "업종 거시 시장규모" },
  ]},
  { group: "월간 자동", items: [
    { value: "DS-15", label: "월간 업종 개폐점 현황" },
    { value: "DS-16", label: "월간 창업비용 변동" },
  ]},
];

/* ── 추천 조합 맵 ── */
const RECOMMENDATIONS: Record<string, { label: string; types: string[] }[]> = {
  "DS-01": [
    { label: "업종 종합분석", types: ["DS-01", "DS-02", "DS-03", "DS-06"] },
    { label: "창업비용 + 매출 비교", types: ["DS-01", "DS-03", "DS-15"] },
  ],
  "DS-02": [
    { label: "리스크 분석", types: ["DS-02", "DS-05", "DS-07"] },
    { label: "업종 종합분석", types: ["DS-01", "DS-02", "DS-03", "DS-06"] },
  ],
  "DS-03": [
    { label: "매출 vs 비용", types: ["DS-03", "DS-01", "DS-06"] },
    { label: "지역별 매출 심화", types: ["DS-03", "DS-04", "DS-05"] },
  ],
  "DS-04": [
    { label: "지역 종합분석", types: ["DS-04", "DS-05", "DS-15"] },
  ],
  "DS-05": [
    { label: "지역 포화도 + 리스크", types: ["DS-05", "DS-02", "DS-04"] },
  ],
  "DS-06": [
    { label: "비용 종합", types: ["DS-06", "DS-01", "DS-11"] },
  ],
  "DS-07": [
    { label: "본사 신뢰도 분석", types: ["DS-07", "DS-02", "DS-10"] },
  ],
  "DS-08": [
    { label: "신규 브랜드 + 시장동향", types: ["DS-08", "DS-15", "DS-16"] },
  ],
  "DS-09": [
    { label: "브랜드 종합분석", types: ["DS-09", "DS-10", "DS-11"] },
    { label: "브랜드 + 업종 비교", types: ["DS-09", "DS-01", "DS-02", "DS-03"] },
  ],
  "DS-10": [
    { label: "브랜드 종합분석", types: ["DS-09", "DS-10", "DS-11"] },
  ],
  "DS-11": [
    { label: "계약 + 법령", types: ["DS-11", "DS-12", "DS-14"] },
    { label: "브랜드 종합분석", types: ["DS-09", "DS-10", "DS-11"] },
  ],
  "DS-12": [
    { label: "법령 종합", types: ["DS-12", "DS-13", "DS-14"] },
    { label: "법령 + 계약조건", types: ["DS-12", "DS-14", "DS-11"] },
  ],
  "DS-13": [
    { label: "법령 종합", types: ["DS-12", "DS-13", "DS-14"] },
  ],
  "DS-14": [
    { label: "법령 종합", types: ["DS-12", "DS-13", "DS-14"] },
    { label: "해지 + 계약조건", types: ["DS-14", "DS-11", "DS-12"] },
  ],
  "DS-15": [
    { label: "월간 시장동향", types: ["DS-15", "DS-16", "DS-08"] },
    { label: "개폐점 + 폐점률", types: ["DS-15", "DS-02", "DS-05"] },
  ],
  "DS-16": [
    { label: "월간 시장동향", types: ["DS-15", "DS-16", "DS-08"] },
    { label: "비용 변동 + 업종분석", types: ["DS-16", "DS-01", "DS-03"] },
  ],
  "DS-17": [
    { label: "지역 창업 종합", types: ["DS-17", "DS-19", "DS-04"] },
  ],
  "DS-18": [
    { label: "리스크 종합", types: ["DS-18", "DS-02", "DS-07"] },
  ],
  "DS-19": [
    { label: "상권 밀도 분석", types: ["DS-19", "DS-05", "DS-04"] },
  ],
  "DS-20": [
    { label: "시즌 창업", types: ["DS-20", "DS-17", "DS-04"] },
  ],
  "DS-21": [
    { label: "브랜드 검증 풀", types: ["DS-21", "DS-24", "DS-09", "DS-10", "DS-11"] },
  ],
  "DS-22": [
    { label: "분쟁 대비", types: ["DS-22", "DS-14", "DS-11"] },
  ],
  "DS-23": [
    { label: "계약 전 최종", types: ["DS-23", "DS-11", "DS-21"] },
  ],
  "DS-24": [
    { label: "브랜드 추세", types: ["DS-24", "DS-21", "DS-09"] },
  ],
  "DS-25": [
    { label: "외국계 심층", types: ["DS-25", "DS-01", "DS-27"] },
  ],
  "DS-26": [
    { label: "대기업 분석", types: ["DS-26", "DS-25", "DS-27"] },
  ],
  "DS-27": [
    { label: "업종 완전정복", types: ["DS-27", "DS-01", "DS-02", "DS-03", "DS-28"] },
  ],
  "DS-28": [
    { label: "월간 트렌드", types: ["DS-28", "DS-15", "DS-16"] },
  ],
  "DS-29": [
    { label: "업종 리스크 풀", types: ["DS-29", "DS-02", "DS-18"] },
  ],
  "DS-30": [
    { label: "시장 진입 분석", types: ["DS-30", "DS-27", "DS-01"] },
  ],
};

const INDUSTRIES = ["전체", "치킨", "카페", "편의점", "피자", "한식", "분식", "주점", "기타"];
const REGIONS = [
  "서울특별시", "부산광역시", "대구광역시", "인천광역시", "광주광역시",
  "대전광역시", "울산광역시", "세종특별자치시", "경기도", "강원특별자치도",
  "충청북도", "충청남도", "전북특별자치도", "전라남도", "경상북도", "경상남도", "제주특별자치도",
];

type PostItem = { id: string; title: string; html: string };
type DsResult =
  | { ok: true; post: PostItem }
  | { ok: true; posts: PostItem[]; composite: PostItem }
  | { error: string }
  | null;

function needsIndustry(ds: string) {
  return /^DS-0[1-8]$/.test(ds) || ds === "DS-15" || ds === "DS-16"
    || ds === "DS-18" || ds === "DS-19" || ds === "DS-27" || ds === "DS-29" || ds === "DS-30";
}
function needsRegion(ds: string) {
  return ds === "DS-04" || ds === "DS-05"
    || ds === "DS-17" || ds === "DS-18" || ds === "DS-19" || ds === "DS-20";
}
function needsBrand(ds: string) {
  return /^DS-(09|10|11)$/.test(ds) || ds === "DS-21" || ds === "DS-24";
}
function needsYm(ds: string) {
  return ds === "DS-15" || ds === "DS-16" || ds === "DS-28";
}

function dsLabel(v: string): string {
  for (const g of DS_OPTIONS) {
    const found = g.items.find(i => i.value === v);
    if (found) return found.label;
  }
  return v;
}

export default function DatasheetPage() {
  const [selected, setSelected] = useState<string[]>(["DS-01"]);
  const [industry, setIndustry] = useState("치킨");
  const [region, setRegion] = useState("서울특별시");
  const [brand, setBrand] = useState("");
  const now = new Date();
  const [ym, setYm] = useState(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`);
  const [busy, setBusy] = useState(false);
  const [results, setResults] = useState<DsResult>(null);

  /* 선택된 DS들의 필요 필드 합산 */
  const showIndustry = useMemo(() => selected.some(needsIndustry), [selected]);
  const showRegion = useMemo(() => selected.some(needsRegion), [selected]);
  const showBrand = useMemo(() => selected.some(needsBrand), [selected]);
  const showYm = useMemo(() => selected.some(needsYm), [selected]);

  /* 추천 조합: 첫 번째 선택된 타입 기준 */
  const recommendations = useMemo(() => {
    if (selected.length === 0) return [];
    const firstKey = selected[0];
    return (RECOMMENDATIONS[firstKey] ?? []).filter(
      r => !r.types.every(t => selected.includes(t)) // 이미 전부 선택된 조합은 숨김
    );
  }, [selected]);

  const toggle = useCallback((val: string) => {
    setSelected(prev =>
      prev.includes(val) ? prev.filter(v => v !== val) : [...prev, val]
    );
  }, []);

  const applyRecommendation = useCallback((types: string[]) => {
    setSelected(prev => {
      const merged = new Set([...prev, ...types]);
      return Array.from(merged);
    });
  }, []);

  const run = async () => {
    setBusy(true);
    setResults(null);
    try {
      const res = await fetch("/api/geo/datasheet", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ds_types: selected,
          industry: showIndustry ? industry : undefined,
          region: showRegion ? region : undefined,
          brand: showBrand ? brand : undefined,
          ym: showYm ? ym : undefined,
        }),
      });
      setResults(await res.json());
    } catch (e) {
      setResults({ error: e instanceof Error ? e.message : "요청 실패" });
    }
    setBusy(false);
  };

  const canSubmit = !busy && selected.length > 0 && (!showBrand || brand.trim().length > 0);

  /* 결과에서 posts / composite 추출 */
  const posts = useMemo(() => {
    if (!results) return [];
    if ("posts" in results && results.ok) return results.posts;
    if ("post" in results && results.ok) return [results.post];
    return [];
  }, [results]);

  const composite = useMemo(() => {
    if (!results) return null;
    if ("composite" in results && results.ok) return results.composite;
    return null;
  }, [results]);

  const [viewMode, setViewMode] = useState<"composite" | "individual">("composite");

  return (
    <div className="max-w-3xl space-y-4">
      <div className="rounded-xl border border-slate-200 bg-white p-5 space-y-4">
        <div>
          <h2 className="text-sm font-semibold text-slate-700">데이터시트 생성</h2>
          <p className="text-xs text-slate-400 mt-0.5">
            AI 인용 최적화 — 복수 선택으로 조합 콘텐츠 생성
          </p>
        </div>

        {/* ── DS 타입 멀티 셀렉트 (칩) ── */}
        {DS_OPTIONS.map(g => (
          <div key={g.group}>
            <div className="text-[11px] font-medium text-slate-400 mb-1.5">{g.group}</div>
            <div className="flex flex-wrap gap-1.5">
              {g.items.map(o => {
                const active = selected.includes(o.value);
                return (
                  <button key={o.value} onClick={() => toggle(o.value)}
                    className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${
                      active
                        ? "bg-indigo-600 text-white border-indigo-600"
                        : "bg-white text-slate-600 border-slate-200 hover:border-indigo-300 hover:text-indigo-600"
                    }`}>
                    <span className="font-mono mr-1">{o.value}</span>
                    {o.label}
                  </button>
                );
              })}
            </div>
          </div>
        ))}

        {/* ── 추천 조합 ── */}
        {recommendations.length > 0 && (
          <div className="rounded-lg bg-indigo-50 border border-indigo-100 px-3 py-2.5 space-y-1.5">
            <div className="text-[11px] font-medium text-indigo-600">추천 조합</div>
            {recommendations.map((r, i) => (
              <button key={i} onClick={() => applyRecommendation(r.types)}
                className="flex items-center gap-2 w-full text-left text-xs text-indigo-700 hover:bg-indigo-100 rounded px-2 py-1 transition-colors">
                <span className="shrink-0">＋</span>
                <span className="font-medium">{r.label}</span>
                <span className="text-indigo-400 ml-auto">{r.types.join(" + ")}</span>
              </button>
            ))}
          </div>
        )}

        {/* ── 선택된 DS 요약 ── */}
        {selected.length > 0 && (
          <div className="text-xs text-slate-500">
            선택: {selected.map((s, i) => (
              <span key={s}>
                {i > 0 && " + "}
                <span className="font-mono font-medium text-slate-700">{s}</span>
              </span>
            ))}
            <button onClick={() => setSelected([])} className="ml-2 text-red-400 hover:text-red-600">
              초기화
            </button>
          </div>
        )}

        {/* ── 파라미터 입력 ── */}
        <div className="grid grid-cols-2 gap-3">
          {showIndustry && (
            <div>
              <label className="text-xs text-slate-500">업종</label>
              <select value={industry} onChange={e => setIndustry(e.target.value)}
                className="mt-1 w-full text-sm border border-slate-200 rounded-md px-2 py-1.5">
                {INDUSTRIES.map(i => <option key={i}>{i}</option>)}
              </select>
            </div>
          )}

          {showRegion && (
            <div>
              <label className="text-xs text-slate-500">지역</label>
              <select value={region} onChange={e => setRegion(e.target.value)}
                className="mt-1 w-full text-sm border border-slate-200 rounded-md px-2 py-1.5">
                {REGIONS.map(r => <option key={r}>{r}</option>)}
              </select>
            </div>
          )}

          {showBrand && (
            <div>
              <label className="text-xs text-slate-500">브랜드명</label>
              <input type="text" value={brand} onChange={e => setBrand(e.target.value)}
                className="mt-1 w-full text-sm border border-slate-200 rounded-md px-2 py-1.5"
                placeholder="예: BBQ" />
            </div>
          )}

          {showYm && (
            <div>
              <label className="text-xs text-slate-500">연월</label>
              <input type="month" value={ym} onChange={e => setYm(e.target.value)}
                className="mt-1 w-full text-sm border border-slate-200 rounded-md px-2 py-1.5" />
            </div>
          )}
        </div>

        <button onClick={run} disabled={!canSubmit}
          className="text-xs px-4 py-2 rounded-md bg-indigo-600 text-white disabled:opacity-50 hover:bg-indigo-700 transition-colors">
          {busy ? "생성 중…" : `데이터시트 생성 (${selected.length}개)`}
        </button>
      </div>

      {/* ── 에러 ── */}
      {results && "error" in results && (
        <div className="rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-xs text-red-700">
          {results.error}
        </div>
      )}

      {/* ── 결과 ── */}
      {(posts.length > 0 || composite) && (
        <div className="space-y-4">
          {/* 합성/개별 토글 (2개 이상일 때만) */}
          {composite && posts.length > 1 && (
            <div className="flex gap-1 text-xs">
              <button onClick={() => setViewMode("composite")}
                className={`px-3 py-1 rounded-md ${viewMode === "composite" ? "bg-indigo-600 text-white" : "bg-slate-100 text-slate-600"}`}>
                종합 보기
              </button>
              <button onClick={() => setViewMode("individual")}
                className={`px-3 py-1 rounded-md ${viewMode === "individual" ? "bg-indigo-600 text-white" : "bg-slate-100 text-slate-600"}`}>
                개별 보기
              </button>
            </div>
          )}

          {/* 합성 뷰 */}
          {viewMode === "composite" && composite && (
            <div className="rounded-xl border border-slate-200 bg-white p-5 space-y-3">
              <div className="text-xs text-slate-500">{composite.title}</div>
              <div className="border-t border-slate-100 pt-3 prose prose-sm max-w-none"
                dangerouslySetInnerHTML={{ __html: composite.html }} />
            </div>
          )}

          {/* 개별 뷰 (또는 단일 결과) */}
          {(viewMode === "individual" || !composite) && posts.map((p, idx) => (
            <div key={p.id ?? idx} className="rounded-xl border border-slate-200 bg-white p-5 space-y-3">
              <div className="text-xs text-slate-500">{p.title}</div>
              <div className="border-t border-slate-100 pt-3 prose prose-sm max-w-none"
                dangerouslySetInnerHTML={{ __html: p.html }} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
