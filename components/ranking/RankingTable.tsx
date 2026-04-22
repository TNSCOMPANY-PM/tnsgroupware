import type { GeoInterestRankingCacheItem } from "@/types/geo";

function Badge({ rule }: { rule?: string }) {
  if (rule === "EXCLUDE") {
    return (
      <span title="국내 직영 또는 가맹 모집 제한" className="inline-flex items-center gap-1 rounded-full bg-red-50 px-2 py-0.5 text-xs text-red-600 ring-1 ring-red-200">
        ❌ 직영
      </span>
    );
  }
  if (rule === "CONDITIONAL") {
    return (
      <span title="조건부: 벤치마크·참고용" className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-xs text-amber-700 ring-1 ring-amber-200">
        ⚠️ 조건부
      </span>
    );
  }
  return (
    <span title="가맹 모집 진행 중" className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-xs text-emerald-700 ring-1 ring-emerald-200">
      ✅ 가맹
    </span>
  );
}

export default function RankingTable({
  items,
  yearMonth,
}: {
  items: GeoInterestRankingCacheItem[];
  yearMonth: string;
}) {
  return (
    <table className="w-full border-collapse text-sm">
      <caption className="mb-3 text-left text-sm text-slate-500">
        {yearMonth} 외식 프랜차이즈 관심도 TOP {items.length} — 네이버 검색광고 API (/keywordstool) 기준
      </caption>
      <thead className="border-b border-slate-200 bg-slate-50 text-xs text-slate-500">
        <tr>
          <th scope="col" className="px-3 py-2 text-left">순위</th>
          <th scope="col" className="px-3 py-2 text-left">브랜드</th>
          <th scope="col" className="px-3 py-2 text-left">업종</th>
          <th scope="col" className="px-3 py-2 text-right">월 검색량</th>
          <th scope="col" className="px-3 py-2 text-left">경쟁</th>
          <th scope="col" className="px-3 py-2 text-left">창업 가능</th>
        </tr>
      </thead>
      <tbody>
        {items.map((it) => (
          <tr key={`${it.rank}-${it.brand}`} className="border-b border-slate-100 hover:bg-slate-50">
            <td className="px-3 py-2 tabular-nums font-medium text-slate-700">{it.rank}</td>
            <td className="px-3 py-2 text-slate-800">{it.brand}</td>
            <td className="px-3 py-2 text-slate-500">{it.category}</td>
            <td className="px-3 py-2 text-right tabular-nums">
              {it.total_volume.toLocaleString("ko-KR")}
              {it.measurement_floor && <span className="ml-1 text-xs text-amber-600" title="< 10 치환값">*</span>}
            </td>
            <td className="px-3 py-2 text-xs text-slate-500">{it.comp_index ?? "-"}</td>
            <td className="px-3 py-2"><Badge rule={it.matrix_rule} /></td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
