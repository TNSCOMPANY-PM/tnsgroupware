"use client";

import { useState, useMemo } from "react";
import { format, parseISO } from "date-fns";
import { ko } from "date-fns/locale";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  ROADMAP_2026_QUARTERLY,
  getQuarterLabel,
  getQuarterAchievementPercent,
  getBlocksByQuarterAndMonth,
  getMonthLabel,
  getMonthsForQuarter,
  type RoadmapBlock,
  type RoadmapTeamId,
} from "@/constants/roadmap";
import { Check, Loader2, ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

const QUARTERS: (1 | 2 | 3 | 4)[] = [1, 2, 3, 4];

const TEAM_BADGE_CLASS: Record<RoadmapTeamId, string> = {
  더널리: "bg-blue-100 text-blue-700",
  티제이웹: "bg-emerald-100 text-emerald-700",
  경영지원: "bg-orange-100 text-orange-700",
};

function BlockCard({ block }: { block: RoadmapBlock }) {
  const tooltip =
    block.status === "completed" && block.completedDate
      ? `${format(parseISO(block.completedDate), "M월 d일", { locale: ko })} 완료됨`
      : undefined;

  const teamBadgeClass = TEAM_BADGE_CLASS[block.team];

  if (block.status === "completed") {
    return (
      <div
        className="flex flex-col gap-1.5 rounded-xl bg-emerald-500 px-3 py-2.5 text-white shadow-md transition-shadow hover:shadow-lg"
        title={tooltip}
      >
        <span className={cn("w-fit rounded px-1.5 py-0.5 text-[10px] font-semibold", teamBadgeClass)}>
          {block.team}
        </span>
        <div className="flex items-center gap-2">
          <Check className="size-4 shrink-0 opacity-90" />
          <span className="min-w-0 truncate text-sm font-medium">{block.name}</span>
        </div>
      </div>
    );
  }

  if (block.status === "in_progress") {
    return (
      <div className="flex flex-col gap-1.5 rounded-xl border border-blue-200 bg-blue-50 px-3 py-2.5 text-blue-700">
        <span className={cn("w-fit rounded px-1.5 py-0.5 text-[10px] font-semibold", teamBadgeClass)}>
          {block.team}
        </span>
        <div className="flex items-center gap-2">
          <Loader2 className="size-4 shrink-0 animate-spin opacity-70" />
          <span className="min-w-0 flex-1 truncate text-sm font-medium">{block.name}</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-blue-200">
            <div
              className="h-full rounded-full bg-blue-500"
              style={{ width: `${block.progress}%` }}
            />
          </div>
          <span className="w-8 text-right text-xs font-semibold tabular-nums">{block.progress}%</span>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-1.5 rounded-xl border border-dashed border-slate-200 bg-slate-50 px-3 py-2.5 text-slate-400">
      <span className={cn("w-fit rounded px-1.5 py-0.5 text-[10px] font-semibold", teamBadgeClass)}>
        {block.team}
      </span>
      <span className="min-w-0 truncate text-sm font-medium">{block.name}</span>
    </div>
  );
}

export function QuarterlyRoadmapWidget() {
  const [currentQuarter, setCurrentQuarter] = useState<1 | 2 | 3 | 4>(1);

  const monthColumns = useMemo(
    () => getBlocksByQuarterAndMonth(ROADMAP_2026_QUARTERLY, currentQuarter),
    [currentQuarter]
  );

  const [m1, m2, m3] = useMemo(() => getMonthsForQuarter(currentQuarter), [currentQuarter]);
  const achievementPercent = useMemo(
    () => getQuarterAchievementPercent(ROADMAP_2026_QUARTERLY, currentQuarter),
    [currentQuarter]
  );

  const goPrev = () => setCurrentQuarter((q) => (q === 1 ? 4 : (q - 1) as 1 | 2 | 3 | 4));
  const goNext = () => setCurrentQuarter((q) => (q === 4 ? 1 : (q + 1) as 1 | 2 | 3 | 4));

  return (
    <Card className="relative z-10 rounded-2xl border border-white/80 bg-white/80 shadow-[0_8px_30px_rgb(0,0,0,0.04)] backdrop-blur-xl transition-all duration-500 ease-out hover:shadow-[0_20px_40px_rgb(0,0,0,0.08)]">
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3 pb-2">
        <div className="flex items-center gap-3">
          <CardTitle className="text-slate-900">🎯 2026 마스터 로드맵 달성도</CardTitle>
          <nav className="flex items-center gap-1 rounded-lg border border-slate-200 bg-slate-50/80 p-0.5">
            <button
              type="button"
              onClick={goPrev}
              className="flex size-8 items-center justify-center rounded-md text-slate-500 transition-colors hover:bg-slate-200/60 hover:text-slate-800"
              aria-label="이전 분기"
            >
              <ChevronLeft className="size-5" />
            </button>
            <span className="min-w-[140px] px-2 text-center text-sm font-semibold text-slate-700">
              {getQuarterLabel(currentQuarter)}
            </span>
            <button
              type="button"
              onClick={goNext}
              className="flex size-8 items-center justify-center rounded-md text-slate-500 transition-colors hover:bg-slate-200/60 hover:text-slate-800"
              aria-label="다음 분기"
            >
              <ChevronRight className="size-5" />
            </button>
          </nav>
        </div>
        <span className="shrink-0 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700">
          {currentQuarter}분기 목표 {achievementPercent}% 달성 중
        </span>
      </CardHeader>
      <CardContent className="transition-opacity duration-200">
        <div className="grid grid-cols-3 gap-4">
          {[m1, m2, m3].map((month, colIndex) => (
            <div key={month} className="flex flex-col gap-2">
              <h4 className="text-sm font-semibold text-slate-500">
                {getMonthLabel(month)}
              </h4>
              <div className="flex flex-col gap-2">
                {monthColumns[colIndex].map((block) => (
                  <BlockCard key={block.id} block={block} />
                ))}
                {monthColumns[colIndex].length === 0 && (
                  <p className="rounded-xl border border-dashed border-slate-200 bg-slate-50/50 py-6 text-center text-xs text-slate-400">
                    해당 월 목표 없음
                  </p>
                )}
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
