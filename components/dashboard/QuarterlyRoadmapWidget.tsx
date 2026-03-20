"use client";

import { useState, useEffect, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ChevronLeft, ChevronRight } from "lucide-react";
import {
  getCurrentMonthKey,
  loadRoadmapFromStorage,
  getDefaultRoadmap,
  type RoadmapBlock,
} from "@/components/reports/StrategicRoadmapSection";
import { loadGanttOverrides, type GanttTaskOverride } from "@/lib/ganttStorage";
import { cn } from "@/lib/utils";

// ─── 팀·부서 설정 ────────────────────────────────────────────────────────────
const TEAM_DEPTS: Record<string, string[]> = {
  더널리: ["쇼핑/플레이스", "쿠팡 & CPC"],
  티제이웹: ["티제이웹"],
  경영지원: ["경영지원"],
};
const TEAM_ORDER = ["더널리", "티제이웹", "경영지원"] as const;
type TeamId = (typeof TEAM_ORDER)[number];

const TEAM_STYLE: Record<TeamId, { header: string; bar: string; badge: string; track: string }> = {
  더널리:  { header: "bg-blue-600",    bar: "bg-blue-600",    badge: "bg-blue-100 text-blue-700",       track: "bg-blue-100" },
  티제이웹: { header: "bg-orange-500",  bar: "bg-orange-500",  badge: "bg-orange-100 text-orange-700",   track: "bg-orange-100" },
  경영지원: { header: "bg-emerald-700", bar: "bg-emerald-700", badge: "bg-emerald-100 text-emerald-800", track: "bg-emerald-100" },
};

// ─── 월 키 유틸 ──────────────────────────────────────────────────────────────
function prevMK(key: string) {
  const [yy, mm] = key.split(".").map(Number);
  const y = yy ?? 26, m = mm ?? 3;
  return m === 1 ? `${y - 1}.12` : `${y}.${String(m - 1).padStart(2, "0")}`;
}
function nextMK(key: string) {
  const [yy, mm] = key.split(".").map(Number);
  const y = yy ?? 26, m = mm ?? 3;
  return m === 12 ? `${y + 1}.01` : `${y}.${String(m + 1).padStart(2, "0")}`;
}
function mkToLabel(key: string) {
  const [yy, mm] = key.split(".").map(Number);
  return `20${String(yy ?? 26).padStart(2, "0")}년 ${mm ?? 3}월`;
}

// ─── 부서 진행률 계산 ─────────────────────────────────────────────────────────
function calcDeptProgress(
  dept: string,
  blocks: RoadmapBlock[],
  overrides: Record<string, GanttTaskOverride>
): number {
  const block = blocks.find((b) => b.dept === dept);
  if (!block || block.items.length === 0) return 0;
  let total = 0, count = 0;
  for (const item of block.items) {
    if (!item.startDate || !item.endDate) continue;
    const override = overrides[`roadmap-${dept}-${item.id}`];
    total += override?.progress ?? 0;
    count++;
  }
  return count > 0 ? Math.round(total / count) : 0;
}

