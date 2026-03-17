"use client";

import React, { useState, useMemo, useCallback, useEffect } from "react";
import { addDays, format, parseISO, startOfDay } from "date-fns";
import { ko } from "date-fns/locale";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  GANTT_TEAMS,
  type GanttTask,
  type GanttEpic,
  type GanttTeamId,
} from "@/constants/gantt";
import {
  loadRoadmapFromStorage,
  getCurrentMonthKey,
  getDefaultRoadmap,
  type RoadmapBlock,
} from "@/components/reports/StrategicRoadmapSection";
import { loadGanttOverrides, saveGanttOverride } from "@/lib/ganttStorage";
import { getDatesInRange, parseDateSafe } from "@/utils/ganttUtils";
import { ChevronDown, ChevronRight, ChevronLeft } from "lucide-react";
import { cn } from "@/lib/utils";

/** 월 키 "YY.MM" ↔ 날짜 범위 */
function parseMonthKey(key: string): { y: number; m: number } {
  const [y, m] = key.split(".").map(Number);
  return { y: y ?? 24, m: m ?? 1 };
}
function formatMonthKey(y: number, m: number): string {
  return `${y}.${String(m).padStart(2, "0")}`;
}
function prevMonthKey(key: string): string {
  const { y, m } = parseMonthKey(key);
  if (m === 1) return formatMonthKey(y - 1, 12);
  return formatMonthKey(y, m - 1);
}
function nextMonthKey(key: string): string {
  const { y, m } = parseMonthKey(key);
  if (m === 12) return formatMonthKey(y + 1, 1);
  return formatMonthKey(y, m + 1);
}
function monthKeyToRange(key: string): { start: Date; end: Date } {
  const { y, m } = parseMonthKey(key);
  const fullYear = 2000 + Number(y);
  const start = startOfDay(new Date(fullYear, m - 1, 1));
  const end = startOfDay(new Date(fullYear, m, 0));
  return { start, end };
}

const MIN_MONTH_KEY = "24.01";
const DAY_WIDTH = 32;
const LEFT_COL_WIDTH = 220;

const TEAM_COLORS: Record<GanttTeamId, { pill: string; dot: string }> = {
  더널리: { pill: "bg-sky-100 text-sky-700", dot: "bg-sky-500" },
  티제이웹: { pill: "bg-emerald-100 text-emerald-700", dot: "bg-emerald-500" },
  경영지원: { pill: "bg-amber-100 text-amber-700", dot: "bg-amber-500" },
};

/** [1] 화면에 보여야 할 항목만 담긴 1차원 배열: 에픽 + expandedEpics 기준 열려 있는 서브태스크 */
type VisibleItem =
  | { type: "epic"; epic: GanttEpic; team: GanttTeamId }
  | { type: "task"; task: GanttTask; epic: GanttEpic; team: GanttTeamId };

function getEpicBarRange(epic: GanttEpic): { start: Date; end: Date } {
  if (epic.subTasks.length === 0) {
    const d = new Date();
    return { start: d, end: d };
  }
  let start = parseDateSafe(epic.subTasks[0].startDate);
  let end = parseDateSafe(epic.subTasks[0].endDate);
  for (let i = 1; i < epic.subTasks.length; i++) {
    const s = parseDateSafe(epic.subTasks[i].startDate);
    const e = parseDateSafe(epic.subTasks[i].endDate);
    if (s < start) start = s;
    if (e > end) end = e;
  }
  return { start, end };
}

/** [3] 바의 left/width 절대 픽셀: (일수 차이) * DAY_WIDTH */
function getBarPx(
  taskStart: Date,
  taskEnd: Date,
  timelineStart: Date
): { leftPx: number; widthPx: number } {
  const msPerDay = 86400000;
  const startOffsetDays = Math.max(0, Math.floor((taskStart.getTime() - timelineStart.getTime()) / msPerDay));
  const endOffsetDays = Math.floor((taskEnd.getTime() - timelineStart.getTime()) / msPerDay);
  const durationDays = Math.max(0, endOffsetDays - startOffsetDays + 1); // 종료일 포함
  return {
    leftPx: startOffsetDays * DAY_WIDTH,
    widthPx: durationDays * DAY_WIDTH,
  };
}

