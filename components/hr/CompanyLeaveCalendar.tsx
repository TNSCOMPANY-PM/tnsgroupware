"use client";

import { useState, useMemo, useId, useEffect } from "react";
import { Button } from "@/components/ui/button";
import {
  ChevronLeft,
  ChevronRight,
  CalendarDays,
} from "lucide-react";
import {
  format,
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
  addDays,
  addMonths,
  subMonths,
  isSameMonth,
  isToday,
  parseISO,
} from "date-fns";
import { ko } from "date-fns/locale";
import {
  CALENDAR_LEAVE_EVENTS,
  type CalendarLeaveEvent,
} from "@/constants/leaveSchedule";
import { usePlannedLeaves } from "@/contexts/PlannedLeavesContext";
import { getLeaveTypeLabel } from "@/constants/leaveTypes";
import { cn } from "@/lib/utils";
import { isHoliday, getHolidayName } from "@/utils/ganttUtils";

const LEAVE_TYPE_BADGE: Record<
  string,
  { bg: string; text: string }
> = {
  annual: { bg: "bg-blue-100", text: "text-blue-800" },
  half_am: { bg: "bg-emerald-100", text: "text-emerald-800" },
  half_pm: { bg: "bg-teal-100", text: "text-teal-800" },
  quarter_am: { bg: "bg-cyan-100", text: "text-cyan-800" },
  quarter_pm: { bg: "bg-sky-100", text: "text-sky-800" },
  hourly: { bg: "bg-indigo-100", text: "text-indigo-800" },
  military: { bg: "bg-amber-100", text: "text-amber-800" },
  spouse_birth: { bg: "bg-pink-100", text: "text-pink-800" },
  family_care: { bg: "bg-rose-100", text: "text-rose-800" },
  menstrual: { bg: "bg-fuchsia-100", text: "text-fuchsia-800" },
  marriage_self: { bg: "bg-violet-100", text: "text-violet-800" },
  condolence_close: { bg: "bg-slate-200", text: "text-slate-800" },
  condolence_extended: { bg: "bg-slate-100", text: "text-slate-700" },
};

function getLeaveTypeDisplay(type: string): string {
  if (type === "half_am") return "오전반차";
  if (type === "half_pm") return "오후반차";
  if (type === "quarter_am") return "반반차(09~11시)";
  if (type === "quarter_pm") return "반반차(16~18시)";
  if (type === "hourly") return "시간차";
  return getLeaveTypeLabel(type as never);
}

function getBadgeStyle(type: string) {
  return LEAVE_TYPE_BADGE[type] ?? {
    bg: "bg-gray-100",
    text: "text-gray-800",
  };
}

function getEventsForDate(
  events: CalendarLeaveEvent[],
  date: Date
): CalendarLeaveEvent[] {
  const dateStr = format(date, "yyyy-MM-dd");
  return events.filter((e) => {
    const start = parseISO(e.startDate);
    const end = parseISO(e.endDate);
    const d = parseISO(dateStr);
    return d >= start && d <= end;
  });
}

const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"];

