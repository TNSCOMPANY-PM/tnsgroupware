"use client";

import { useMemo, useState } from "react";
import { format, parseISO } from "date-fns";
import { ko } from "date-fns/locale";
import {
  buildContributionGrid,
  getCompletionColorClass,
  getLast30DaysTotal,
  generateDummyCompletionMap,
  type DayCompletionMap,
  type GridCell,
} from "@/utils/contributionGraph";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

type Props = {
  completionByDay?: DayCompletionMap;
  endDate?: Date;
};

const WEEKDAY_LABEL_ROWS = [0, 2, 4];
const WEEKDAY_LABELS = ["월", "수", "금"];

export function ContributionGraphWidget({
  completionByDay: propCompletion,
  endDate = new Date(),
}: Props) {
  const [hovered, setHovered] = useState<{ r: number; c: number; cell: GridCell } | null>(null);

  const completionByDay = useMemo(
    () => propCompletion ?? generateDummyCompletionMap(endDate),
    [propCompletion, endDate]
  );

  const { grid, monthLabels } = useMemo(
    () => buildContributionGrid(completionByDay, endDate),
    [completionByDay, endDate]
  );

  const last30Total = useMemo(
    () => getLast30DaysTotal(completionByDay, endDate),
    [completionByDay, endDate]
  );

  const totalWeeks = grid[0]?.length ?? 0;

  const tooltipText = hovered?.cell.dateStr
    ? `${format(parseISO(hovered.cell.dateStr), "yyyy년 M월 d일", { locale: ko })}: ${hovered.cell.count}개의 업무 완료`
    : null;

  return (
    <Card className="relative z-10 rounded-2xl border border-white/80 bg-white/70 shadow-[0_8px_30px_rgb(0,0,0,0.04)] backdrop-blur-xl transition-all duration-500 ease-out hover:shadow-[0_20px_40px_rgb(0,0,0,0.08)]">
      <CardHeader className="pb-2">
        <CardTitle className="font-sans text-slate-900">
          📈 팀 활동 지수
        </CardTitle>
        <p className="font-sans text-sm font-medium text-slate-600">
          최근 30일간 총 <span className="font-bold text-emerald-600">{last30Total}</span>개의 잔디를 심었습니다
        </p>
      </CardHeader>
      <CardContent className="relative font-sans">
        {/* 월 라벨 (상단) - 그리드 열과 동일 정렬 */}
        <div
          className="mb-1 pl-6 text-[10px] font-medium text-slate-500"
          style={{
            display: "grid",
            gridTemplateColumns: `repeat(${totalWeeks}, 14px)`,
            gap: 2,
            width: "fit-content",
          }}
        >
          {Array.from({ length: totalWeeks }, (_, c) => {
            const m = monthLabels.find((x) => x.colStart === c);
            return (
              <span key={c} className="flex h-[14px] items-center">
                {m ? m.label : ""}
              </span>
            );
          })}
        </div>

        <div className="flex gap-1">
          {/* 요일 라벨 (좌측) - 월/수/금만, 7행 그리드와 동일 높이 */}
          <div
            className="shrink-0 text-[10px] font-medium text-slate-500"
            style={{
              display: "grid",
              gridTemplateRows: "repeat(7, 14px)",
              gap: 2,
            }}
          >
            {[0, 1, 2, 3, 4, 5, 6].map((r) => (
              <span key={r} className="flex items-center">
                {WEEKDAY_LABEL_ROWS.includes(r) ? WEEKDAY_LABELS[WEEKDAY_LABEL_ROWS.indexOf(r)] : ""}
              </span>
            ))}
          </div>

          {/* 잔디 그리드 (grid-flow-col, 7행 x N열) */}
          <div
            className="relative flex-1 overflow-x-auto"
            style={{
              display: "grid",
              gridTemplateRows: "repeat(7, 14px)",
              gridAutoFlow: "column",
              gridAutoColumns: "14px",
              gap: 2,
              width: "fit-content",
              minWidth: "100%",
            }}
          >
            {grid.map((row, r) =>
              row.map((cell, c) => (
                <div
                  key={`${r}-${c}`}
                  className={cn(
                    "relative h-[14px] w-[14px] shrink-0 rounded-[3px] transition-colors",
                    getCompletionColorClass(cell.count),
                    cell.dateStr && "cursor-default"
                  )}
                  onMouseEnter={() => setHovered({ r, c, cell })}
                  onMouseLeave={() => setHovered(null)}
                  title={cell.dateStr ? `${format(parseISO(cell.dateStr), "yyyy년 M월 d일", { locale: ko })}: ${cell.count}개의 업무 완료` : undefined}
                  role="img"
                  aria-label={cell.dateStr ? `${cell.dateStr}: ${cell.count}개 완료` : undefined}
                />
              ))
            )}
          </div>
        </div>

        {/* 커스텀 툴팁 (호버 시 그리드 상단 중앙에 표시) */}
        {hovered && tooltipText && (
          <div className="pointer-events-none absolute left-1/2 top-8 z-20 -translate-x-1/2 rounded-lg border border-slate-200/80 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 shadow-lg">
            {tooltipText}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
