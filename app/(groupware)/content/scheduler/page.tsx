import { createAdminClient } from "@/utils/supabase/admin";
import SchedulerForm from "./SchedulerForm";
import SchedulerList from "./SchedulerList";

export const dynamic = "force-dynamic";

export type ScheduleRow = {
  id: string;
  industry: string;
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

export default async function SchedulerPage() {
  const sb = createAdminClient();
  const { data, error } = await sb
    .from("frandoor_blog_schedules")
    .select("*")
    .order("scheduled_at", { ascending: false })
    .limit(50);

  const rows = (error ? [] : (data ?? [])) as ScheduleRow[];

  return (
    <div className="space-y-6 max-w-5xl">
      <div className="rounded-xl border border-slate-200 bg-white p-6">
        <h2 className="text-sm font-semibold text-slate-800 mb-1">예약 발행 등록</h2>
        <p className="text-xs text-slate-500 mb-4">
          업종 + 토픽 + 발행 시각을 등록하면 cron 이 자동으로 본문·썸네일 생성 후 frandoor.co.kr 에 즉시 발행합니다.
        </p>
        <SchedulerForm />
        <div className="mt-4 text-[11px] text-slate-400 space-y-0.5">
          <p>⏰ cron 은 매시 0분에 실행됩니다. 14:30 으로 예약해도 15:00 실행 (최대 59분 지연).</p>
          <p>🔁 실패 시 다음 시간에 1회 자동 재시도.</p>
          <p>🚀 즉시 발행 — 생성 후 frandoor.co.kr 에 곧바로 git push.</p>
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
