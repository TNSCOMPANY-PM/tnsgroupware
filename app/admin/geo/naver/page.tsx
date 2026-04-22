import NaverSearchVolumeRunner from "./runner";

export const dynamic = "force-dynamic";

export default function Page() {
  return (
    <div className="mx-auto max-w-3xl p-6">
      <h1 className="text-lg font-semibold text-slate-800">네이버 검색광고 월간 수집</h1>
      <p className="mt-1 text-sm text-slate-500">
        브랜드 alias 전체를 네이버 검색광고 API(/keywordstool)로 조회해 월간 검색량을
        <code className="mx-1 rounded bg-slate-100 px-1 text-xs">geo_search_volume_monthly</code>
        에 upsert합니다. 기준월은 호출 시점.
      </p>
      <NaverSearchVolumeRunner />
    </div>
  );
}