// ─── 메인 위젯 ───────────────────────────────────────────────────────────────
export function QuarterlyRoadmapWidget() {
  const [monthKey, setMonthKey] = useState(getCurrentMonthKey);
  const [blocks, setBlocks] = useState<RoadmapBlock[]>([]);
  const [overrides, setOverrides] = useState<Record<string, GanttTaskOverride>>({});

  // 월 변경 시 로드맵 + 오버라이드 로드
  useEffect(() => {
    let cancelled = false;

    // GanttOverrides (localStorage)
    setOverrides(loadGanttOverrides(monthKey));

    // Roadmap: Supabase API → localStorage → default
    fetch(`/api/roadmap/${encodeURIComponent(monthKey)}`)
      .then((r) => r.ok ? r.json() : null)
      .then((data) => {
        if (cancelled) return;
        if (Array.isArray(data?.blocks) && data.blocks.length > 0) {
          setBlocks(data.blocks);
        } else {
          const stored = loadRoadmapFromStorage(monthKey);
          setBlocks(stored && stored.length > 0 ? stored : getDefaultRoadmap(monthKey));
        }
      })
      .catch(() => {
        if (cancelled) return;
        const stored = loadRoadmapFromStorage(monthKey);
        setBlocks(stored && stored.length > 0 ? stored : getDefaultRoadmap(monthKey));
      });

    return () => { cancelled = true; };
  }, [monthKey]);

  // 간트 업데이트 이벤트 수신
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<{ monthKey: string }>).detail;
      if (detail?.monthKey === monthKey) {
        setOverrides(loadGanttOverrides(monthKey));
      }
    };
    window.addEventListener("gantt-updated", handler);
    return () => window.removeEventListener("gantt-updated", handler);
  }, [monthKey]);

  // 팀별 진행률
  const teamProgress = useMemo(() => {
    return TEAM_ORDER.map((team) => {
      const depts = TEAM_DEPTS[team] ?? [];
      const deptRows = depts.map((dept) => ({
        dept,
        progress: calcDeptProgress(dept, blocks, overrides),
      }));
      const avg =
        deptRows.length > 0
          ? Math.round(deptRows.reduce((s, d) => s + d.progress, 0) / deptRows.length)
          : 0;
      return { team, deptRows, avg };
    });
  }, [blocks, overrides]);

  // 전체 평균
  const overallAvg = useMemo(
    () => Math.round(teamProgress.reduce((s, t) => s + t.avg, 0) / TEAM_ORDER.length),
    [teamProgress]
  );

  return (
    <Card className="relative z-10 h-full rounded-2xl border border-white/80 bg-white/80 shadow-[0_8px_30px_rgb(0,0,0,0.04)] backdrop-blur-xl transition-all duration-300 hover:shadow-[0_16px_40px_rgb(0,0,0,0.08)]">
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3 pb-3">
        <div className="flex items-center gap-3">
          <CardTitle className="text-slate-900">🎯 마스터 로드맵 달성도</CardTitle>
          {/* 월 내비게이션 */}
          <nav className="flex items-center gap-0.5 rounded-lg border border-slate-200 bg-slate-50/80 p-0.5">
            <button
              type="button"
              onClick={() => setMonthKey(prevMK(monthKey))}
              className="flex size-7 items-center justify-center rounded text-slate-500 transition-colors hover:bg-slate-200/60 hover:text-slate-800"
            >
              <ChevronLeft className="size-4" />
            </button>
            <span className="min-w-[6rem] px-1.5 text-center text-sm font-semibold text-slate-700 tabular-nums">
              {mkToLabel(monthKey)}
            </span>
            <button
              type="button"
              onClick={() => setMonthKey(nextMK(monthKey))}
              className="flex size-7 items-center justify-center rounded text-slate-500 transition-colors hover:bg-slate-200/60 hover:text-slate-800"
            >
              <ChevronRight className="size-4" />
            </button>
          </nav>
        </div>
        <span className="shrink-0 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700">
          전사 평균 {overallAvg}% 달성 중
        </span>
      </CardHeader>

      <CardContent>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          {teamProgress.map(({ team, deptRows, avg }) => {
            const style = TEAM_STYLE[team as TeamId];
            return (
              <div
                key={team}
                className="flex flex-col overflow-hidden rounded-xl border border-slate-100 bg-white shadow-sm"
              >
                {/* 팀 헤더 — 진행률만큼 색이 왼쪽→오른쪽으로 차오름 */}
                <div className="relative flex items-center justify-between overflow-hidden rounded-t-xl px-4 py-2.5 bg-slate-100">
                  {/* 채워지는 배경 */}
                  <div
                    className={cn("absolute inset-y-0 left-0 transition-all duration-700", style.header)}
                    style={{ width: `${avg}%` }}
                  />
                  {/* 팀명 배지 */}
                  <span className={cn("relative z-10 rounded px-2 py-0.5 text-xs font-bold", style.badge)}>
                    {team}
                  </span>
                  {/* % 숫자 */}
                  <span className="relative z-10 text-sm font-extrabold tabular-nums text-slate-700">
                    {avg}%
                  </span>
                </div>

                {/* 부서별 행 */}
                <div className="flex flex-col gap-3 px-4 pb-4 pt-3">
                  {deptRows.map(({ dept, progress }) => (
                    <div key={dept} className="flex flex-col gap-1">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-medium text-slate-700 truncate">{dept}</span>
                        <span className="ml-2 shrink-0 text-xs font-semibold tabular-nums text-slate-500">
                          {progress}%
                        </span>
                      </div>
                      <div className={cn("h-1.5 w-full overflow-hidden rounded-full", style.track)}>
                        <div
                          className={cn("h-full rounded-full transition-all duration-700", style.bar, "opacity-70")}
                          style={{ width: `${progress}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
