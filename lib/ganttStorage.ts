/**
 * 간트 차트 진행률 등 목표 데이터를 월별로 저장/로드 (목표 페이지 ↔ 보고서 연동)
 */

import {
  INITIAL_GANTT_EPICS,
  flattenEpicsToTasks,
  type GanttTask,
  type GanttTeamId,
} from "@/constants/gantt";
import {
  loadRoadmapFromStorage,
  type RoadmapBlock,
} from "@/components/reports/StrategicRoadmapSection";

const GANTT_STORAGE_KEY = "groupware-gantt-state";

const ROADMAP_DEPT_TO_TEAM: Record<string, GanttTeamId> = {
  "쇼핑/플레이스": "더널리",
  "쿠팡 & CPC": "더널리",
  "티제이웹": "티제이웹",
  "경영지원": "경영지원",
};

function roadmapBlocksToTasks(blocks: RoadmapBlock[] | null): GanttTask[] {
  if (!blocks?.length) return [];
  const tasks: GanttTask[] = [];
  for (const block of blocks) {
    const team = ROADMAP_DEPT_TO_TEAM[block.dept];
    if (!team) continue;
    for (const item of block.items) {
      if (!item.startDate || !item.endDate) continue;
      tasks.push({
        id: `roadmap-${block.dept}-${item.id}`,
        name: item.text || "(제목 없음)",
        team,
        startDate: item.startDate,
        endDate: item.endDate,
        progress: 0,
      });
    }
  }
  return tasks;
}

/** 보고서용: 해당 월의 전체 태스크 목록 + 저장된 진행률 */
export type TaskWithProgress = { id: string; name: string; team: GanttTeamId; progress: number };

export function getTasksWithProgressForMonth(monthKey: string): TaskWithProgress[] {
  const overrides = loadGanttOverrides(monthKey);
  const baseTasks = flattenEpicsToTasks(INITIAL_GANTT_EPICS);
  const roadmapBlocks = loadRoadmapFromStorage(monthKey);
  const roadmapTasks = roadmapBlocksToTasks(roadmapBlocks ?? []);
  const allTasks = [...baseTasks, ...roadmapTasks];
  return allTasks.map((t) => {
    const o = overrides[t.id];
    const progress = o?.progress !== undefined ? Math.min(100, Math.max(0, o.progress)) : t.progress;
    return { id: t.id, name: o?.name ?? t.name, team: t.team, progress };
  });
}

export type GanttTaskOverride = {
  progress?: number;
  name?: string;
  startDate?: string;
  endDate?: string;
};

export function loadGanttOverrides(monthKey: string): Record<string, GanttTaskOverride> {
  if (typeof window === "undefined") return {};
  try {
    const raw = localStorage.getItem(GANTT_STORAGE_KEY);
    if (!raw) return {};
    const data = JSON.parse(raw) as Record<string, Record<string, GanttTaskOverride>>;
    const overrides = data[monthKey];
    return overrides && typeof overrides === "object" ? overrides : {};
  } catch {
    return {};
  }
}

export function saveGanttOverride(
  monthKey: string,
  taskId: string,
  override: GanttTaskOverride
): void {
  try {
    const raw = localStorage.getItem(GANTT_STORAGE_KEY);
    const data: Record<string, Record<string, GanttTaskOverride>> = raw ? JSON.parse(raw) : {};
    if (!data[monthKey]) data[monthKey] = {};
    data[monthKey][taskId] = { ...data[monthKey][taskId], ...override };
    localStorage.setItem(GANTT_STORAGE_KEY, JSON.stringify(data));
    if (typeof window !== "undefined") {
      window.dispatchEvent(
        new CustomEvent("gantt-updated", { detail: { monthKey } })
      );
    }
  } catch {}
}

export function saveGanttOverrides(
  monthKey: string,
  overrides: Record<string, GanttTaskOverride>
): void {
  try {
    const raw = localStorage.getItem(GANTT_STORAGE_KEY);
    const data: Record<string, Record<string, GanttTaskOverride>> = raw ? JSON.parse(raw) : {};
    data[monthKey] = overrides;
    localStorage.setItem(GANTT_STORAGE_KEY, JSON.stringify(data));
    if (typeof window !== "undefined") {
      window.dispatchEvent(
        new CustomEvent("gantt-updated", { detail: { monthKey } })
      );
    }
  } catch {}
}
