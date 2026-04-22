import PipelineRunner from "./runner";

export const dynamic = "force-dynamic";

export default function Page() {
  return (
    <div className="mx-auto max-w-3xl p-6">
      <h1 className="text-lg font-semibold text-slate-800">GEO 파이프라인 드라이런</h1>
      <p className="mt-1 text-sm text-slate-500">
        runA → geo-lint → number-crosscheck → frandoor-pr(dryRun) 게이트 4단 실행.
        매트릭스 EXCLUDE 시 게이트 0에서 차단.
      </p>
      <PipelineRunner />
    </div>
  );
}
