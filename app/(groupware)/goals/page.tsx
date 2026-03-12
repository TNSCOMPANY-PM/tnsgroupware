"use client";

import { useCallback } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { BarChart3 } from "lucide-react";
import { TeamGanttChart, type SupabaseProjectRow } from "@/components/goals/TeamGanttChart";
import { StrategicRoadmapSection, getNextMonthKey } from "@/components/reports/StrategicRoadmapSection";
import { useRealtimeToast } from "@/contexts/RealtimeToastContext";
import { useSupabaseRealtime } from "@/hooks/useSupabaseRealtime";
import { createClient } from "@/utils/supabase/client";

export default function GoalsPage() {
  const { showRealtimeToast } = useRealtimeToast() ?? {};
  const { data: projects } = useSupabaseRealtime<SupabaseProjectRow>("projects", {
    onRealtime: showRealtimeToast,
  });

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
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-[var(--foreground)]">목표</h1>
        <p className="mt-1 text-sm text-[var(--muted-foreground)]">
          팀별 월간/주간 목표 관리
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <BarChart3 className="size-5" />
            팀별 로드맵 (간트 차트)
          </CardTitle>
          <CardDescription>
            TNS 컴퍼니 핵심 프로젝트 일정을 한눈에 관리합니다. 행을 클릭해
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
            roadmapMonthKey={getNextMonthKey()}
            title="전략 로드맵"
          />
        </CardContent>
      </Card>
    </div>
  );
}
