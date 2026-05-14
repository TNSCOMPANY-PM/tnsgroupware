import { createAdminClient } from "@/utils/supabase/admin";
import SchedulerForm from "./SchedulerForm";
import SchedulerList from "./SchedulerList";

export const dynamic = "force-dynamic";

export type ScheduleRow = {
  id: string;
  gen_mode: "a_only" | "a_plus_c" | null;
  industry: string | null;
  brand_id: string | null;
  brand_name?: string | null;
  topic: string | null;
  scheduled_at: string;
  status: string;
  draft_id: string | null;
  retry_count: number | null;
  error_msg: string | null;
  published_url: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

type ScheduleRowWithBrand = Omit<ScheduleRow, "brand_name"> & {
  geo_brands: { name: string } | { name: string }[] | null;
};

export default async function SchedulerPage() {
  const sb = createAdminClient();
  const { data, error } = await sb
    .from("frandoor_blog_schedules")
    .select("*, geo_brands(name)")
    .order("scheduled_at", { ascending: false })
    .limit(50);

  const rows: ScheduleRow[] = error
    ? []
    : ((data ?? []) as unknown as ScheduleRowWithBrand[]).map((r) => {
        const gb = r.geo_brands;
        const brandName = Array.isArray(gb) ? gb[0]?.name ?? null : gb?.name ?? null;
        const { geo_brands: _omit, ...rest } = r;
        return { ...rest, brand_name: brandName };
      });

  return (
    <div className="space-y-6 max-w-5xl">
      <div className="rounded-xl border border-slate-200 bg-white p-6">
        <h2 className="text-sm font-semibold text-slate-800 mb-1">예약 발행 등록</h2>
        <p className="text-xs text-slate-500 mb-4">
          A only (업종 분석) 또는 A+C (브랜드 분석) 모드를 선택해 토픽 + 발행 시각을 등록하면 cron 이 자동으로 본문·썸네일 생성 후 frandoor.co.kr 에 즉시 발행합니다.
        </p>
        <SchedulerForm />
        <div className="mt-4 text-[11px] text-slate-400 space-y-0.5">
          <p>⚡ 등록 즉시 백그라운드 generation 시작 (~95초). 페이지 떠나도 OK, 다시 들르면 상태 갱신.</p>
          <p>👀 generation 완료 → "준비 완료" 상태 + 미리보기 가능. quality 확인 후 그대로 대기.</p>
          <p>🚀 예약 시각 도래 시 자동으로 frandoor.co.kr 에 commit 발행.</p>
          <p>🔁 실패 시 다음 cron 에서 1회 자동 재시도.</p>
        </div>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-6">
        <h2 className="text-sm font-semibold text-slate-800 mb-3">예약 목록 (최근 50건)</h2>
        {error ? (
          <p className="text-sm text-rose-600">목록 조회 실패: {error.message}</p>
        ) : rows.length === 0 ? (
          <p className="text-sm text-slate-400">등록된 예약이 없습니다.</p>
        ) : (
          <SchedulerList initialRows={rows} />
        )}
      </div>
    </div>
  );
}
