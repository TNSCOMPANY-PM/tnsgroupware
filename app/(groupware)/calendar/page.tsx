"use client";

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useRouter } from "next/navigation";
import {
  format, startOfMonth, endOfMonth, addDays, addMonths, subMonths,
  isSameMonth, isSameDay, isToday, parseISO, startOfWeek,
} from "date-fns";
import { ko } from "date-fns/locale";
import { ChevronLeft, ChevronRight, Plus, X, Loader2, Eye, CalendarDays, Plane } from "lucide-react";
import { cn } from "@/lib/utils";
import { usePermission } from "@/contexts/PermissionContext";
import { type CalendarLeaveEvent } from "@/constants/leaveSchedule";
import { usePlannedLeaves } from "@/contexts/PlannedLeavesContext";
import { getLeaveTypeLabel } from "@/constants/leaveTypes";

type CalEvent = {
  id: string;
  title: string;
  start_date: string;
  end_date?: string;
  color?: string;
  all_day?: boolean;
  description?: string;
  author_name?: string;
  start_time?: string | null;
  participants?: string[] | null;
};

function getLeaveTypeShort(type: string): string {
  const map: Record<string, string> = {
    annual: "연차", half_am: "오전반차", half_pm: "오후반차",
    quarter_am: "반반차", quarter_pm: "반반차", hourly: "시간차",
    military: "군휴가", spouse_birth: "배우자출산", family_care: "가족돌봄",
    menstrual: "생리휴가", marriage_self: "결혼", condolence_close: "경조",
    condolence_extended: "경조",
  };
  return map[type] ?? getLeaveTypeLabel(type as never);
}

function leaveEventsOnDay(events: CalendarLeaveEvent[], day: Date): CalendarLeaveEvent[] {
  const dateStr = format(day, "yyyy-MM-dd");
  return events.filter((e) => {
    const d = parseISO(dateStr);
    return d >= parseISO(e.startDate) && d <= parseISO(e.endDate);
  });
}

