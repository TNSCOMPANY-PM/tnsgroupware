"use client";

import { useCallback, useState } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { BarChart3, KanbanSquare } from "lucide-react";
import { TeamGanttChart, type SupabaseProjectRow } from "@/components/goals/TeamGanttChart";
import { StrategicRoadmapSection, getCurrentMonthKey } from "@/components/reports/StrategicRoadmapSection";
import { KanbanBoard } from "@/components/goals/KanbanBoard";
import { useRealtimeToast } from "@/contexts/RealtimeToastContext";
import { useSupabaseRealtime } from "@/hooks/useSupabaseRealtime";
import { createClient } from "@/utils/supabase/client";
import { cn } from "@/lib/utils";

const TABS = [
  { id: "gantt",  label: "간트 차트",  icon: BarChart3 },
  { id: "kanban", label: "칸반 보드",  icon: KanbanSquare },
] as const;

type TabId = (typeof TABS)[number]["id"];

export default function GoalsPage() {
  const [tab, setTab] = useState<TabId>("gantt");
  const { showRealtimeToast } = useRealtimeToast() ?? {};
  const { data: projects } = useSupabaseRealtime<SupabaseProjectRow>("projects", {
    onRealtime: showRealtimeToast,
  });

  const roadmapMonthKey = getCurrentMonthKey();

  const onUpdateProject = useCallback(
    async (id: string, patch: { title?: string; start_date?: string; end_date?: string; progress?: number; status?: string }) => {
      const supabase = createClient();
      if (!supabase.from) return;
      await supabase.from("projects").update(patch).eq("id", id);
    },
    []
  );

  const onDeleteProject = useCallback(async (id: string) => {
    const supabase = createClient();
    if (!supabase.from) return;
    await supabase.from("projects").delete().eq("id", id);
  }, []);

  return (
    <div className="space-y-6">
      {/* 헤더 */}
      <div>
        <h1 className="text-2xl font-bold text-[var(--foreground)]">목표</h1>
      </div>

      {/* 탭 */}
      <div className="flex gap-1 border-b border-slate-200">
        {TABS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            type="button"
            onClick={() => setTab(id)}
            className={cn(
              "flex items-center gap-2 px-4 py-2.5 text-sm font-medium transition-colors",
              tab === id
                ? "border-b-2 border-blue-600 text-blue-600"
                : "text-slate-500 hover:text-slate-700"
            )}
          >
            <Icon className="size-4" />
            {label}
          </button>
        ))}
      </div>

      {/* 간트 탭 */}
      {tab === "gantt" && (
        <>
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <BarChart3 className="size-5" />
                전략 로드맵 간트 차트
              </CardTitle>
              <CardDescription>
                전략 로드맵 및 핵심 프로젝트 일정을 한눈에 관리합니다. 행을 클릭해
                일정/진행률을 수정하면 DB에 즉시 반영됩니다.
                {projects.length > 0 && (
                  <span className="ml-1 text-[var(--primary)]">· 실시간 프로젝트 {projects.length}건</span>
                )}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <TeamGanttChart
                projectsFromSupabase={projects}
                onUpdateProject={onUpdateProject}
                onDeleteProject={onDeleteProject}
              />
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-6">
              <StrategicRoadmapSection
                roadmapMonthKey={roadmapMonthKey}
                title="전략 로드맵"
              />
            </CardContent>
          </Card>
        </>
      )}

      {/* 칸반 탭 */}
      {tab === "kanban" && (
        <div className="min-h-[60vh]">
          <KanbanBoard />
        </div>
      )}
    </div>
  );
}
