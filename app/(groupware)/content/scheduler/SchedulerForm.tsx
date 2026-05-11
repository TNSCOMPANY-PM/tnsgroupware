"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";

const INDUSTRIES = [
  "한식",
  "분식",
  "중식",
  "일식",
  "서양식",
  "기타외국식",
  "패스트푸드",
  "치킨",
  "피자",
  "제과제빵",
  "아이스크림빙수",
  "커피",
  "음료(커피외)",
  "주점",
  "기타외식",
] as const;

/** 현재 시각 + 1시간 → datetime-local 입력값 ("YYYY-MM-DDTHH:MM", KST). */
function defaultScheduledAt(): string {
  const d = new Date(Date.now() + 60 * 60 * 1000);
  // KST 변환 후 시계 분 → 00 으로 정렬 (cron 매시 0분 정렬).
  const kst = new Date(d.toLocaleString("en-US", { timeZone: "Asia/Seoul" }));
  kst.setMinutes(0, 0, 0);
  const yyyy = kst.getFullYear();
  const mm = String(kst.getMonth() + 1).padStart(2, "0");
  const dd = String(kst.getDate()).padStart(2, "0");
  const hh = String(kst.getHours()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}T${hh}:00`;
}

export default function SchedulerForm() {
  const router = useRouter();
  const [industry, setIndustry] = useState<string>("");
  const [topic, setTopic] = useState<string>("");
  const [scheduledAt, setScheduledAt] = useState<string>(defaultScheduledAt());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>("");

  const minDt = useMemo(() => {
    const d = new Date();
    const kst = new Date(d.toLocaleString("en-US", { timeZone: "Asia/Seoul" }));
    return kst.toISOString().slice(0, 16);
  }, []);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!industry || !scheduledAt) return;
    setError("");
    setBusy(true);
    try {
      const res = await fetch("/api/geo/scheduler/schedules", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          industry,
          topic: topic.trim() || undefined,
          scheduled_at: scheduledAt,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message ?? data.error ?? `등록 실패 (${res.status})`);
      setIndustry("");
      setTopic("");
      setScheduledAt(defaultScheduledAt());
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={onSubmit} className="grid gap-3 sm:grid-cols-[1fr_2fr_1.4fr_auto]">
      <select
        value={industry}
        onChange={(e) => setIndustry(e.target.value)}
        disabled={busy}
        className="px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-violet-500 disabled:bg-slate-50"
        required
      >
        <option value="">— 업종 선택 —</option>
        {INDUSTRIES.map((ind) => (
          <option key={ind} value={ind}>
            {ind}
          </option>
        ))}
      </select>

      <input
        type="text"
        value={topic}
        onChange={(e) => setTopic(e.target.value)}
        disabled={busy}
        placeholder='토픽 (비우면 "{업종} 업종 분포 분석" 자동)'
        className="px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-violet-500 disabled:bg-slate-50"
      />

      <input
        type="datetime-local"
        value={scheduledAt}
        min={minDt}
        onChange={(e) => setScheduledAt(e.target.value)}
        disabled={busy}
        className="px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-violet-500 disabled:bg-slate-50"
        required
      />

      <button
        type="submit"
        disabled={busy || !industry || !scheduledAt}
        className="px-4 py-2 rounded-lg bg-violet-600 text-white text-sm font-medium hover:bg-violet-700 disabled:opacity-50 whitespace-nowrap"
      >
        {busy ? "등록 중..." : "예약 추가"}
      </button>

      {error && (
        <p className="sm:col-span-4 text-xs text-rose-600 whitespace-pre-wrap">{error}</p>
      )}
    </form>
  );
}
