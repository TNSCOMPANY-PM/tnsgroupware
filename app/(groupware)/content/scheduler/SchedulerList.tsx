"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import type { ScheduleRow } from "./page";

const STATUS_LABEL: Record<string, string> = {
  pending: "대기",
  running: "실행 중",
  published: "발행됨",
  failed: "실패",
  canceled: "취소됨",
};

const STATUS_STYLE: Record<string, string> = {
  pending: "bg-slate-100 text-slate-600",
  running: "bg-blue-100 text-blue-700 animate-pulse",
  published: "bg-emerald-100 text-emerald-700",
  failed: "bg-rose-100 text-rose-700",
  canceled: "bg-slate-100 text-slate-400",
};

function formatKst(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString("ko-KR", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

export default function SchedulerList({ initialRows }: { initialRows: ScheduleRow[] }) {
  const [rows, setRows] = useState<ScheduleRow[]>(initialRows);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  const callAction = async (id: string, action: "cancel" | "retry" | "run_now") => {
    if (action === "cancel" && !confirm("예약을 취소할까요?")) return;
    try {
      const res = await fetch(`/api/geo/scheduler/schedules/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message ?? data.error ?? `실패 (${res.status})`);
      setRows((prev) => prev.map((r) => (r.id === id ? (data as ScheduleRow) : r)));
      startTransition(() => router.refresh());
    } catch (e) {
      alert(e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead className="text-slate-500">
          <tr className="border-b border-slate-200">
            <th className="text-left py-2 pr-3 font-medium">업종</th>
            <th className="text-left py-2 pr-3 font-medium">토픽</th>
            <th className="text-left py-2 pr-3 font-medium">예약 시각 (KST)</th>
            <th className="text-left py-2 pr-3 font-medium">상태</th>
            <th className="text-left py-2 pr-3 font-medium">draft / 발행</th>
            <th className="text-left py-2 pr-3 font-medium">액션</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const statusLabel = STATUS_LABEL[r.status] ?? r.status;
            const statusStyle = STATUS_STYLE[r.status] ?? "bg-slate-100 text-slate-600";
            const isCanceled = r.status === "canceled";
            return (
              <tr key={r.id} className="border-b border-slate-100">
                <td className="py-2 pr-3 font-medium text-slate-700">{r.industry}</td>
                <td className="py-2 pr-3 text-slate-600">
                  {r.topic ? r.topic : <span className="text-slate-400">기본 토픽</span>}
                </td>
                <td className="py-2 pr-3 text-slate-600 whitespace-nowrap">{formatKst(r.scheduled_at)}</td>
                <td className="py-2 pr-3">
                  <span className={cn("inline-block px-2 py-0.5 rounded text-[10px]", statusStyle)}>
                    {statusLabel}
                  </span>
                  {r.retry_count != null && r.retry_count > 0 && (
                    <span className="ml-1 text-[10px] text-slate-400">재시도 {r.retry_count}</span>
                  )}
                  {r.error_msg && r.status === "failed" && (
                    <p className="mt-1 text-[10px] text-rose-600 truncate max-w-[200px]" title={r.error_msg}>
                      {r.error_msg}
                    </p>
                  )}
                </td>
                <td className="py-2 pr-3 space-y-0.5">
                  {r.draft_id && (
                    <Link
                      href={`/content/posts/${r.draft_id}`}
                      className="block text-blue-600 hover:underline"
                    >
                      draft 보기 ↗
                    </Link>
                  )}
                  {r.published_url && (
                    <a
                      href={r.published_url}
                      target="_blank"
                      rel="noreferrer"
                      className="block text-emerald-600 hover:underline"
                    >
                      frandoor.co.kr ↗
                    </a>
                  )}
                  {!r.draft_id && !r.published_url && (
                    <span className="text-slate-400">—</span>
                  )}
                </td>
                <td className="py-2 pr-3 space-x-1">
                  {r.status === "pending" && (
                    <>
                      <button
                        onClick={() => callAction(r.id, "run_now")}
                        disabled={pending}
                        className="text-[10px] px-2 py-0.5 rounded bg-violet-100 text-violet-700 hover:bg-violet-200 disabled:opacity-50"
                      >
                        지금 실행
                      </button>
                      <button
                        onClick={() => callAction(r.id, "cancel")}
                        disabled={pending}
                        className="text-[10px] px-2 py-0.5 rounded bg-slate-100 text-slate-600 hover:bg-slate-200 disabled:opacity-50"
                      >
                        취소
                      </button>
                    </>
                  )}
                  {r.status === "failed" && (
                    <button
                      onClick={() => callAction(r.id, "retry")}
                      disabled={pending}
                      className="text-[10px] px-2 py-0.5 rounded bg-violet-100 text-violet-700 hover:bg-violet-200 disabled:opacity-50"
                    >
                      재시도
                    </button>
                  )}
                  {(r.status === "running" || r.status === "published" || isCanceled) && (
                    <span className="text-slate-400 text-[10px]">—</span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
