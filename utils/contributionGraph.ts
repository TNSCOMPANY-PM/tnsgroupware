import {
  format,
  subDays,
  startOfDay,
  getDay,
  differenceInDays,
  eachDayOfInterval,
} from "date-fns";
import { ko } from "date-fns/locale";

/** 날짜 문자열(YYYY-MM-DD) -> 해당 날 완료한 태스크/기획안 개수 */
export type DayCompletionMap = Record<string, number>;

/** 그리드 한 셀: 날짜(있으면) + 완료 수 */
export type GridCell = { dateStr: string | null; count: number };

/**
 * 기준일로부터 6개월(약 26주) 전부터 오늘까지의 기간에서
 * 그리드용 데이터를 생성합니다. (월요일 시작, 7행 x N주 열)
 */
export function buildContributionGrid(
  completionByDay: DayCompletionMap,
  endDate: Date
): { grid: GridCell[][]; weekLabels: string[]; monthLabels: { label: string; colStart: number }[] } {
  const daysBack = 26 * 7;
  const startDate = startOfDay(subDays(endDate, daysBack));
  const end = startOfDay(endDate);

  const firstMonday = new Date(startDate);
  const dow = getDay(firstMonday);
  const shift = dow === 0 ? 6 : dow - 1;
  firstMonday.setDate(firstMonday.getDate() - shift);

  const totalWeeks = Math.ceil(differenceInDays(end, firstMonday) / 7) + 1;
  const rows = 7;
  const grid: GridCell[][] = [];

  for (let r = 0; r < rows; r++) {
    const row: GridCell[] = [];
    for (let c = 0; c < totalWeeks; c++) {
      const cellDate = new Date(firstMonday);
      cellDate.setDate(firstMonday.getDate() + c * 7 + r);
      const dateStr = format(cellDate, "yyyy-MM-dd");
      const inRange =
        cellDate >= startDate && cellDate <= end;
      const count = inRange ? completionByDay[dateStr] ?? 0 : 0;
      row.push({ dateStr: inRange ? dateStr : null, count });
    }
    grid.push(row);
  }

  const weekLabels = ["월", "수", "금"];
  const monthLabels: { label: string; colStart: number }[] = [];
  let lastMonth = "";
  for (let c = 0; c < totalWeeks; c++) {
    const cellDate = new Date(firstMonday);
    cellDate.setDate(firstMonday.getDate() + c * 7);
    const m = format(cellDate, "M월", { locale: ko });
    if (m !== lastMonth) {
      monthLabels.push({ label: m, colStart: c });
      lastMonth = m;
    }
  }

  return { grid, weekLabels, monthLabels };
}

/** 완료 수에 따른 Tailwind 배경 클래스 */
export function getCompletionColorClass(count: number): string {
  if (count === 0) return "bg-slate-100";
  if (count <= 2) return "bg-emerald-200";
  if (count <= 4) return "bg-emerald-400";
  return "bg-emerald-600";
}

/**
 * 최근 6개월, 그 중 최근 3개월은 밀도 높은 더미 완료 데이터 생성
 */
export function generateDummyCompletionMap(endDate: Date): DayCompletionMap {
  const result: DayCompletionMap = {};
  const end = startOfDay(endDate);
  const sixMonthsAgo = subDays(end, 26 * 7);
  const threeMonthsAgo = subDays(end, 13 * 7);

  const days = eachDayOfInterval({ start: sixMonthsAgo, end });

  for (const d of days) {
    const dateStr = format(d, "yyyy-MM-dd");
    const isRecentThree = d >= threeMonthsAgo;
    if (isRecentThree) {
      result[dateStr] = Math.floor(Math.random() * 6) + 2;
    } else {
      result[dateStr] = Math.random() > 0.4 ? Math.floor(Math.random() * 4) : 0;
    }
  }
  return result;
}

/** 최근 30일 완료 합계 */
export function getLast30DaysTotal(completionByDay: DayCompletionMap, endDate: Date): number {
  const end = startOfDay(endDate);
  let sum = 0;
  for (let i = 0; i < 30; i++) {
    const d = subDays(end, i);
    const dateStr = format(d, "yyyy-MM-dd");
    sum += completionByDay[dateStr] ?? 0;
  }
  return sum;
}
