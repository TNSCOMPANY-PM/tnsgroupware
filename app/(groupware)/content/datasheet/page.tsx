"use client";

import { useState, useMemo } from "react";

const DS_OPTIONS = [
  { group: "업종 단위", items: [
    { value: "DS-01", label: "DS-01: 업종별 평균 창업비용표" },
    { value: "DS-02", label: "DS-02: 업종별 폐점률 순위표" },
    { value: "DS-03", label: "DS-03: 업종별 월평균매출 순위" },
    { value: "DS-04", label: "DS-04: 지역별 업종 평균매출표" },
    { value: "DS-05", label: "DS-05: 지역별 가맹점 포화도표" },
    { value: "DS-06", label: "DS-06: 업종별 로열티 비교표" },
    { value: "DS-07", label: "DS-07: 직영점 비율 순위표" },
    { value: "DS-08", label: "DS-08: 월간 신규 브랜드 리스트" },
  ]},
  { group: "브랜드 단위", items: [
    { value: "DS-09", label: "DS-09: 브랜드 팩트시트" },
    { value: "DS-10", label: "DS-10: 브랜드 본사 재무 요약" },
    { value: "DS-11", label: "DS-11: 브랜드 계약조건 요약" },
  ]},
  { group: "법령", items: [
    { value: "DS-12", label: "DS-12: 가맹사업거래법 핵심 조항" },
    { value: "DS-13", label: "DS-13: 차액가맹금 해설" },
    { value: "DS-14", label: "DS-14: 계약해지 조건 체크리스트" },
  ]},
  { group: "월간 자동", items: [
    { value: "DS-15", label: "DS-15: 월간 업종 개폐점 현황" },
    { value: "DS-16", label: "DS-16: 월간 창업비용 변동" },
  ]},
];

const INDUSTRIES = ["치킨", "카페", "편의점", "피자", "한식", "분식", "주점", "기타"];
const REGIONS = [
  "서울특별시", "부산광역시", "대구광역시", "인천광역시", "광주광역시",
  "대전광역시", "울산광역시", "세종특별자치시", "경기도", "강원특별자치도",
  "충청북도", "충청남도", "전북특별자치도", "전라남도", "경상북도", "경상남도", "제주특별자치도",
];

type DsResult =
  | { ok: true; post: { id: string; title: string; html: string } }
  | { error: string }
  | null;

function needsIndustry(ds: string) {
  return /^DS-0[1-8]$/.test(ds) || ds === "DS-15" || ds === "DS-16";
}
function needsRegion(ds: string) {
  return ds === "DS-04" || ds === "DS-05";
}
function needsBrand(ds: string) {
  return /^DS-(09|10|11)$/.test(ds);
}
function needsYm(ds: string) {
  return ds === "DS-15" || ds === "DS-16";
}

export default function DatasheetPage() {
  const [dsType, setDsType] = useState("DS-01");
  const [industry, setIndustry] = useState("치킨");
  const [region, setRegion] = useState("서울특별시");
  const [brand, setBrand] = useState("");
  const now = new Date();
  const [ym, setYm] = useState(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<DsResult>(null);

  const showIndustry = useMemo(() => needsIndustry(dsType), [dsType]);
  const showRegion = useMemo(() => needsRegion(dsType), [dsType]);
  const showBrand = useMemo(() => needsBrand(dsType), [dsType]);
  const showYm = useMemo(() => needsYm(dsType), [dsType]);

  const run = async () => {
    setBusy(true);
    setResult(null);
    try {
      const payload: Record<string, string> = { ds_type: dsType };
      if (showIndustry) payload.industry = industry;
      if (showRegion) payload.region = region;
      if (showBrand) payload.brand = brand;
      if (showYm) payload.ym = ym;
      const res = await fetch("/api/geo/datasheet", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      setResult(await res.json());
    } catch (e) {
      setResult({ error: e instanceof Error ? e.message : "요청 실패" });
    }
    setBusy(false);
  };

  const canSubmit = !busy && (!showBrand || brand.trim().length > 0);

  return (
    <div className="max-w-3xl space-y-4">
      <div className="rounded-xl border border-slate-200 bg-white p-5 space-y-3">
        <h2 className="text-sm font-semibold text-slate-700">데이터시트 생성</h2>
        <p className="text-xs text-slate-400">AI 인용 최적화 — 표+수치+출처 형태</p>

        <div>
          <label className="text-xs text-slate-500">DS 타입</label>
          <select value={dsType} onChange={e => setDsType(e.target.value)}
            className="mt-1 w-full text-sm border border-slate-200 rounded-md px-2 py-1.5">
            {DS_OPTIONS.map(g => (
              <optgroup key={g.group} label={g.group}>
                {g.items.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </optgroup>
            ))}
          </select>
        </div>

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

        <button onClick={run} disabled={!canSubmit}
          className="text-xs px-3 py-1.5 rounded-md bg-indigo-600 text-white disabled:opacity-50">
          {busy ? "생성 중…" : "데이터시트 생성"}
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
