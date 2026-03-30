"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { format, startOfWeek, addDays, addWeeks, isToday, parseISO } from "date-fns";
import { ko } from "date-fns/locale";
import { Plus, Trash2, CheckSquare, ChevronLeft, ChevronRight, Bell, X } from "lucide-react";
import { cn } from "@/lib/utils";

type ClientAlert = {
  id: string;
  client_name: string;
  category: string;
  last_deposit_date: string;
  days_since: number;
  threshold: number;
  triggered_date: string;
};

type ExpiryAlert = {
  id: string;
  client_name: string;
  type: string;
  expires_at: string;
  days_left: number;
};

type NextContactAlert = {
  id: string;
  name: string;
  category: string;
  next_contact_at: string;
  days_left: number;
};

type ApprovalAlert = {
  id: string;
  approval_id: string;
  approval_title: string;
  requester_name: string;
  created_at: string;
};

// ─── 타입 ─────────────────────────────────────────────────────────────────────
export type UserTodoItem = {
  id: string;
  text: string;
  done: boolean;
  createdAt: string;
};

// ─── 스토리지 ──────────────────────────────────────────────────────────────────
const STORAGE_KEY = "groupware-user-todos";

function loadTodos(userId: string, dateStr: string): UserTodoItem[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const data = JSON.parse(raw) as Record<string, Record<string, UserTodoItem[]>>;
    return data[userId]?.[dateStr] ?? [];
  } catch {
    return [];
  }
}

function saveTodos(userId: string, dateStr: string, items: UserTodoItem[]): void {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const data: Record<string, Record<string, UserTodoItem[]>> = raw ? JSON.parse(raw) : {};
    if (!data[userId]) data[userId] = {};
    data[userId][dateStr] = items;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch {}
}

// ─── 주간 날짜 배열 ────────────────────────────────────────────────────────────
function getWeekDates(baseDate: Date): Date[] {
  const mon = startOfWeek(baseDate, { weekStartsOn: 1 });
  return Array.from({ length: 7 }, (_, i) => addDays(mon, i));
}

function getWeekLabel(dates: Date[]): string {
  const first = dates[0]!;
  const last = dates[6]!;
  const sameMonth = first.getMonth() === last.getMonth();
  if (sameMonth) {
    return format(first, "M월 d일", { locale: ko }) + " ~ " + format(last, "d일", { locale: ko });
  }
  return format(first, "M/d", { locale: ko }) + " ~ " + format(last, "M/d", { locale: ko });
}

const DAY_LABELS = ["월", "화", "수", "목", "금", "토", "일"];