function hexToRgba(hex: string, alpha = 0.18) {
  const h = hex.replace("#", "");
  const r = parseInt(h.substring(0, 2), 16);
  const g = parseInt(h.substring(2, 4), 16);
  const b = parseInt(h.substring(4, 6), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

function getPersonalColorStyle(hex?: string | null): React.CSSProperties | undefined {
  if (!hex) return undefined;
  return { backgroundColor: hexToRgba(hex, 0.2), color: hex, borderLeft: `3px solid ${hex}` };
}

export default function CalendarPage() {
  const router = useRouter();
  const { currentUserName } = usePermission();
  const { plannedEvents } = usePlannedLeaves();
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [events, setEvents] = useState<CalEvent[]>([]);
  const [approvedLeaveEvents, setApprovedLeaveEvents] = useState<CalendarLeaveEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editEvent, setEditEvent] = useState<CalEvent | null>(null);
  const [personalColors, setPersonalColors] = useState<Record<string, string>>({});
  const [employeeNames, setEmployeeNames] = useState<string[]>([]);
  const [showLeave, setShowLeave] = useState(false);
  const [showParticipants, setShowParticipants] = useState(false);
  const [dateAction, setDateAction] = useState<{ date: Date; x: number; y: number } | null>(null);
  const dateActionRef = useRef<HTMLDivElement>(null);

  const allLeaveEvents = useMemo(
    () => [...approvedLeaveEvents, ...plannedEvents],
    [approvedLeaveEvents, plannedEvents]
  );

  const [form, setForm] = useState({
    title: "", start_date: "", end_date: "", description: "", all_day: true, start_time: "", participants: [] as string[],
  });

  const fetchEvents = useCallback(async () => {
    setLoading(true);
    const from = format(startOfMonth(currentMonth), "yyyy-MM-dd");
    const to = format(endOfMonth(currentMonth), "yyyy-MM-dd");
    const res = await fetch(`/api/events?from=${from}&to=${to}`);
    if (res.ok) setEvents(await res.json());
    setLoading(false);
  }, [currentMonth]);

  useEffect(() => {
    fetch("/api/leave-events")
      .then((r) => r.ok ? r.json() : [])
      .then((data) => setApprovedLeaveEvents(Array.isArray(data) ? data : []))
      .catch(() => {});
  }, []);

  useEffect(() => {
    fetch("/api/employees")
      .then((r) => r.ok ? r.json() : [])
      .then((list: { name: string; personal_color?: string | null }[]) => {
        const map: Record<string, string> = {};
        list.forEach((emp) => { if (emp.name && emp.personal_color) map[emp.name] = emp.personal_color; });
        setPersonalColors(map);
        setEmployeeNames(list.map((e) => e.name).filter(Boolean));
      })
      .catch(() => {});
  }, []);

  useEffect(() => { fetchEvents(); }, [fetchEvents]);

  const openAdd = (date: Date) => {
    setEditEvent(null);
    setForm({ title: "", start_date: format(date, "yyyy-MM-dd"), end_date: "", description: "", all_day: true, start_time: "", participants: [] });
    setShowParticipants(false);
    setShowModal(true);
  };

  const handleDayClick = (day: Date, e: React.MouseEvent) => {
    e.stopPropagation();
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    setDateAction({ date: day, x: rect.left, y: rect.bottom + window.scrollY });
  };

  const openEdit = (ev: CalEvent) => {
    setEditEvent(ev);
    setForm({
      title: ev.title,
      start_date: ev.start_date,
      end_date: ev.end_date ?? "",
      description: ev.description ?? "",
      all_day: ev.all_day ?? true,
      start_time: ev.start_time ?? "",
      participants: ev.participants ?? [],
    });
    const hasParticipants = (ev.participants ?? []).length > 0;
    setShowParticipants(hasParticipants);
    setShowModal(true);
  };

  const saveEvent = async () => {
    if (!form.title.trim()) return;
    const payload = {
      title: form.title,
      start_date: form.start_date,
      end_date: form.end_date || null,
      description: form.description || null,
      all_day: form.all_day,
      start_time: form.start_time || null,
      author_name: currentUserName,
      participants: form.participants.length > 0 ? form.participants : null,
    };
    if (editEvent) {
      const res = await fetch(`/api/events/${editEvent.id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload),
      });
      if (res.ok) {
        const updated = await res.json();
        setEvents((p) => p.map((e) => e.id === editEvent.id ? updated : e));
        setShowModal(false);
      } else {
        const err = await res.json().catch(() => ({}));
        alert("저장 실패: " + (err.error ?? res.status));
      }
    } else {
      const res = await fetch("/api/events", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload),
      });
      if (res.ok) {
        const created = await res.json();
        setEvents((p) => [...p, created]);
        setShowModal(false);
      } else {
        const err = await res.json().catch(() => ({}));
        alert("저장 실패: " + (err.error ?? res.status));
      }
    }
  };

  const deleteEvent = async (id: string) => {
    if (!confirm("일정을 삭제할까요?")) return;
    const res = await fetch(`/api/events/${id}`, { method: "DELETE" });
    if (res.ok) {
      setEvents((p) => p.filter((e) => e.id !== id));
      setShowModal(false);
    } else {
      alert("삭제에 실패했습니다.");
    }
  };

  const calDays = useMemo(() => {
    const start = startOfWeek(startOfMonth(currentMonth), { weekStartsOn: 0 });
    return Array.from({ length: 42 }, (_, i) => addDays(start, i));
  }, [currentMonth]);

  const eventsOnDay = (d: Date) => {
    const dateStr = format(d, "yyyy-MM-dd");
    return events
      .filter((e) => {
        if (e.end_date && e.end_date > e.start_date) {
          return dateStr >= e.start_date && dateStr <= e.end_date;
        }
        return isSameDay(parseISO(e.start_date), d);
      })
      .sort((a, b) => (a.start_time ?? "99:99").localeCompare(b.start_time ?? "99:99"));
  };

  const isMultiDayEvent = (ev: CalEvent) => !!(ev.end_date && ev.end_date > ev.start_date);
  const isMultiDayStart = (ev: CalEvent, d: Date) => isMultiDayEvent(ev) && format(d, "yyyy-MM-dd") === ev.start_date;
  const isMultiDayEnd = (ev: CalEvent, d: Date) => isMultiDayEvent(ev) && format(d, "yyyy-MM-dd") === ev.end_date;

  return (
    <div className="flex flex-col gap-5" onClick={() => setDateAction(null)}>
      {/* 헤더 */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">캘린더</h1>
          <p className="mt-0.5 text-sm text-slate-500">팀 일정을 관리하세요</p>
        </div>
        <div className="flex items-center gap-2">
            <button
              type="button"
              onMouseDown={() => setShowLeave(true)}
              onMouseUp={() => setShowLeave(false)}
              onMouseLeave={() => setShowLeave(false)}
              onTouchStart={() => setShowLeave(true)}
              onTouchEnd={() => setShowLeave(false)}
              className={cn(
                "flex items-center gap-1.5 rounded-xl border px-4 py-2 text-sm font-semibold transition-all select-none",
                showLeave
                  ? "border-emerald-400 bg-emerald-50 text-emerald-700 shadow-inner"
                  : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
              )}
            >
              <Eye className="size-4" /> 연차보기
            </button>
            <button
              type="button"
              onClick={() => openAdd(new Date())}
              className="flex items-center gap-1.5 rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 transition-colors"
            >
              <Plus className="size-4" /> 일정 추가
            </button>
          </div>
      </div>

      {/* 월 내비게이션 */}
      <>
          <div className="flex items-center gap-2">
            <button type="button" onClick={() => setCurrentMonth(subMonths(currentMonth, 1))}
              className="flex size-8 items-center justify-center rounded-lg border border-slate-200 hover:bg-slate-100 transition-colors">
              <ChevronLeft className="size-4" />
            </button>
            <span className="min-w-[9rem] text-center text-lg font-bold text-slate-800">
              {format(currentMonth, "yyyy년 M월", { locale: ko })}
            </span>
            <button type="button" onClick={() => setCurrentMonth(addMonths(currentMonth, 1))}
              className="flex size-8 items-center justify-center rounded-lg border border-slate-200 hover:bg-slate-100 transition-colors">
              <ChevronRight className="size-4" />
            </button>
            <button type="button" onClick={() => setCurrentMonth(new Date())}
              className="ml-2 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-100 transition-colors">
              오늘
            </button>
          </div>

          {/* 캘린더 그리드 */}
          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="grid grid-cols-7 border-b border-slate-100 bg-slate-50">
              {["일", "월", "화", "수", "목", "금", "토"].map((d, i) => (
                <div key={d} className={cn("py-2.5 text-center text-xs font-semibold",
                  i === 0 ? "text-rose-500" : i === 6 ? "text-blue-500" : "text-slate-500")}>
                  {d}
                </div>
              ))}
            </div>

            {loading ? (
              <div className="flex items-center justify-center py-24">
                <Loader2 className="size-6 animate-spin text-slate-400" />
              </div>
            ) : (
              <div className="grid grid-cols-7">
                {calDays.map((day, i) => {
                  const dayEvents = eventsOnDay(day);
                  const isCurrentMonth = isSameMonth(day, currentMonth);
                  const isTodayDate = isToday(day);
                  const isSun = i % 7 === 0;
                  const isSat = i % 7 === 6;
                  return (
                    <div
                      key={day.toISOString()}
                      className={cn(
                        "relative min-h-[100px] border-b border-r border-slate-100 p-1.5 cursor-pointer transition-colors hover:bg-slate-50",
                        !isCurrentMonth && "bg-slate-50/50"
                      )}
                      onClick={(e) => handleDayClick(day, e)}
                    >
                      <div className={cn(
                        "mb-1 flex size-7 items-center justify-center rounded-full text-sm font-medium",
                        isTodayDate ? "bg-blue-600 text-white font-bold" :
                        !isCurrentMonth ? "text-slate-300" :
                        isSun ? "text-rose-500" :
                        isSat ? "text-blue-500" :
                        "text-slate-700"
                      )}>
                        {format(day, "d")}
                      </div>
                      <div className="space-y-0.5">
                        {dayEvents.slice(0, 3).map((ev) => {
                          const pc = ev.author_name ? personalColors[ev.author_name] : undefined;
                          const timeParts = ev.start_time ? ev.start_time.slice(0, 5).split(":") : null;
                          const timeLabel = timeParts ? (timeParts[1] === "00" ? `${timeParts[0]}시` : `${timeParts[0]}시${timeParts[1]}분`) : null;
                          const multiDay = isMultiDayEvent(ev);
                          const isStart = isMultiDayStart(ev, day);
                          const isEnd = isMultiDayEnd(ev, day);
                          const isMid = multiDay && !isStart && !isEnd;
                          return (
                            <div
                              key={ev.id}
                              className={cn(
                                "truncate py-0.5 text-[11px] font-medium cursor-pointer hover:opacity-80",
                                multiDay ? (
                                  isStart ? "rounded-l px-1.5 -mx-1.5 mr-0" :
                                  isEnd ? "rounded-r px-1.5 mx-0 -mr-1.5" :
                                  isMid ? "px-0.5 -mx-1.5" : "rounded px-1.5"
                                ) : "rounded px-1.5",
                                !pc && "bg-blue-100 text-blue-700"
                              )}
                              style={getPersonalColorStyle(pc)}
                              onClick={(e) => { e.stopPropagation(); openEdit(ev); }}
                            >
                              {(isStart || !multiDay) && (
                                <>{timeLabel && <span className="mr-0.5 opacity-70">{timeLabel}</span>}{ev.title}</>
                              )}
                              {isMid && <span className="opacity-0 select-none">·</span>}
                            </div>
                          );
                        })}
                        {dayEvents.length > 3 && (
                          <div className="px-1 text-[10px] text-slate-400">+{dayEvents.length - 3}개</div>
                        )}
                      </div>

                      {/* 연차 오버레이 (누르고 있는 동안) — 날짜 숫자 아래부터만 덮음 */}
                      {showLeave && isCurrentMonth && (() => {
                        const lvEvents = leaveEventsOnDay(allLeaveEvents, day);
                        if (!lvEvents.length) return null;
                        return (
                          <div className="absolute inset-x-0 bottom-0 top-9 z-10 flex flex-col gap-0.5 overflow-hidden rounded-b-[inherit] bg-white/75 px-1.5 py-1 backdrop-blur-[2px] pointer-events-none">
                            {lvEvents.map((lv) => {
                              const pc = personalColors[lv.userName];
                              return (
                                <div
                                  key={lv.id}
                                  className="truncate rounded px-1.5 py-0.5 text-[10px] font-semibold"
                                  style={
                                    pc
                                      ? { backgroundColor: hexToRgba(pc, 0.3), color: pc, borderLeft: `3px solid ${pc}` }
                                      : { backgroundColor: "rgba(16,185,129,0.18)", color: "#059669", borderLeft: "3px solid #059669" }
                                  }
                                >
                                  {lv.userName} {getLeaveTypeShort(lv.leaveType)}
                                </div>
                              );
                            })}
                          </div>
                        );
                      })()}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
      </>

      {/* 일정 추가/수정 모달 */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={() => setShowModal(false)}>
          <div className="w-full max-w-md overflow-hidden rounded-2xl bg-white shadow-2xl" onClick={(e) => e.stopPropagation()}>
            {editEvent?.author_name && personalColors[editEvent.author_name] && (
              <div className="h-1.5 w-full" style={{ backgroundColor: personalColors[editEvent.author_name] }} />
            )}
            <div className="p-6">
              <div className="mb-4 flex items-center justify-between">
                <div>
                  <h2 className="text-lg font-bold text-slate-900">{editEvent ? "일정 수정" : "일정 추가"}</h2>
                  {editEvent?.author_name && (
                    <div className="mt-0.5 flex items-center gap-1.5">
                      {personalColors[editEvent.author_name] && (
                        <div className="size-2.5 rounded-full" style={{ backgroundColor: personalColors[editEvent.author_name] }} />
                      )}
                      <span className="text-xs text-slate-400">{editEvent.author_name}</span>
                    </div>
                  )}
                </div>
                <button type="button" onClick={() => setShowModal(false)} className="text-slate-400 hover:text-slate-700">
                  <X className="size-5" />
                </button>
              </div>
              <div className="space-y-3">
                <div>
                  <label className="text-xs font-medium text-slate-600">제목 *</label>
                  <input
                    className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-blue-400 focus:outline-none"
                    value={form.title}
                    onChange={(e) => setForm({ ...form, title: e.target.value })}
                    placeholder="일정 제목"
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-medium text-slate-600">시작일</label>
                    <input type="date"
                      className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-blue-400 focus:outline-none"
                      value={form.start_date}
                      onChange={(e) => setForm({ ...form, start_date: e.target.value })}
                    />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-slate-600">시간 (선택)</label>
                    <input type="time"
                      className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-blue-400 focus:outline-none"
                      value={form.start_time}
                      onChange={(e) => setForm({ ...form, start_time: e.target.value })}
                    />
                  </div>
                </div>
                <div>
                  <label className="text-xs font-medium text-slate-600">종료일</label>
                  <input type="date"
                    className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-blue-400 focus:outline-none"
                    value={form.end_date}
                    onChange={(e) => setForm({ ...form, end_date: e.target.value })}
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-slate-600">설명</label>
                  <textarea
                    rows={2}
                    className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-blue-400 focus:outline-none resize-none"
                    value={form.description}
                    onChange={(e) => setForm({ ...form, description: e.target.value })}
                  />
                </div>
                <div>
                  <button
                    type="button"
                    className="flex items-center gap-1.5 text-xs font-medium text-blue-600 hover:text-blue-800 transition-colors"
                    onClick={() => setShowParticipants((v) => !v)}
                  >
                    <span className={`transition-transform ${showParticipants ? "rotate-90" : ""}`}>▶</span>
                    참여자 {form.participants.length > 0 ? `(${form.participants.length}명)` : "추가"}
                  </button>
                  {showParticipants && (
                    <div className="mt-2 flex flex-wrap gap-1.5 rounded-lg border border-slate-200 bg-slate-50 p-2.5">
                      {employeeNames.map((name) => {
                        const checked = form.participants.includes(name);
                        const pc = personalColors[name];
                        return (
                          <button
                            key={name}
                            type="button"
                            onClick={() =>
                              setForm((f) => ({
                                ...f,
                                participants: checked
                                  ? f.participants.filter((n) => n !== name)
                                  : [...f.participants, name],
                              }))
                            }
                            className={`rounded-full px-2.5 py-1 text-xs font-medium transition-all border ${
                              checked
                                ? "border-transparent text-white"
                                : "border-slate-200 bg-white text-slate-600 hover:bg-slate-100"
                            }`}
                            style={checked && pc ? { backgroundColor: pc, borderColor: pc } : checked ? { backgroundColor: "#3b82f6" } : undefined}
                          >
                            {checked && <span className="mr-1">✓</span>}{name}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
              <div className="mt-5 flex justify-between">
                {editEvent ? (
                  <button type="button" onClick={() => deleteEvent(editEvent.id)}
                    className="rounded-lg border border-rose-200 px-4 py-2 text-sm font-medium text-rose-600 hover:bg-rose-50">
                    삭제
                  </button>
                ) : <div />}
                <div className="flex gap-2">
                  <button type="button" onClick={() => setShowModal(false)}
                    className="rounded-lg border px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50">
                    취소
                  </button>
                  <button type="button" onClick={saveEvent} disabled={!form.title.trim()}
                    className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-40">
                    저장
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 날짜 클릭 액션 팝오버 */}
      {dateAction && (
        <div
          ref={dateActionRef}
          className="fixed z-50 flex flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl"
          style={{ top: Math.min(dateAction.y + 4, window.innerHeight - 120), left: Math.min(dateAction.x, window.innerWidth - 200) }}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="px-3 py-2 text-xs font-semibold text-slate-400 border-b border-slate-100">
            {format(dateAction.date, "M월 d일 (EEE)", { locale: ko })}
          </div>
          <button
            type="button"
            className="flex items-center gap-2.5 px-4 py-2.5 text-sm text-slate-700 hover:bg-slate-50 transition-colors"
            onClick={() => { setDateAction(null); openAdd(dateAction.date); }}
          >
            <CalendarDays className="size-4 text-blue-500" />
            일정 추가
          </button>
          <button
            type="button"
            className="flex items-center gap-2.5 px-4 py-2.5 text-sm text-slate-700 hover:bg-slate-50 transition-colors"
            onClick={() => { setDateAction(null); router.push(`/hr?tab=leaves&date=${format(dateAction.date, "yyyy-MM-dd")}`); }}
          >
            <Plane className="size-4 text-emerald-500" />
            휴가 신청
          </button>
        </div>
      )}
    </div>
  );
}
