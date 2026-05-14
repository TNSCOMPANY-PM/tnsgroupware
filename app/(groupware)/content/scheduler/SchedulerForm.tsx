"use client";

import { useEffect, useMemo, useState } from "react";
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

type GeoBrand = { id: string; name: string; ftc_brand_id: string | null };
type Mode = "a_only" | "a_plus_c";

function defaultScheduledAt(): string {
  const d = new Date(Date.now() + 60 * 60 * 1000);
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
  const [mode, setMode] = useState<Mode>("a_only");
  const [industry, setIndustry] = useState<string>("");
  const [topic, setTopic] = useState<string>("");
  const [scheduledAt, setScheduledAt] = useState<string>(defaultScheduledAt());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>("");

  const [brandQuery, setBrandQuery] = useState<string>("");
  const [brandResults, setBrandResults] = useState<GeoBrand[]>([]);
  const [selectedBrand, setSelectedBrand] = useState<GeoBrand | null>(null);

  const minDt = useMemo(() => {
    const d = new Date();
    const kst = new Date(d.toLocaleString("en-US", { timeZone: "Asia/Seoul" }));
    return kst.toISOString().slice(0, 16);
  }, []);

  useEffect(() => {
    if (mode !== "a_plus_c") return;
    if (selectedBrand) return;
    if (!brandQuery.trim()) {
      setBrandResults([]);
      return;
    }
    const t = setTimeout(async () => {
      try {
        const res = await fetch(
          `/api/geo/brands-search?q=${encodeURIComponent(brandQuery)}&limit=20`,
        );
        if (res.ok) {
          const data = await res.json();
          setBrandResults(Array.isArray(data) ? data : []);
        } else {
          setBrandResults([]);
        }
      } catch {
        setBrandResults([]);
      }
    }, 200);
    return () => clearTimeout(t);
  }, [brandQuery, mode, selectedBrand]);

  const switchMode = (next: Mode) => {
    setMode(next);
    setError("");
    if (next === "a_only") {
      setSelectedBrand(null);
      setBrandQuery("");
      setBrandResults([]);
    } else {
      setIndustry("");
    }
  };

  const canSubmit =
    !busy &&
    scheduledAt &&
    (mode === "a_only" ? !!industry : !!selectedBrand);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;
    setError("");
    setBusy(true);
    try {
      const body: Record<string, unknown> = {
        mode,
        topic: topic.trim() || undefined,
        scheduled_at: scheduledAt,
      };
      if (mode === "a_only") body.industry = industry;
      else body.brand_id = selectedBrand!.id;

      const res = await fetch("/api/geo/scheduler/schedules", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message ?? data.error ?? `등록 실패 (${res.status})`);
      setIndustry("");
      setSelectedBrand(null);
      setBrandQuery("");
      setBrandResults([]);
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
    <form onSubmit={onSubmit} className="space-y-3">
      <div className="flex gap-2 text-sm">
        <button
          type="button"
          onClick={() => switchMode("a_only")}
          disabled={busy}
          className={`px-3 py-1.5 rounded-lg border ${
            mode === "a_only"
              ? "bg-violet-600 text-white border-violet-600"
              : "bg-white text-slate-700 border-slate-200 hover:bg-slate-50"
          } disabled:opacity-50`}
        >
          A only (업종 분석)
        </button>
        <button
          type="button"
          onClick={() => switchMode("a_plus_c")}
          disabled={busy}
          className={`px-3 py-1.5 rounded-lg border ${
            mode === "a_plus_c"
              ? "bg-violet-600 text-white border-violet-600"
              : "bg-white text-slate-700 border-slate-200 hover:bg-slate-50"
          } disabled:opacity-50`}
        >
          A+C (브랜드 분석)
        </button>
      </div>

      <div className="grid gap-3 sm:grid-cols-[1fr_2fr_1.4fr_auto]">
        {mode === "a_only" ? (
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
        ) : (
          <div className="relative">
            <input
              type="text"
              value={selectedBrand ? selectedBrand.name : brandQuery}
              onChange={(e) => {
                setSelectedBrand(null);
                setBrandQuery(e.target.value);
              }}
              disabled={busy}
              placeholder="브랜드 검색"
              className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-violet-500 disabled:bg-slate-50"
            />
            {!selectedBrand && brandResults.length > 0 && (
              <ul className="absolute z-10 mt-1 w-full max-h-60 overflow-auto bg-white border border-slate-200 rounded-lg shadow-sm text-sm">
                {brandResults.map((b) => (
                  <li key={b.id}>
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedBrand(b);
                        setBrandQuery(b.name);
                        setBrandResults([]);
                      }}
                      className="block w-full text-left px-3 py-1.5 hover:bg-slate-50"
                    >
                      {b.name}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        <input
          type="text"
          value={topic}
          onChange={(e) => setTopic(e.target.value)}
          disabled={busy}
          placeholder={
            mode === "a_only"
              ? '토픽 (비우면 "{업종} 업종 분포 분석" 자동)'
              : "토픽 (비우면 브랜드 기본 토픽)"
          }
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
          disabled={!canSubmit}
          className="px-4 py-2 rounded-lg bg-violet-600 text-white text-sm font-medium hover:bg-violet-700 disabled:opacity-50 whitespace-nowrap"
        >
          {busy ? "등록 중..." : "예약 추가"}
        </button>
      </div>

      {error && (
        <p className="text-xs text-rose-600 whitespace-pre-wrap">{error}</p>
      )}
    </form>
  );
}