/** 직원 이름 → 퍼스널컬러(hex) 맵 */
function hexToRgba(hex: string, alpha = 0.18) {
  const h = hex.replace("#", "");
  const r = parseInt(h.substring(0, 2), 16);
  const g = parseInt(h.substring(2, 4), 16);
  const b = parseInt(h.substring(4, 6), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

export function CompanyLeaveCalendar() {
  const [currentDate, setCurrentDate] = useState(new Date());
  const { plannedEvents } = usePlannedLeaves();
  const allEvents = useMemo(
    () => [...CALENDAR_LEAVE_EVENTS, ...plannedEvents],
    [plannedEvents]
  );

  /** 퍼스널컬러 맵 fetch */
  const [personalColors, setPersonalColors] = useState<Record<string, string>>({});
  useEffect(() => {
    fetch("/api/employees")
      .then((r) => r.json())
      .then((rows: { name?: string; personal_color?: string | null }[]) => {
        if (!Array.isArray(rows)) return;
        const map: Record<string, string> = {};
        rows.forEach((e) => {
          if (e.name && e.personal_color) map[e.name] = e.personal_color;
        });
        setPersonalColors(map);
      })
      .catch(() => {});
  }, []);

  const monthStart = startOfMonth(currentDate);
  const monthEnd = endOfMonth(currentDate);
  const calStart = startOfWeek(monthStart, { weekStartsOn: 0 });
  const calEnd = endOfWeek(monthEnd, { weekStartsOn: 0 });

  const days = useMemo(() => {
    const result: Date[] = [];
    let d = calStart;
    while (d <= calEnd) {
      result.push(d);
      d = addDays(d, 1);
    }
    return result;
  }, [calStart, calEnd]);

  const goPrev = () => setCurrentDate((d) => subMonths(d, 1));
  const goNext = () => setCurrentDate((d) => addMonths(d, 1));
  const goToday = () => setCurrentDate(new Date());

  return (
    <div className="overflow-hidden rounded-xl border border-[var(--border)] bg-white shadow-sm">
      {/* 헤더: 1달 단위 네비 */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-[var(--border)] bg-[var(--muted)]/30 px-4 py-3">
        <h3 className="flex items-center gap-2 text-lg font-bold text-[var(--foreground)]">
          <CalendarDays className="size-5" />
          전사 연차 캘린더
        </h3>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={goPrev}>
            <ChevronLeft className="size-4" />
            이전 달
          </Button>
          <span className="min-w-[140px] text-center text-sm font-semibold">
            {format(currentDate, "yyyy년 M월", { locale: ko })}
          </span>
          <Button variant="outline" size="sm" onClick={goNext}>
            다음 달
            <ChevronRight className="size-4" />
          </Button>
          <Button variant="outline" size="sm" onClick={goToday}>
            오늘
          </Button>
        </div>
      </div>

      {/* 요일 헤더 */}
      <div className="grid grid-cols-7 border-b border-[var(--border)]">
        {WEEKDAYS.map((day, i) => (
          <div
            key={day}
            className={cn(
              "px-2 py-2 text-center text-xs font-medium",
              i === 0 && "text-rose-500",
              i === 6 && "text-blue-500",
              i > 0 && i < 6 && "text-[var(--muted-foreground)]"
            )}
          >
            {day}
          </div>
        ))}
      </div>

      {/* 날짜 그리드 (1달) */}
      <div className="grid grid-cols-7">
        {days.map((day) => {
          const dayEvents = getEventsForDate(allEvents, day);
          const dayOfWeek = day.getDay();
          const isSaturday = dayOfWeek === 6;
          const isSunday = dayOfWeek === 0;
          const isPublicHoliday = isHoliday(day);
          const isSunOrHoliday = isSunday || isPublicHoliday;
          const isCurrentMonth = isSameMonth(day, currentDate);
          const holidayName = getHolidayName(day);
          const useSaturdayStyle = isSaturday;
          const useRedStyle = isSunOrHoliday && !useSaturdayStyle;

          return (
            <div
              key={day.toISOString()}
              className={cn(
                "min-h-[100px] border-b border-r border-[var(--border)] p-1.5 last:border-r-0",
                isCurrentMonth && useSaturdayStyle && "bg-blue-50",
                isCurrentMonth && useRedStyle && "bg-red-50",
                !isCurrentMonth && "bg-[var(--muted)]/10"
              )}
            >
              <span
                className={cn(
                  "inline-block size-7 rounded-full text-center text-sm font-medium leading-7",
                  isToday(day) && "bg-[var(--primary)] text-white",
                  !isToday(day) &&
                    isCurrentMonth &&
                    (useRedStyle ? "text-red-600" : useSaturdayStyle ? "text-blue-600" : "text-[var(--foreground)]"),
                  !isCurrentMonth && "text-[var(--muted-foreground)]/60"
                )}
              >
                {format(day, "d")}
              </span>
              {isCurrentMonth && holidayName && (
                <div
                  className={cn(
                    "mt-0.5 truncate text-[10px] font-medium",
                    useRedStyle && "text-red-600",
                    useSaturdayStyle && "text-blue-600"
                  )}
                  title={holidayName}
                >
                  {holidayName}
                </div>
              )}

              <div className="mt-1 space-y-0.5">
                {dayEvents.slice(0, 2).map((ev) => {
                  const pc = personalColors[ev.userName];
                  const style = getBadgeStyle(ev.leaveType);
                  return (
                    <div
                      key={ev.id}
                      className={cn(
                        "truncate rounded px-1.5 py-0.5 text-xs font-medium",
                        !pc && style.bg,
                        !pc && style.text
                      )}
                      style={
                        pc
                          ? {
                              backgroundColor: hexToRgba(pc, 0.2),
                              color: pc,
                              borderLeft: `3px solid ${pc}`,
                            }
                          : undefined
                      }
                      title={`${ev.userName} (${getLeaveTypeDisplay(ev.leaveType)})`}
                    >
                      {ev.userName}({getLeaveTypeDisplay(ev.leaveType)})
                    </div>
                  );
                })}
                {dayEvents.length > 2 && (
                  <DayOverflowBadge
                    count={dayEvents.length - 2}
                    events={dayEvents.slice(2)}
                    personalColors={personalColors}
                  />
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function DayOverflowBadge({
  count,
  events,
  personalColors = {},
}: {
  count: number;
  events: CalendarLeaveEvent[];
  personalColors?: Record<string, string>;
}) {
  const [open, setOpen] = useState(false);
  const id = useId();

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={cn(
          "w-full truncate rounded px-1.5 py-0.5 text-left text-xs font-medium transition-all duration-200 ease-in-out",
          "bg-[var(--muted)] text-[var(--muted-foreground)] hover:bg-[var(--muted)]/80 hover:opacity-90 active:scale-[0.97]"
        )}
      >
        +{count}명 더보기
      </button>
      {open && (
        <>
          <div
            className="fixed inset-0 z-40"
            aria-hidden
            onClick={() => setOpen(false)}
          />
          <div
            id={id}
            role="dialog"
            aria-label="휴가자 전체 명단"
            className="absolute left-0 top-full z-50 mt-1 min-w-[200px] rounded-lg border border-[var(--border)] bg-white p-2 shadow-lg dropdown-enter"
          >
            {events.map((ev) => {
              const pc = personalColors[ev.userName];
              const style = getBadgeStyle(ev.leaveType);
              return (
                <div
                  key={ev.id}
                  className={cn(
                    "mb-1 rounded px-2 py-1 text-xs font-medium last:mb-0",
                    !pc && style.bg,
                    !pc && style.text
                  )}
                  style={
                    pc
                      ? {
                          backgroundColor: hexToRgba(pc, 0.2),
                          color: pc,
                          borderLeft: `3px solid ${pc}`,
                        }
                      : undefined
                  }
                >
                  {ev.userName} ({getLeaveTypeDisplay(ev.leaveType)})
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
