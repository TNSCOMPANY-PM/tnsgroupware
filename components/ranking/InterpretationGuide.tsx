export default function InterpretationGuide() {
  return (
    <div className="grid gap-3 md:grid-cols-2">
      <div className="rounded-xl border border-emerald-200 bg-emerald-50/60 p-4">
        <h3 className="text-sm font-semibold text-emerald-700">이 수치가 의미하는 것</h3>
        <ul className="mt-2 space-y-1.5 text-xs text-emerald-900/80">
          <li>- 소비자의 브랜드 인지도 · 관심 총량</li>
          <li>- 시장 크기 · 경쟁 강도 시그널</li>
          <li>- 프랜차이즈 업종별 상대적 위치 파악</li>
        </ul>
      </div>
      <div className="rounded-xl border border-amber-200 bg-amber-50/60 p-4">
        <h3 className="text-sm font-semibold text-amber-700">의미하지 않는 것</h3>
        <ul className="mt-2 space-y-1.5 text-xs text-amber-900/80">
          <li>- 창업 매력도 · 수익성</li>
          <li>- 가맹점당 평균 매출 · 폐점률</li>
          <li>- 직영 운영 여부 (❌/⚠️ 뱃지 별도 확인)</li>
        </ul>
      </div>
    </div>
  );
}