// ─── 컴포넌트 ──────────────────────────────────────────────────────────────────
export function UserTodoWidget({ userId, userName }: { userId: string; userName?: string }) {
  const today = new Date();
  const todayStr = format(today, "yyyy-MM-dd");

  const [weekOffset, setWeekOffset] = useState(0); // 0=이번주, -1=지난주, +1=다음주
  const [selectedDate, setSelectedDate] = useState(todayStr);
  const [todos, setTodos] = useState<UserTodoItem[]>([]);
  const [inputText, setInputText] = useState("");
  // 요일 배지 카운트 — 서버/클라이언트 hydration 불일치 방지용 (마운트 후 로드)
  const [dayCounts, setDayCounts] = useState<Record<string, number>>({});
  const [crmAlerts, setCrmAlerts] = useState<ClientAlert[]>([]);
  const [expiryAlerts, setExpiryAlerts] = useState<ExpiryAlert[]>([]);
  const [nextContactAlerts, setNextContactAlerts] = useState<NextContactAlert[]>([]);
  const [approvalAlerts, setApprovalAlerts] = useState<ApprovalAlert[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);

  const weekBase = addWeeks(today, weekOffset);
  const weekDates = getWeekDates(weekBase);
  const weekLabel = getWeekLabel(weekDates);
  const isCurrentWeek = weekOffset === 0;

  // 주 이동 시 선택 날짜 조정: 이번 주면 오늘, 아니면 해당 주 월요일
  useEffect(() => {
    if (isCurrentWeek) {
      setSelectedDate(todayStr);
    } else {
      setSelectedDate(format(weekDates[0]!, "yyyy-MM-dd"));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [weekOffset]);

  // 날짜 변경 시 해당 날짜 할일 로드
  useEffect(() => {
    setTodos(loadTodos(userId, selectedDate));
  }, [userId, selectedDate]);

  // CRM 알림 로드
  useEffect(() => {
    if (!userId) return;
    fetch(`/api/client-alerts?userId=${userId}`)
      .then((r) => (r.ok ? r.json() : []))
      .then((data) => setCrmAlerts(data))
      .catch(() => {});
  }, [userId]);

  // 만료일 알림 로드 (김동균만)
  useEffect(() => {
    if (!userName) return;
    fetch(`/api/client-alerts/expiry?userName=${encodeURIComponent(userName)}`)
      .then((r) => (r.ok ? r.json() : []))
      .then((data) => setExpiryAlerts(data))
      .catch(() => {});
  }, [userName]);

  // 다음 연락 예정일 알림 로드
  useEffect(() => {
    fetch("/api/clients/next-contact")
      .then((r) => (r.ok ? r.json() : []))
      .then((data) => setNextContactAlerts(data))
      .catch(() => {});
  }, []);

  // 결재 알림 로드
  useEffect(() => {
    if (!userId) return;
    fetch(`/api/approval-alerts?userId=${userId}`)
      .then((r) => (r.ok ? r.json() : []))
      .then((data) => setApprovalAlerts(data))
      .catch(() => {});
  }, [userId]);

  // 요일 배지 카운트 갱신 (주 변경 또는 todos 변경 시)
  useEffect(() => {
    const counts: Record<string, number> = {};
    weekDates.forEach((d) => {
      const ds = format(d, "yyyy-MM-dd");
      counts[ds] = loadTodos(userId, ds).length;
    });
    setDayCounts(counts);
  // weekDates는 매 렌더마다 새 배열이므로 weekOffset과 todos를 의존성으로 사용
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, weekOffset, todos]);

  // todos 변경 시 저장
  const updateTodos = useCallback(
    (next: UserTodoItem[]) => {
      setTodos(next);
      saveTodos(userId, selectedDate, next);
    },
    [userId, selectedDate]
  );

  const addTodo = () => {
    const text = inputText.trim();
    if (!text) return;
    const item: UserTodoItem = {
      id: `todo-${Date.now()}`,
      text,
      done: false,
      createdAt: new Date().toISOString(),
    };
    updateTodos([...todos, item]);
    setInputText("");
    inputRef.current?.focus();
  };

  const toggleTodo = (id: string) => {
    updateTodos(todos.map((t) => (t.id === id ? { ...t, done: !t.done } : t)));
  };

  const deleteTodo = (id: string) => {
    updateTodos(todos.filter((t) => t.id !== id));
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") addTodo();
  };

  async function dismissAlert(id: string) {
    setCrmAlerts((prev) => prev.filter((a) => a.id !== id));
    await fetch("/api/client-alerts", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
  }

  async function dismissApprovalAlert(id: string) {
    setApprovalAlerts((prev) => prev.filter((a) => a.id !== id));
    await fetch("/api/approval-alerts", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
  }

  const doneCnt = todos.filter((t) => t.done).length;

  return (
    <div className="flex flex-col gap-3">
      {/* 헤더 */}
      <div className="relative flex items-center justify-center">
        <div className="absolute left-0 flex items-center gap-2">
          <CheckSquare className="size-4 text-slate-600" />
          <span className="text-sm font-semibold text-slate-800">주간 할 일</span>
        </div>
        {/* 주 내비게이션 — 항상 가운데 고정 */}
        <div className="flex items-center gap-1 rounded-lg border border-slate-200 bg-slate-50 p-0.5">
          <button
            type="button"
            onClick={() => setWeekOffset((o) => o - 1)}
            className="flex size-6 items-center justify-center rounded text-slate-500 hover:bg-slate-200/70 hover:text-slate-800 transition-colors"
          >
            <ChevronLeft className="size-3.5" />
          </button>
          <span className="min-w-[7.5rem] text-center text-xs font-medium text-slate-600 tabular-nums">
            {isCurrentWeek ? "이번 주" : weekOffset < 0 ? `${Math.abs(weekOffset)}주 전` : `${weekOffset}주 후`}
            {" "}·{" "}{weekLabel}
          </span>
          <button
            type="button"
            onClick={() => setWeekOffset((o) => o + 1)}
            className="flex size-6 items-center justify-center rounded text-slate-500 hover:bg-slate-200/70 hover:text-slate-800 transition-colors"
          >
            <ChevronRight className="size-3.5" />
          </button>
        </div>
        {todos.length > 0 && (
          <span className="absolute right-0 text-xs text-slate-400 tabular-nums">
            {doneCnt}/{todos.length} 완료
          </span>
        )}
      </div>

      {/* 결재 알림 */}
      {approvalAlerts.length > 0 && (
        <div className="flex flex-col gap-1.5 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2.5">
          <div className="flex items-center gap-1.5 text-xs font-semibold text-emerald-700">
            <Bell className="size-3.5" />
            전자결재 알림 {approvalAlerts.length}건
          </div>
          {approvalAlerts.map((alert) => (
            <div
              key={alert.id}
              className="flex items-start justify-between gap-2 rounded-lg bg-white px-3 py-2 text-xs shadow-sm"
            >
              <div className="flex-1">
                <span className="font-semibold text-slate-800">{alert.approval_title}</span>
                <span className="text-slate-500"> — {alert.requester_name} 신청</span>
              </div>
              <button
                type="button"
                onClick={() => dismissApprovalAlert(alert.id)}
                className="shrink-0 text-slate-300 hover:text-slate-500 transition-colors"
              >
                <X className="size-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* CRM 알림 */}
      {crmAlerts.length > 0 && (
        <div className="flex flex-col gap-1.5 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5">
          <div className="flex items-center gap-1.5 text-xs font-semibold text-amber-700">
            <Bell className="size-3.5" />
            고객 관리 알림 {crmAlerts.length}건
          </div>
          {crmAlerts.map((alert) => (
            <div
              key={alert.id}
              className="flex items-start justify-between gap-2 rounded-lg bg-white px-3 py-2 text-xs shadow-sm"
            >
              <div className="flex-1">
                <span className="font-semibold text-slate-800">{alert.client_name}</span>
                <span className="text-slate-500">
                  {" "}마지막 결제가 {alert.days_since}일이 지났습니다. 관리가 필요합니다.
                </span>
              </div>
              <button
                type="button"
                onClick={() => dismissAlert(alert.id)}
                className="shrink-0 text-slate-300 hover:text-slate-500 transition-colors"
              >
                <X className="size-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* 만료일 알림 (김동균) */}
      {expiryAlerts.length > 0 && (
        <div className="flex flex-col gap-1.5 rounded-xl border border-violet-200 bg-violet-50 px-3 py-2.5">
          <div className="flex items-center gap-1.5 text-xs font-semibold text-violet-700">
            <Bell className="size-3.5" />
            티제이웹 만료 예정 {expiryAlerts.length}건
          </div>
          {expiryAlerts.map((alert) => (
            <div
              key={alert.id}
              className="flex items-center gap-2 rounded-lg bg-white px-3 py-2 text-xs shadow-sm"
            >
              <div className="flex-1">
                <span className="font-semibold text-slate-800">{alert.client_name}</span>
                <span className="text-slate-500"> {alert.type} 만료까지 </span>
                <span className={cn(
                  "font-semibold",
                  alert.days_left <= 3 ? "text-red-600" : alert.days_left <= 7 ? "text-amber-600" : "text-violet-600"
                )}>
                  D-{alert.days_left}
                </span>
                <span className="ml-1 text-slate-400">({alert.expires_at})</span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* 다음 연락 예정일 알림 */}
      {nextContactAlerts.length > 0 && (
        <div className="flex flex-col gap-1.5 rounded-xl border border-blue-200 bg-blue-50 px-3 py-2.5">
          <div className="flex items-center gap-1.5 text-xs font-semibold text-blue-700">
            <Bell className="size-3.5" />
            연락 예정 고객 {nextContactAlerts.length}건
          </div>
          {nextContactAlerts.map((alert) => (
            <div key={alert.id} className="flex items-center gap-2 rounded-lg bg-white px-3 py-2 text-xs shadow-sm">
              <div className="flex-1">
                <span className="font-semibold text-slate-800">{alert.name}</span>
                {alert.category && <span className="ml-1 text-slate-400">{alert.category}</span>}
                <span className="text-slate-500"> 연락 예정 </span>
                <span className={cn("font-semibold", alert.days_left === 0 ? "text-red-600" : alert.days_left <= 3 ? "text-amber-600" : "text-blue-600")}>
                  {alert.days_left === 0 ? "오늘" : `D-${alert.days_left}`}
                </span>
                <span className="ml-1 text-slate-400">({alert.next_contact_at})</span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* 요일 탭 */}
      <div className="flex gap-1 overflow-x-auto pb-0.5 scrollbar-none">
        {weekDates.map((d, i) => {
          const ds = format(d, "yyyy-MM-dd");
          const isSelected = selectedDate === ds;
          const isTodayDate = isToday(d);
          const isSat = i === 5;
          const isSun = i === 6;
          const cnt = dayCounts[ds] ?? 0;
          return (
            <button
              key={ds}
              type="button"
              onClick={() => setSelectedDate(ds)}
              className={cn(
                "relative flex min-w-[2.75rem] flex-col items-center rounded-xl px-2 py-1.5 text-xs transition-all",
                isSelected
                  ? "bg-slate-800 text-white shadow-sm"
                  : isTodayDate
                  ? "bg-blue-50 text-blue-700 ring-1 ring-blue-200"
                  : isSun
                  ? "text-rose-500 hover:bg-rose-50"
                  : isSat
                  ? "text-blue-500 hover:bg-blue-50"
                  : "text-slate-600 hover:bg-slate-100"
              )}
            >
              <span className="font-medium">{DAY_LABELS[i]}</span>
              <span className={cn("tabular-nums", isSelected ? "text-slate-300" : "text-slate-400")}>
                {format(d, "d")}
              </span>
              {cnt > 0 && (
                <span
                  className={cn(
                    "absolute -top-0.5 -right-0.5 flex size-4 items-center justify-center rounded-full text-[9px] font-bold",
                    isSelected ? "bg-white text-slate-800" : "bg-slate-600 text-white"
                  )}
                >
                  {cnt}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* 날짜 레이블 */}
      <p className="text-xs text-slate-400">
        {format(parseISO(selectedDate), "M월 d일 (EEE)", { locale: ko })}
        {selectedDate === todayStr && (
          <span className="ml-1.5 rounded-full bg-blue-100 px-1.5 py-0.5 text-[10px] font-semibold text-blue-600">
            오늘
          </span>
        )}
      </p>

      {/* 할일 목록 */}
      <ul className="space-y-1 min-h-[2rem]">
        {todos.length === 0 && (
          <li className="py-3 text-center text-xs text-slate-400">
            할 일을 추가해보세요
          </li>
        )}
        {todos.map((t) => (
          <li
            key={t.id}
            className="group flex items-center gap-2 rounded-lg px-2 py-1.5 transition-colors hover:bg-slate-50"
          >
            <button
              type="button"
              onClick={() => toggleTodo(t.id)}
              className={cn(
                "flex size-4 shrink-0 items-center justify-center rounded border transition-colors",
                t.done
                  ? "border-emerald-400 bg-emerald-400 text-white"
                  : "border-slate-300 hover:border-slate-400"
              )}
            >
              {t.done && (
                <svg className="size-2.5" viewBox="0 0 10 8" fill="none">
                  <path d="M1 4l3 3 5-6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              )}
            </button>
            <span
              className={cn(
                "flex-1 text-sm text-slate-800 cursor-pointer select-none",
                t.done && "text-slate-400 line-through"
              )}
              onClick={() => toggleTodo(t.id)}
            >
              {t.text}
            </span>
            <button
              type="button"
              onClick={() => deleteTodo(t.id)}
              className="shrink-0 opacity-0 group-hover:opacity-100 text-slate-300 hover:text-rose-500 transition-all"
            >
              <Trash2 className="size-3.5" />
            </button>
          </li>
        ))}
      </ul>

      {/* 입력 */}
      <div className="flex gap-2">
        <input
          ref={inputRef}
          type="text"
          value={inputText}
          onChange={(e) => setInputText(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="새 할 일 입력 후 Enter"
          className="flex-1 rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-sm text-slate-800 placeholder:text-slate-400 focus:border-slate-400 focus:bg-white focus:outline-none transition-colors"
        />
        <button
          type="button"
          onClick={addTodo}
          disabled={!inputText.trim()}
          className="flex items-center gap-1 rounded-lg bg-slate-800 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-slate-700 disabled:opacity-40"
        >
          <Plus className="size-3.5" />
          추가
        </button>
      </div>
    </div>
  );
}