/** 로드맵 부서 → 간트 팀 매핑 */
const ROADMAP_DEPT_TO_TEAM: Record<string, GanttTeamId> = {
  "쇼핑/플레이스": "더널리",
  "쿠팡 & CPC": "더널리",
  "티제이웹": "티제이웹",
  "경영지원": "경영지원",
};

/** 부서 표시 순서 */
const ROADMAP_DEPT_ORDER = ["쇼핑/플레이스", "쿠팡 & CPC", "티제이웹", "경영지원"];

/** 부서 단위로 에픽을 생성 (쇼핑/플레이스·쿠팡&CPC 각각 별도 행, 더널리 색상) */
function roadmapBlocksToEpics(
  blocks: RoadmapBlock[] | null,
  overrides: Record<string, { progress?: number; name?: string; startDate?: string; endDate?: string }> = {}
): GanttEpic[] {
  if (!blocks?.length) return [];
  const blockMap = new Map<string, RoadmapBlock>();
  for (const b of blocks) blockMap.set(b.dept, b);

  const epics: GanttEpic[] = [];
  for (const dept of ROADMAP_DEPT_ORDER) {
    const block = blockMap.get(dept);
    if (!block) continue;
    const team = ROADMAP_DEPT_TO_TEAM[dept];
    if (!team) continue;
    const subTasks: GanttTask[] = [];
    for (const item of block.items) {
      if (!item.startDate || !item.endDate) continue;
      const id = `roadmap-${dept}-${item.id}`;
      const o = overrides[id];
      subTasks.push({
        id,
        name: (o?.name ?? item.text) || "(제목 없음)",
        team,
        startDate: o?.startDate ?? item.startDate,
        endDate: o?.endDate ?? item.endDate,
        progress: o?.progress !== undefined ? Math.min(100, Math.max(0, o.progress)) : 0,
      });
    }
    if (subTasks.length > 0) {
      epics.push({ id: `roadmap-epic-${dept}`, name: dept, team, subTasks });
    }
  }
  return epics;
}

function applyOverridesToEpics(
  epics: GanttEpic[],
  overrides: Record<string, { progress?: number; name?: string; startDate?: string; endDate?: string }>
): GanttEpic[] {
  if (!Object.keys(overrides).length) return epics;
  return epics.map((epic) => ({
    ...epic,
    subTasks: epic.subTasks.map((t) => {
      const o = overrides[t.id];
      if (!o) return t;
      return {
        ...t,
        ...(o.progress !== undefined && { progress: Math.min(100, Math.max(0, o.progress)) }),
        ...(o.name !== undefined && { name: o.name }),
        ...(o.startDate !== undefined && { startDate: o.startDate }),
        ...(o.endDate !== undefined && { endDate: o.endDate }),
      };
    }),
  }));
}

const INITIAL_MONTH_KEY = "26.03";

export type SupabaseProjectRow = {
  id: string;
  title: string;
  team: string | null;
  status: string | null;
  progress: number;
  start_date: string | null;
  end_date: string | null;
  created_at?: string;
};

function projectsToEpics(projects: SupabaseProjectRow[]): GanttEpic[] {
  const byTeam = new Map<GanttTeamId, GanttTask[]>();
  for (const p of projects) {
    const team = p.team && GANTT_TEAMS.includes(p.team as GanttTeamId) ? (p.team as GanttTeamId) : null;
    if (!team) continue;
    const start = p.start_date || new Date().toISOString().slice(0, 10);
    const end = p.end_date || start;
    const task: GanttTask = {
      id: p.id,
      name: p.title || "(제목 없음)",
      team,
      startDate: start,
      endDate: end,
      progress: Math.min(100, Math.max(0, p.progress ?? 0)),
    };
    const list = byTeam.get(team) ?? [];
    list.push(task);
    byTeam.set(team, list);
  }
  return GANTT_TEAMS.map((team) => {
    const subTasks = byTeam.get(team) ?? [];
    return { id: `epic-${team}`, name: team, team, subTasks };
  }).filter((e) => e.subTasks.length > 0);
}

