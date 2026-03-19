"use client";

import React, { useMemo, useState } from "react";
import { addMonths, differenceInCalendarDays, endOfMonth, format, startOfMonth } from "date-fns";
import { cn } from "@/lib/utils";
import type { GanttTeamId } from "@/constants/gantt";

export type AppleGanttTask = {
  id: string | number;
  name: string;
  team: GanttTeamId;
  /** "Mar 01" 같은 월/일 문자열 또는 "2026-03-01" 같은 ISO 날짜 */
  start: string;
  /** "Apr 05" 같은 월/일 문자열 또는 "2026-04-05" 같은 ISO 날짜 */
  end: string;
  /** 0~100 (임의 진행률) */
  progress: number;
};

type AppleGanttChartProps = {
  data: AppleGanttTask[];
  /** 기본은 현재월 */
  initialMonth?: Date;
  /** 1일당 픽셀 폭 */
  dayWidth?: number;
  /** 왼쪽 고정 열 폭 */
  leftWidthPx?: number;
};

const MONTHS_EN: Record<string, number> = {
  Jan: 0,
  Feb: 1,
  Mar: 2,
  Apr: 3,
  May: 4,
  Jun: 5,
  Jul: 6,
  Aug: 7,
  Sep: 8,
  Oct: 9,
  Nov: 10,
  Dec: 11,
};

const TEAM_COLORS: Record<GanttTeamId, { solid: string; badgeBg: string; badgeBorder: string }> = {
  더널리: { solid: "#007AFF", badgeBg: "#007AFF1A", badgeBorder: "#007AFF33" },
  티제이웹: { solid: "#FF9500", badgeBg: "#FF95001A", badgeBorder: "#FF950033" },
  경영지원: { solid: "#248A3D", badgeBg: "#248A3D1A", badgeBorder: "#248A3D33" },
};

function parseTaskDate(input: string, fallbackYear: number): Date | null {
  const s = input.trim();
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (iso) {
    const [_, y, m, d] = iso;
    const year = Number(y);
    const month = Number(m) - 1;
    const day = Number(d);
    const dt = new Date(year, month, day);
    return Number.isFinite(dt.getTime()) ? dt : null;
  }

  // "Mar 01" / "Apr 5" 형태
  const md = s.match(/^([A-Za-z]{3})\s*(\d{1,2})$/);
  if (md) {
    const [, monStr, dayStr] = md;
    const monKey = monStr[0].toUpperCase() + monStr.slice(1).toLowerCase();
    const monthIndex = MONTHS_EN[monKey];
    const day = Number(dayStr);
    if (monthIndex == null || !Number.isFinite(day)) return null;
    const dt = new Date(fallbackYear, monthIndex, day);
    return Number.isFinite(dt.getTime()) ? dt : null;
  }

  return null;
}

