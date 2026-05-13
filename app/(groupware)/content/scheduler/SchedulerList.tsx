"use client";

import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import type { ScheduleRow } from "./page";

// v5-03: 새 status (generating / ready / publishing) 추가. running 은 v5-01 호환.
const STATUS_LABEL: Record<string, string> = {
  pending: "대기 중",
  generating: "생성 중...",
  ready: "준비 완료",
  publishing: "발행 중...",
  running: "실행 중",
  published: "발행 완료",
  failed: "실패",
  canceled: "취소됨",
};

const STATUS_STYLE: Record<string, string> = {
  pending: "bg-slate-100 text-slate-600",
  generating: "bg-blue-100 text-blue-700 animate-pulse",
  ready: "bg-emerald-100 text-emerald-700",
  publishing: "bg-blue-100 text-blue-700 animate-pulse",
  running: "bg-blue-100 text-blue-700 animate-pulse",
  published: "bg-emerald-100 text-emerald-700",
  failed: "bg-rose-100 text-rose-700",
  canceled: "bg-slate-100 text-slate-400",
};

// v5-03: 활성 상태 — 폴링 트리거. ready 는 시각 도래까지 정적이라 폴링 X.
const ACTIVE_STATUSES = new Set(["pending", "generating", "publishing", "running"]);

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

  // v5-03: 활성 상태 row 가 있으면 5초마다 router.refresh — server 컴포넌트 재조회.
  useEffect(() => {
    setRows(initialRows);
  }, [initialRows]);

  useEffect(() => {
    const hasActive = rows.some((r) => ACTIVE_STATUSES.has(r.status));
    if (!hasActive) return;
    const t = setInterval(() => {
      router.refresh();
    }, 5000);
    return () => clearInterval(t);
  }, [rows, router]);

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

  // v5-07: 예약 시각 수정 (published 외 모든 status).
  const callReschedule = async (id: string, currentScheduledAt: string) => {
    // datetime-local 형식 prefill ("YYYY-MM-DDTHH:MM", KST 변환)
    const d = new Date(currentScheduledAt);
    const kst = new Date(d.toLocaleString("en-US", { timeZone: "Asia/Seoul" }));
    const yyyy = kst.getFullYear();
    const mm = String(kst.getMonth() + 1).padStart(2, "0");
    const dd = String(kst.getDate()).padStart(2, "0");
    const hh = String(kst.getHours()).padStart(2, "0");
    const mi = String(kst.getMinutes()).padStart(2, "0");
    const defaultValue = `${yyyy}-${mm}-${dd}T${hh}:${mi}`;

    const input = window.prompt("새 예약 시각 (YYYY-MM-DDTHH:MM, KST):", defaultValue);
    if (!input) return;
    if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(input.trim())) {
      alert("형식 오류 — 예: 2026-05-14T15:00");
      return;
    }

    try {
      const res = await fetch(`/api/geo/scheduler/schedules/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "reschedule", scheduled_at: input.trim() }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.message ?? data.error ?? `수정 실패 (${res.status})`);
      }
      setRows((prev) => prev.map((r) => (r.id === id ? (data as ScheduleRow) : r)));
      startTransition(() => router.refresh());
    } catch (e) {
      alert(e instanceof Error ? e.message : String(e));
    }
  };

  // v5-05: schedule row 영구 삭제 (모든 status). draft 본문은 별도 보존.
  const callDelete = async (id: string) => {
    if (
      !confirm(
        "이 예약을 영구 삭제합니다. 작성된 draft 본문은 발행 관리 탭에 그대로 남고, 이미 발행된 글의 frandoor.co.kr 페이지도 영향 없습니다. 진행할까요?",
      )
    ) {
      return;
    }
    try {
      const res = await fetch(`/api/geo/scheduler/schedules/${id}`, {
        method: "DELETE",
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.message ?? data.error ?? `삭제 실패 (${res.status})`);
      }
      setRows((prev) => prev.filter((r) => r.id !== id));
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
                      {r.status === "ready" ? "미리보기 ↗" : "draft 보기 ↗"}
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
                  {/* v5-07: published 외 모든 status row 에 시각 수정 버튼 */}
                  {r.status !== "published" && (
                    <button
                      onClick={() => callReschedule(r.id, r.scheduled_at)}
                      disabled={pending}
                      className="text-[10px] px-2 py-0.5 rounded border border-slate-300 text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                    >
                      시각 수정
                    </button>
                  )}
                  {/* v5-05: 모든 status row 에 삭제 버튼 */}
                  <button
                    onClick={() => callDelete(r.id)}
                    disabled={pending}
                    className="text-[10px] px-2 py-0.5 rounded border border-rose-300 text-rose-600 hover:bg-rose-50 disabled:opacity-50"
                  >
                    삭제
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