export type TeamGanttChartProps = {
  projectsFromSupabase?: SupabaseProjectRow[];
  onUpdateProject?: (id: string, patch: { title?: string; start_date?: string; end_date?: string; progress?: number; status?: string }) => Promise<void>;
  onDeleteProject?: (id: string) => Promise<void>;
};

export function TeamGanttChart({ projectsFromSupabase = [], onUpdateProject, onDeleteProject }: TeamGanttChartProps) {
  const [selectedMonthKey, setSelectedMonthKey] = useState(getCurrentMonthKey);
  const [roadmapBlocks, setRoadmapBlocks] = useState<RoadmapBlock[] | null>(null);
  const [ganttOverrides, setGanttOverrides] = useState<Record<string, { progress?: number; name?: string; startDate?: string; endDate?: string }>>(
    () => loadGanttOverrides(getCurrentMonthKey())
  );
  const [expandedEpics, setExpandedEpics] = useState<Set<string>>(new Set());
  const [editTask, setEditTask] = useState<GanttTask | null>(null);

  // 선택 월 변경 시 Supabase → localStorage → default 순으로 로드
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const res = await fetch(`/api/roadmap/${encodeURIComponent(selectedMonthKey)}`);
        if (res.ok) {
          const data = await res.json();
          if (!cancelled && Array.isArray(data.blocks) && data.blocks.length > 0) {
            setRoadmapBlocks(data.blocks);
            setGanttOverrides(loadGanttOverrides(selectedMonthKey));
            return;
          }
        }
      } catch {}
      if (cancelled) return;
      const loaded = loadRoadmapFromStorage(selectedMonthKey);
      setRoadmapBlocks(loaded && loaded.length > 0 ? loaded : getDefaultRoadmap(selectedMonthKey));
      setGanttOverrides(loadGanttOverrides(selectedMonthKey));
    };
    load();
    return () => { cancelled = true; };
  }, [selectedMonthKey]);

  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<{ monthKey: string }>).detail;
      if (detail?.monthKey === selectedMonthKey) {
        // roadmap-updated 이벤트 수신 시 Supabase에서 재로드
        fetch(`/api/roadmap/${encodeURIComponent(selectedMonthKey)}`)
          .then((r) => r.ok ? r.json() : null)
          .then((data) => {
            if (data?.blocks?.length) {
              setRoadmapBlocks(data.blocks);
            } else {
              const loaded = loadRoadmapFromStorage(selectedMonthKey);
              setRoadmapBlocks(loaded && loaded.length > 0 ? loaded : getDefaultRoadmap(selectedMonthKey));
            }
          })
          .catch(() => {});
      }
    };
    window.addEventListener("roadmap-updated", handler);
    return () => window.removeEventListener("roadmap-updated", handler);
  }, [selectedMonthKey]);

  const roadmapEpics = useMemo(
    () => roadmapBlocksToEpics(roadmapBlocks, ganttOverrides),
    [roadmapBlocks, ganttOverrides]
  );
  const dbEpics = useMemo(
    () => projectsToEpics(projectsFromSupabase),
    [projectsFromSupabase]
  );
  const epics = useMemo(
    () => [...dbEpics, ...roadmapEpics],
    [dbEpics, roadmapEpics]
  );

  const { start: timelineStart, end: timelineEnd } = useMemo(
    () => monthKeyToRange(selectedMonthKey),
    [selectedMonthKey]
  );
  const dates = useMemo(
    () => getDatesInRange(timelineStart, timelineEnd),
    [timelineStart, timelineEnd]
  );
  const totalDays = dates.length;
  const timelineWidthPx = totalDays * DAY_WIDTH;

  const canPrevMonth = selectedMonthKey > MIN_MONTH_KEY;
  const maxMonthKey = (() => {
    const d = new Date();
    d.setMonth(d.getMonth() + 3);
    const y = d.getFullYear() % 100;
    const m = d.getMonth() + 1;
    return formatMonthKey(y, m);
  })();
  const canNextMonth = selectedMonthKey < maxMonthKey;
  const monthLabel = useMemo(() => {
    const { y, m } = parseMonthKey(selectedMonthKey);
    return `20${String(y).padStart(2, "0")}년 ${m}월`;
  }, [selectedMonthKey]);

  /** [1] visibleItems: 에픽은 무조건, 펼쳐진 에픽일 때만 해당 서브태스크 추가
   *  로드맵 에픽은 ROADMAP_DEPT_ORDER 순서, DB 프로젝트 에픽은 GANTT_TEAMS 순서 */
  const visibleItems = useMemo((): VisibleItem[] => {
    const items: VisibleItem[] = [];
    // 에픽 순서: roadmap 부서 순 → db 프로젝트 팀 순
    const ordered = [
      ...epics.filter((e) => e.id.startsWith("roadmap-epic-")),
      ...epics.filter((e) => !e.id.startsWith("roadmap-epic-")),
    ];
    for (const epic of ordered) {
      const team = epic.team;
      items.push({ type: "epic", epic, team });
      if (expandedEpics.has(epic.id)) {
        epic.subTasks.forEach((task) => {
          items.push({ type: "task", task, epic, team });
        });
      }
    }
    return items;
  }, [epics, expandedEpics]);

  const toggleExpanded = useCallback((epicId: string) => {
    setExpandedEpics((prev) => {
      const next = new Set(prev);
      if (next.has(epicId)) next.delete(epicId);
      else next.add(epicId);
      return next;
    });
  }, []);

  const handleUpdate = useCallback(
    async (form: { name: string; startDate: string; endDate: string; progress: number }) => {
      if (!editTask) return;
      const progress = Math.min(100, Math.max(0, form.progress));
      const patch = { progress, name: form.name, startDate: form.startDate, endDate: form.endDate };
      if (editTask.id.startsWith("roadmap-")) {
        saveGanttOverride(selectedMonthKey, editTask.id, patch);
        setGanttOverrides((prev) => ({
          ...prev,
          [editTask.id]: { ...prev[editTask.id], ...patch },
        }));
      } else if (onUpdateProject) {
        await onUpdateProject(editTask.id, {
          title: form.name,
          start_date: form.startDate,
          end_date: form.endDate,
          progress,
        });
      }
      setEditTask(null);
    },
    [editTask, selectedMonthKey, onUpdateProject]
  );

  const handleDelete = useCallback(async () => {
    if (!editTask) return;
    if (editTask.id.startsWith("roadmap-")) return;
    if (onDeleteProject) await onDeleteProject(editTask.id);
    setEditTask(null);
  }, [editTask, onDeleteProject]);

  /** [3] 오늘 날짜가 타임라인 구간 안에 있으면 픽셀 오프셋(우측 영역 기준), 없으면 null */
  const todayLeftPx = useMemo(() => {
    const today = startOfDay(new Date());
    if (today < timelineStart || today > timelineEnd) return null;
    const msPerDay = 86400000;
    const dayIndex = Math.floor((today.getTime() - timelineStart.getTime()) / msPerDay);
    return dayIndex * DAY_WIDTH;
  }, [timelineStart, timelineEnd]);

  const headerH = 44;
  const rowH = 40;

  return (
    <div className="font-sans space-y-3">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-1 rounded-lg border border-slate-200 bg-slate-50/80 p-1">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-8 w-8 shrink-0"
            disabled={!canPrevMonth}
            onClick={() => setSelectedMonthKey(prevMonthKey(selectedMonthKey))}
          >
            <ChevronLeft className="size-4" />
          </Button>
          <span className="min-w-[7rem] text-center text-sm font-semibold text-slate-800 tabular-nums">
            {monthLabel}
          </span>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-8 w-8 shrink-0"
            disabled={!canNextMonth}
            onClick={() => setSelectedMonthKey(nextMonthKey(selectedMonthKey))}
          >
            <ChevronRight className="size-4" />
          </Button>
        </div>
        <p className="text-xs text-slate-500">
          이 월에서 수정한 진행률은 보고서의 「{monthLabel} 목표 진행률」에 반영됩니다.
        </p>
      </div>
      <div className="overflow-x-auto overflow-y-auto max-h-[520px] rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="relative min-h-full">
          {/* 타임라인 세로선: 옅은 1px */}
          <div
            className="absolute bottom-0 z-0 flex w-max"
            style={{ left: LEFT_COL_WIDTH, width: timelineWidthPx, top: headerH }}
          >
            {dates.map((_, i) => (
              <div
                key={i}
                className="flex-shrink-0 h-full border-r border-slate-100"
                style={{ width: DAY_WIDTH, minWidth: DAY_WIDTH }}
              />
            ))}
          </div>

          {/* 오늘 라인 */}
          {todayLeftPx != null && (
            <>
              <div
                className="absolute top-0 bottom-0 w-0.5 bg-blue-500 z-10 pointer-events-none"
                style={{ left: LEFT_COL_WIDTH + todayLeftPx, top: headerH }}
              />
              <div
                className="absolute w-2 h-2 rounded-full bg-blue-500 z-10 pointer-events-none -translate-x-1/2 border-2 border-white"
                style={{ left: LEFT_COL_WIDTH + todayLeftPx, top: 10 }}
              />
            </>
          )}

          {/* 헤더 한 줄 */}
          <div
            className="flex w-max min-w-full sticky top-0 z-30 border-b border-slate-200 bg-slate-50/90"
            style={{ height: headerH }}
          >
            <div
              className="flex-shrink-0 sticky left-0 z-20 flex items-center h-full pl-4 pr-3 border-r border-slate-200 bg-slate-50/90"
              style={{ width: LEFT_COL_WIDTH }}
            >
              <span className="text-xs font-medium text-slate-500">작업</span>
            </div>
            <div
              className="flex-shrink-0 flex h-full items-center"
              style={{ width: timelineWidthPx }}
            >
              {dates.map((d, i) => (
                <div
                  key={i}
                  className="flex-shrink-0 flex items-center justify-center text-[11px] text-slate-500 border-r border-slate-100"
                  style={{ width: DAY_WIDTH, minWidth: DAY_WIDTH }}
                >
                  {format(d, "d", { locale: ko })}
                </div>
              ))}
            </div>
          </div>

          {visibleItems.map((item) => {
            if (item.type === "epic") {
              const { epic, team } = item;
              const colors = TEAM_COLORS[team];
              const { start, end } = getEpicBarRange(epic);
              const { leftPx, widthPx } = getBarPx(start, end, timelineStart);
              return (
                <div
                  key={epic.id}
                  className="flex w-max min-w-full items-stretch border-b border-slate-100 hover:bg-slate-50/70 transition-colors group"
                  style={{ minHeight: rowH }}
                >
                  <div
                    className="flex-shrink-0 sticky left-0 z-20 flex items-center gap-2 pl-2 pr-3 py-2 border-r border-slate-200 bg-white group-hover:bg-slate-50/70 transition-colors"
                    style={{ width: LEFT_COL_WIDTH, minHeight: rowH }}
                  >
                    <button
                      type="button"
                      onClick={() => toggleExpanded(epic.id)}
                      className="flex shrink-0 items-center justify-center w-6 h-6 rounded text-slate-400 hover:bg-slate-200/60 hover:text-slate-600 transition-colors"
                      aria-label={expandedEpics.has(epic.id) ? "접기" : "펼치기"}
                    >
                      {expandedEpics.has(epic.id) ? (
                        <ChevronDown className="size-4" />
                      ) : (
                        <ChevronRight className="size-4" />
                      )}
                    </button>
                    <span className={cn("shrink-0 px-1.5 py-0.5 rounded text-[10px] font-semibold", colors.pill)}>
                      {team}
                    </span>
                    <span className="min-w-0 truncate text-sm font-semibold text-slate-800">{epic.name}</span>
                  </div>
                  <div
                    className="relative flex-shrink-0 py-2"
                    style={{ width: timelineWidthPx, minHeight: rowH }}
                  >
                    <div
                      className="absolute top-1/2 -translate-y-1/2 h-6 rounded-md bg-slate-700 text-slate-200 shadow-sm transition-shadow group-hover:shadow-md"
                      style={{ left: leftPx, width: widthPx }}
                    />
                  </div>
                </div>
              );
            }
            const { task } = item;
            const start = parseDateSafe(task.startDate);
            const end = parseDateSafe(task.endDate);
            const { leftPx, widthPx } = getBarPx(start, end, timelineStart);
            const progress = Math.min(100, Math.max(0, task.progress));
            return (
              <div
                key={task.id}
                className="flex w-max min-w-full items-stretch border-b border-slate-100 hover:bg-slate-50/70 transition-colors group"
                style={{ minHeight: rowH }}
              >
                <div
                  className="flex-shrink-0 sticky left-0 z-20 flex items-center gap-2 pl-8 pr-3 py-2 border-r border-slate-200 bg-white group-hover:bg-slate-50/70 transition-colors cursor-pointer"
                  style={{ width: LEFT_COL_WIDTH, minHeight: rowH }}
                  onClick={() => setEditTask(task)}
                >
                  <span
                    className={cn(
                      "shrink-0 w-2 h-2 rounded-full",
                      progress >= 100 ? "bg-emerald-500" : progress > 0 ? "bg-amber-500" : "bg-slate-300"
                    )}
                    aria-hidden
                  />
                  <span className="min-w-0 truncate text-sm text-slate-600">{task.name}</span>
                </div>
                <div
                  className="relative flex-shrink-0 py-2"
                  style={{ width: timelineWidthPx, minHeight: rowH }}
                >
                  <div
                    className="absolute top-1/2 -translate-y-1/2 h-5 rounded-md overflow-hidden bg-slate-200/80 transition-shadow group-hover:shadow-md"
                    style={{ left: leftPx, width: widthPx }}
                  >
                    <div
                      className="absolute inset-y-0 left-0 rounded-md bg-sky-500"
                      style={{ width: `${progress}%`, minWidth: progress > 0 ? 4 : 0 }}
                    />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <EditTaskModal
        task={editTask}
        onClose={() => setEditTask(null)}
        onUpdate={handleUpdate}
        onDelete={handleDelete}
        allowDelete={editTask != null && !editTask.id.startsWith("roadmap-")}
      />
    </div>
  );
}

function EditTaskModal({
  task,
  onClose,
  onUpdate,
  onDelete,
  allowDelete = true,
}: {
  task: GanttTask | null;
  onClose: () => void;
  onUpdate: (form: { name: string; startDate: string; endDate: string; progress: number }) => void;
  onDelete: () => void;
  allowDelete?: boolean;
}) {
  const [name, setName] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    if (task) {
      setName(task.name);
      setStartDate(task.startDate);
      setEndDate(task.endDate);
      setProgress(task.progress);
    }
  }, [task]);

  if (!task) return null;

  return (
    <Dialog open={!!task} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>일정 수정 / 삭제</DialogTitle>
          <DialogDescription>
            [{task.team}] {task.name}
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          <div>
            <Label>일정명</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} className="mt-2" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>시작일</Label>
              <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="mt-2" />
            </div>
            <div>
              <Label>종료일</Label>
              <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="mt-2" />
            </div>
          </div>
          <div>
            <Label>진행률 (%)</Label>
            <Input
              type="number"
              min={0}
              max={100}
              value={progress}
              onChange={(e) => setProgress(Number(e.target.value) || 0)}
              className="mt-2"
            />
          </div>
        </div>
        <DialogFooter>
          {allowDelete && (
            <Button variant="outline" className="text-rose-600 hover:bg-rose-50" onClick={() => confirm("삭제하시겠습니까?") && onDelete()}>
              삭제
            </Button>
          )}
          <Button variant="outline" onClick={onClose}>취소</Button>
          <Button onClick={() => onUpdate({ name: name.trim(), startDate, endDate, progress })} disabled={!name.trim()}>
            저장
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