export function AppleGanttChart({
  data,
  initialMonth,
  dayWidth = 32,
  leftWidthPx = 260,
}: AppleGanttChartProps) {
  const [viewMonth, setViewMonth] = useState(() => initialMonth ?? new Date());

  const monthStart = useMemo(() => startOfMonth(viewMonth), [viewMonth]);
  const monthEnd = useMemo(() => endOfMonth(viewMonth), [viewMonth]);

  const yearForFallback = useMemo(() => monthStart.getFullYear(), [monthStart]);
  const totalDays = useMemo(() => differenceInCalendarDays(monthEnd, monthStart) + 1, [monthStart, monthEnd]);
  const timelineWidthPx = totalDays * dayWidth;

  const days = useMemo(() => {
    const out: Date[] = [];
    for (let i = 0; i < totalDays; i++) {
      out.push(new Date(monthStart.getFullYear(), monthStart.getMonth(), monthStart.getDate() + i));
    }
    return out;
  }, [monthStart, totalDays]);

  const todayIndex = useMemo(() => {
    const today = new Date();
    const y = today.getFullYear();
    const m = today.getMonth();
    if (y !== monthStart.getFullYear() || m !== monthStart.getMonth()) return null;
    return today.getDate() - monthStart.getDate();
  }, [monthStart]);

  return (
    <div className="font-sans">
      <div className="rounded-xl border border-slate-200 bg-white/60 backdrop-blur-md shadow-md">
        <div className="flex items-center justify-between gap-3 p-4">
          <div className="flex items-center gap-2 rounded-full bg-slate-50/70 px-3 py-1.5 shadow-sm">
            <button
              type="button"
              onClick={() => setViewMonth((d) => addMonths(d, -1))}
              className="h-8 w-8 rounded-full text-slate-600 hover:bg-slate-100 transition-colors"
              aria-label="이전 달"
            >
              ‹
            </button>
            <div className="px-2 text-sm font-semibold tracking-wide text-slate-900 tabular-nums">
              {format(viewMonth, "yyyy년 M월")}
            </div>
            <button
              type="button"
              onClick={() => setViewMonth((d) => addMonths(d, 1))}
              className="h-8 w-8 rounded-full text-slate-600 hover:bg-slate-100 transition-colors"
              aria-label="다음 달"
            >
              ›
            </button>
          </div>

          <div className="text-xs text-slate-500 leading-relaxed">
            바는 <span className="font-semibold text-slate-700">진행률(%)</span> 기준으로 왼쪽부터 차오릅니다.
          </div>
        </div>

        <div className="overflow-x-auto pb-3">
          <div style={{ minWidth: leftWidthPx + timelineWidthPx }}>
            {/* 헤더 */}
            <div
              className="flex items-stretch sticky top-0 z-20 rounded-t-xl border-t border-slate-200"
              style={{ height: 44 }}
            >
              <div
                className="flex-shrink-0 flex items-center border-r border-slate-200 bg-white/70 backdrop-blur"
                style={{ width: leftWidthPx }}
              >
                <div className="px-4 text-xs font-semibold tracking-wide text-slate-500">작업</div>
              </div>

              <div className="relative flex-shrink-0 flex items-center bg-white/70 backdrop-blur" style={{ width: timelineWidthPx }}>
                {todayIndex != null && (
                  <div
                    className="absolute top-0 bottom-0 w-[2px] bg-blue-500/90"
                    style={{ left: todayIndex * dayWidth }}
                  />
                )}
                {days.map((d, i) => (
                  <div
                    key={i}
                    className="flex-shrink-0 flex items-center justify-center text-[11px] text-slate-500 border-r border-slate-100"
                    style={{ width: dayWidth, minWidth: dayWidth }}
                  >
                    {format(d, "d")}
                  </div>
                ))}
              </div>
            </div>

            {/* 바디 */}
            <div className="divide-y divide-slate-100">
              {data.map((t) => {
                const parsedStart = parseTaskDate(t.start, yearForFallback);
                const parsedEnd = parseTaskDate(t.end, yearForFallback);
                if (!parsedStart || !parsedEnd) return null;

                const effectiveStart = parsedStart < monthStart ? monthStart : parsedStart;
                const effectiveEnd = parsedEnd > monthEnd ? monthEnd : parsedEnd;
                if (effectiveEnd < effectiveStart) return null;

                const startOffsetDays = differenceInCalendarDays(effectiveStart, monthStart);
                const durationDays = differenceInCalendarDays(effectiveEnd, effectiveStart) + 1;
                const leftPx = startOffsetDays * dayWidth;
                const widthPx = durationDays * dayWidth;

                const progress = Math.max(0, Math.min(100, t.progress));
                const fillWidth = `${progress}%`;

                return (
                  <div key={t.id} className="flex items-stretch" style={{ minHeight: 44 }}>
                    <div
                      className="flex-shrink-0 flex items-center border-r border-slate-200 bg-white/60 backdrop-blur px-4"
                      style={{ width: leftWidthPx }}
                    >
                      <div className="flex items-center justify-between gap-3 w-full">
                        <div className="min-w-0">
                          <div className="text-sm font-semibold tracking-wide text-slate-900 truncate leading-relaxed">
                            {t.name}
                          </div>
                          <div
                            className="mt-1 inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-[11px] font-semibold"
                            style={{
                              backgroundColor: TEAM_COLORS[t.team].badgeBg,
                              border: `1px solid ${TEAM_COLORS[t.team].badgeBorder}`,
                              color: TEAM_COLORS[t.team].solid,
                            }}
                          >
                            {t.team}
                          </div>
                        </div>
                        <div className="flex-shrink-0 rounded-full bg-blue-50 text-blue-700 px-2 py-0.5 text-xs font-semibold tabular-nums">
                          {Math.round(progress)}%
                        </div>
                      </div>
                    </div>

                    <div className="relative" style={{ width: timelineWidthPx, minWidth: timelineWidthPx }}>
                      {todayIndex != null && (
                        <div
                          className="absolute top-0 bottom-0 w-[2px] bg-blue-500/90 pointer-events-none"
                          style={{ left: todayIndex * dayWidth }}
                        />
                      )}

                      {/* Track(빈 부분/배경) */}
                      <div
                        className={cn(
                          "absolute top-1/2 -translate-y-1/2 h-5 rounded-full",
                          "shadow-sm",
                          "overflow-hidden"
                        )}
                        style={{ left: leftPx, width: widthPx }}
                        aria-label={`${t.name} gantt bar`}
                        title={`${t.name}\n${format(effectiveStart, "yyyy-MM-dd")} ~ ${format(effectiveEnd, "yyyy-MM-dd")}\n진행률 ${progress}%`}
                      >
                        {/* 빈 트랙(연한 회색) */}
                        <div className="absolute inset-0" style={{ backgroundColor: "#F2F2F7" }} aria-hidden />

                        {/* Progress(차오르는 부분) */}
                        <div
                          className="absolute inset-y-0 left-0 h-full rounded-full shadow-md transition-[width] duration-300"
                          style={{
                            width: fillWidth,
                            minWidth: progress > 0 ? 6 : 0,
                            backgroundColor: TEAM_COLORS[t.team].solid,
                          }}
                        />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

