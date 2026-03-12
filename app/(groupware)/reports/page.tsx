"use client";

import { useRef, useState, useMemo, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { usePermission } from "@/contexts/PermissionContext";
import { formatWonIntl } from "@/utils/formatWon";
import { Lock, FileDown, ChevronLeft, ChevronRight, Loader2 } from "lucide-react";
import { StrategicRoadmapSection } from "@/components/reports/StrategicRoadmapSection";
import { createClient } from "@/utils/supabase/client";

/** 월 키 "YY.MM" 파싱 */
function parseMonthKey(key: string): { y: number; m: number } {
  const [y, m] = key.split(".").map(Number);
  return { y: y ?? 24, m: m ?? 1 };
}

/** YY, MM → "YY.MM" */
function formatMonthKey(y: number, m: number): string {
  return `${y}.${String(m).padStart(2, "0")}`;
}

/** 이전 달 키 (최소 24.01) */
function prevMonthKey(key: string): string {
  const { y, m } = parseMonthKey(key);
  if (m === 1) return formatMonthKey(y - 1, 12);
  return formatMonthKey(y, m - 1);
}

/** 다음 달 키 (최대 현재 달) */
function nextMonthKey(key: string): string {
  const { y, m } = parseMonthKey(key);
  if (m === 12) return formatMonthKey(y + 1, 1);
  return formatMonthKey(y, m + 1);
}

/** 현재 달 키 (YY.MM) */
function currentMonthKey(): string {
  const d = new Date();
  const y = d.getFullYear() % 100;
  const m = d.getMonth() + 1;
  return formatMonthKey(y, m);
}

const MIN_MONTH_KEY = "24.01";

/** "26.02" → "2026-02" */
function monthKeyToFinanceMonth(key: string): string {
  const { y, m } = parseMonthKey(key);
  const fullYear = 2000 + Number(y);
  return `${fullYear}-${String(m).padStart(2, "0")}`;
}

/** 해당 월의 첫날·마지막날 (YYYY-MM-DD) */
function monthKeyToRange(key: string): { first: string; last: string } {
  const { y, m } = parseMonthKey(key);
  const fullYear = 2000 + Number(y);
  const first = `${fullYear}-${String(m).padStart(2, "0")}-01`;
  const lastDay = new Date(fullYear, m, 0).getDate();
  const last = `${fullYear}-${String(m).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;
  return { first, last };
}

type FinanceRow = { id: string; month: string; type: string; amount: number; category: string | null; description: string | null };
type ProjectRow = { id: string; title: string; team: string | null; status: string | null; progress: number; start_date: string | null; end_date: string | null };
type EmployeeRow = { id: string; name: string; department: string; role: string; hire_date: string };

function formatMoney(n: number): string {
  return `${formatWonIntl(n)}원`;
}

export default function ReportsPage() {
  const { isCLevel } = usePermission();
  const printRef = useRef<HTMLDivElement>(null);
  const [monthKey, setMonthKey] = useState("26.02");
  const [financeRows, setFinanceRows] = useState<FinanceRow[]>([]);
  const [projectsRows, setProjectsRows] = useState<ProjectRow[]>([]);
  const [employeesRows, setEmployeesRows] = useState<EmployeeRow[]>([]);
  const [loading, setLoading] = useState(true);

  const currentKey = useMemo(() => currentMonthKey(), []);
  const canPrev = monthKey > MIN_MONTH_KEY;
  const canNext = monthKey < currentKey;

  const title = useMemo(() => {
    return `TNS컴퍼니 ${monthKey}월 운영보고`;
  }, [monthKey]);

  const monthLabel = useMemo(() => {
    const { m } = parseMonthKey(monthKey);
    return `${String(m).padStart(2, "0")}월`;
  }, [monthKey]);

  const financeMonth = useMemo(() => monthKeyToFinanceMonth(monthKey), [monthKey]);
  const { first: monthFirst, last: monthLast } = useMemo(() => monthKeyToRange(monthKey), [monthKey]);

  useEffect(() => {
    const supabase = createClient();
    if (!supabase.from) {
      setLoading(false);
      return;
    }
    setLoading(true);
    Promise.all([
      supabase.from("finance").select("id,month,type,amount,category,description").eq("month", financeMonth),
      supabase.from("projects").select("id,title,team,status,progress,start_date,end_date"),
      supabase.from("employees").select("id,name,department,role,hire_date"),
    ])
      .then(([fRes, pRes, eRes]) => {
        setFinanceRows((fRes.data as FinanceRow[]) ?? []);
        const allProjects = (pRes.data as ProjectRow[]) ?? [];
        const inMonth = allProjects.filter((p) => {
          const start = p.start_date ?? "";
          const end = p.end_date ?? "";
          return start <= monthLast && end >= monthFirst;
        });
        setProjectsRows(inMonth);
        const allEmps = (eRes.data as EmployeeRow[]) ?? [];
        const hiredInMonth = allEmps.filter((e) => {
          const h = e.hire_date ?? "";
          return h >= monthFirst && h <= monthLast;
        });
        setEmployeesRows(hiredInMonth);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [monthKey, financeMonth, monthFirst, monthLast]);

  const reportSales = useMemo(() => {
    const rev = financeRows.filter((r) => r.type === "매출").reduce((s, r) => s + Number(r.amount), 0);
    const pur = financeRows.filter((r) => r.type === "매입").reduce((s, r) => s + Number(r.amount), 0);
    return {
      expectedTotalRevenue: rev,
      totalPurchase: pur,
      margin: rev - pur,
      marginRate: rev > 0 ? ((rev - pur) / rev) * 100 : 0,
    };
  }, [financeRows]);

  const tasksWithProgress = useMemo(
    () =>
      projectsRows.map((p) => ({
        id: p.id,
        name: p.title,
        team: p.team ?? "-",
        progress: Math.min(100, Math.max(0, p.progress ?? 0)),
      })),
    [projectsRows]
  );

  const handlePdfExport = () => {
    window.print();
  };

  if (!isCLevel) {
    return (
      <div className="flex min-h-[400px] flex-col items-center justify-center bg-slate-50">
        <div className="flex size-16 items-center justify-center rounded-full bg-[var(--muted)]">
          <Lock className="size-8 text-[var(--muted-foreground)]" />
        </div>
        <h2 className="mt-4 text-xl font-semibold">접근 권한이 없습니다</h2>
        <p className="mt-2 text-sm text-[var(--muted-foreground)]">
          C레벨 권한으로 전환 후 이용해 주세요.
        </p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex min-h-[400px] flex-col items-center justify-center bg-slate-50 gap-4">
        <Loader2 className="size-10 animate-spin text-[var(--muted-foreground)]" />
        <p className="text-sm text-[var(--muted-foreground)]">보고서 데이터 불러오는 중...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 py-8 print:bg-white print:py-0">
      <div ref={printRef} className="mx-auto max-w-5xl bg-white shadow-xl rounded-2xl p-8 print:shadow-none print:rounded-none">
        {/* 헤더 */}
        <header className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-100 pb-6 print:pb-4">
          <div className="flex min-w-0 flex-1 items-center gap-3">
            <div className="flex items-center gap-1 print:hidden">
              <Button
                variant="outline"
                size="icon"
                className="h-9 w-9 shrink-0"
                disabled={!canPrev}
                onClick={() => setMonthKey(prevMonthKey(monthKey))}
              >
                <ChevronLeft className="size-5" />
              </Button>
              <span className="min-w-[4.5rem] text-center text-sm font-semibold text-slate-700">
                {monthKey}월
              </span>
              <Button
                variant="outline"
                size="icon"
                className="h-9 w-9 shrink-0"
                disabled={!canNext}
                onClick={() => setMonthKey(nextMonthKey(monthKey))}
              >
                <ChevronRight className="size-5" />
              </Button>
            </div>
            <h1 className="text-2xl font-bold text-slate-900 truncate">
              {title}
            </h1>
          </div>
          <Button
            onClick={handlePdfExport}
            className="bg-slate-800 hover:bg-slate-900 text-white font-semibold shrink-0 print:hidden"
          >
            <FileDown className="mr-2 size-4" />
            PDF로 내보내기
          </Button>
        </header>

        {/* 섹션 1: 매출보고 (finance 테이블) */}
        <section className="border-b border-slate-100 py-8">
          <h2 className="mb-6 text-lg font-semibold text-slate-800">
            🛠 {monthLabel} 매출보고
          </h2>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <div className="rounded-xl border border-slate-100 bg-slate-50/50 p-4">
              <p className="text-sm font-medium text-slate-500">총매출액 (DB)</p>
              <p className="mt-1 text-right text-lg font-bold tabular-nums text-slate-900">
                {formatMoney(reportSales.expectedTotalRevenue)}
              </p>
            </div>
            <div className="rounded-xl border border-slate-100 bg-slate-50/50 p-4">
              <p className="text-sm font-medium text-slate-500">총매입액 (DB)</p>
              <p className="mt-1 text-right text-lg font-bold tabular-nums text-slate-900">
                {formatMoney(reportSales.totalPurchase)}
              </p>
            </div>
            <div className="rounded-xl border border-slate-100 bg-emerald-50/50 p-4">
              <p className="text-sm font-medium text-slate-600">마진 (매출총이익)</p>
              <p className="mt-1 text-right text-lg font-bold tabular-nums text-emerald-800">
                {formatMoney(reportSales.margin)}
              </p>
              <p className="mt-0.5 text-right text-sm text-emerald-700">
                매출총이익률 {reportSales.marginRate.toFixed(2)}%
              </p>
            </div>
          </div>
        </section>

        {/* 섹션 2: 인사 변동 (employees 테이블 - 해당 월 입사자) */}
        <section className="border-b border-slate-100 py-8">
          <h2 className="mb-6 text-lg font-semibold text-slate-800">
            👥 {monthLabel} 인사 변동
          </h2>
          {employeesRows.length === 0 ? (
            <p className="text-sm text-slate-500">해당 월 입사자가 없습니다.</p>
          ) : (
            <div className="overflow-hidden rounded-xl border border-slate-200">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50">
                    <th className="px-4 py-3 text-left font-semibold text-slate-700">이름</th>
                    <th className="px-4 py-3 text-left font-semibold text-slate-700">부서</th>
                    <th className="px-4 py-3 text-left font-semibold text-slate-700">직급</th>
                    <th className="px-4 py-3 text-left font-semibold text-slate-700">입사일</th>
                  </tr>
                </thead>
                <tbody>
                  {employeesRows.map((row) => (
                    <tr key={row.id} className="border-b border-slate-100">
                      <td className="px-4 py-3 font-medium text-slate-800">{row.name}</td>
                      <td className="px-4 py-3 text-slate-700">{row.department}</td>
                      <td className="px-4 py-3 text-slate-700">{row.role}</td>
                      <td className="px-4 py-3 text-slate-700">{row.hire_date}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {/* 섹션 3: 목표 진행률 (간트 차트에서 수정한 퍼센티지 반영) */}
        <section className="border-b border-slate-100 py-8">
          <h2 className="mb-6 text-lg font-semibold text-slate-800">
            📊 {monthLabel} 목표 진행률
          </h2>
          <p className="mb-4 text-sm text-slate-500">
            목표 페이지 간트 차트에서 수정한 진행률이 반영됩니다.
          </p>
          <div className="overflow-hidden rounded-xl border border-slate-200">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50">
                  <th className="px-4 py-3 text-left font-semibold text-slate-700">팀</th>
                  <th className="px-4 py-3 text-left font-semibold text-slate-700">목표 / 일정</th>
                  <th className="px-4 py-3 text-right font-semibold text-slate-700">진행률</th>
                </tr>
              </thead>
              <tbody>
                {tasksWithProgress.map((t) => (
                  <tr key={t.id} className="border-b border-slate-100">
                    <td className="px-4 py-3 font-medium text-slate-800">{t.team}</td>
                    <td className="px-4 py-3 text-slate-700">{t.name}</td>
                    <td className="px-4 py-3 text-right">
                      <span className="inline-flex items-center rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-semibold tabular-nums text-slate-800">
                        {t.progress}%
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {/* 섹션 4: 전략 로드맵 (목표 페이지에서 수정한 해당 월 데이터) */}
        <section className="py-8">
          <StrategicRoadmapSection
            roadmapMonthKey={monthKey}
            title="전략 로드맵"
          />
        </section>
      </div>
    </div>
  );
}
