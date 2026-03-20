"use client";

import { useRef, useState, useMemo, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { usePermission } from "@/contexts/PermissionContext";
import { formatWonIntl } from "@/utils/formatWon";
import { Lock, FileDown, ChevronLeft, ChevronRight, Loader2 } from "lucide-react";
import { StrategicRoadmapSection, getDefaultRoadmap } from "@/components/reports/StrategicRoadmapSection";
import { createClient } from "@/utils/supabase/client";
import { loadGanttOverrides } from "@/lib/ganttStorage";
import type { RoadmapBlock } from "@/components/reports/StrategicRoadmapSection";
import { parseSurvivalAccount, type FinanceCurrentJson } from "@/lib/financeCurrent";
import { isRowInMonth, loadLedgerCustom, loadLedgerEdits, loadLedgerHidden } from "@/lib/dashboardLedgerSummary";

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

/** 보고서에서 입사자(인사 변동) 섹션 표시 여부 */
const SHOW_JOINERS_SECTION = false;

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
type EmployeeRow = { id: string; name: string; department: string; role: string; hire_date: string };
type GanttRow = { id: string; name: string; team: string; progress: number };
type LedgerApiRow = {
  id: string;
  date?: string;
  amount: number;
  senderName?: string;
  type: "DEPOSIT" | "WITHDRAWAL";
  bankName?: string;
  status: "UNMAPPED" | "PAID";
  classification?: string;
  clientName?: string;
  createdAt?: string;
};
type ReportLedgerRow = {
  id: string;
  date: string;
  amount: number;
  type: "DEPOSIT" | "WITHDRAWAL";
  status: "UNMAPPED" | "PAID";
  classification?: string;
  clientName?: string;
  senderName?: string;
  source?: "finance";
};
type ExpectedLineItem = { id: string; category: string; item: string; supplyAmount: number; vat: number; memo?: string };

const RECEIVABLES_STORAGE_KEY = "finance-receivables-expected";
const PAYABLES_STORAGE_KEY = "finance-payables-expected";

// ─────────────────────────────────────────────
// 인센티브 계산 상수 (비즈니스 규칙, 변경 시 여기만 수정)
// ─────────────────────────────────────────────
/** 인센티브 발생 기준 매출총이익 */
const BONUS_TARGET_GP = 50_000_000;
/** 초과이익 중 인센티브 풀 비율 (20%) */
const BONUS_POOL_RATE = 0.2;
/** 풀 중 경영지원(박재민) 고정 배분 비율 */
const BONUS_JAEMIN_RATE = 0.15;
/** 더널리팀 풀 내 개인 배분 비율 */
const BONUS_DN_JEONGSEOP_RATE = 0.45;   // 김정섭
const BONUS_DN_YONGJUN_RATE   = 0.275;  // 김용준
/** 팀별 목표 매출총이익 */
const BONUS_TARGET_BY_TEAM: Record<string, number> = {
  "더널리":  42_000_000,
  "티제이웹":  8_000_000,
  "기타":         0,
};

function amountToSupplyVat(amount: number): { supply: number; vat: number } {
  const supply = Math.round((Number(amount) || 0) / 1.1);
  return { supply, vat: (Number(amount) || 0) - supply };
}

function normalizeLedgerTeamLabel(classification: string | undefined): "더널리" | "티제이웹" | "기타" {
  const raw = (classification ?? "").trim();
  if (raw === "더널리" || raw === "더널리 충전") return "더널리";
  if (raw === "티제이웹" || raw === "유지보수") return "티제이웹";
  return "기타";
}

function compareLedgerTeamOrder(a: string, b: string): number {
  const order: Record<string, number> = { "더널리": 0, "티제이웹": 1, "기타": 2 };
  return (order[a] ?? 99) - (order[b] ?? 99);
}

const ROADMAP_DEPT_TO_TEAM: Record<string, string> = {
  "쇼핑/플레이스": "더널리",
  "쿠팡 & CPC": "더널리",
  "티제이웹": "티제이웹",
  "경영지원": "경영지원",
};

function roadmapToGanttRows(blocks: RoadmapBlock[], overrides: Record<string, { progress?: number; name?: string }>): GanttRow[] {
  const rows: GanttRow[] = [];
  for (const block of blocks) {
    const team = ROADMAP_DEPT_TO_TEAM[block.dept] ?? block.dept;
    for (const item of block.items) {
      const taskId = `roadmap-${block.dept}-${item.id}`;
      const ov = overrides[taskId];
      rows.push({
        id: taskId,
        name: ov?.name ?? item.text ?? "(제목 없음)",
        team,
        progress: ov?.progress !== undefined ? Math.min(100, Math.max(0, ov.progress)) : 0,
      });
    }
  }
  return rows;
}

function formatMoney(n: number): string {
  return `${formatWonIntl(n)}원`;
}

export default function ReportsPage() {
  const { isCLevel } = usePermission();
  const printRef = useRef<HTMLDivElement>(null);
  const [monthKey, setMonthKey] = useState(() => currentMonthKey());
  const [financeRows, setFinanceRows] = useState<FinanceRow[]>([]);
  const [financeRowsAll, setFinanceRowsAll] = useState<FinanceRow[]>([]);
  const [ledgerApiRows, setLedgerApiRows] = useState<LedgerApiRow[]>([]);
  const [financeData, setFinanceData] = useState<FinanceCurrentJson | null>(null);
  const [receivablesExpected, setReceivablesExpected] = useState<ExpectedLineItem[]>([]);
  const [payablesExpected, setPayablesExpected] = useState<ExpectedLineItem[]>([]);
  const [employeesRows, setEmployeesRows] = useState<EmployeeRow[]>([]);
  const [ganttRows, setGanttRows] = useState<GanttRow[]>([]);
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
      supabase.from("finance").select("id,month,type,amount,category,description,date,status,client_name,created_at"),
      supabase.from("employees").select("id,name,department,role,hire_date"),
      fetch(`/api/roadmap/${encodeURIComponent(monthKey)}`).then((r) => r.ok ? r.json() : null),
      fetch("/api/transactions/ledger").then((r) => (r.ok ? r.json() : { ledger: [] })),
      fetch("/finance-current.json").then((r) => (r.ok ? r.json() : null)),
    ])
      .then(([fRes, fAllRes, eRes, roadmapJson, ledgerRes, currentJson]) => {
        setFinanceRows((fRes.data as FinanceRow[]) ?? []);
        setFinanceRowsAll((fAllRes.data as FinanceRow[]) ?? []);
        setLedgerApiRows(Array.isArray(ledgerRes?.ledger) ? ledgerRes.ledger : []);
        setFinanceData((currentJson as FinanceCurrentJson | null) ?? null);
        const allEmps = (eRes.data as EmployeeRow[]) ?? [];
        setEmployeesRows(allEmps.filter((e) => {
          const h = e.hire_date ?? "";
          return h >= monthFirst && h <= monthLast;
        }));
        // 로드맵 → 간트 행 변환 (API 데이터 없으면 기본 로드맵 사용)
        const blocks: RoadmapBlock[] = (Array.isArray(roadmapJson?.blocks) && roadmapJson.blocks.length > 0)
          ? roadmapJson.blocks
          : getDefaultRoadmap(monthKey);
        const overrides = loadGanttOverrides(monthKey);
        setGanttRows(roadmapToGanttRows(blocks, overrides));
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [monthKey, financeMonth, monthFirst, monthLast]);

  useEffect(() => {
    try {
      const rawR = localStorage.getItem(RECEIVABLES_STORAGE_KEY);
      const rawP = localStorage.getItem(PAYABLES_STORAGE_KEY);
      if (rawR) {
        const parsed = JSON.parse(rawR) as ExpectedLineItem[];
        if (Array.isArray(parsed)) setReceivablesExpected(parsed);
      } else if (financeData?.receivablesExpected) {
        setReceivablesExpected(financeData.receivablesExpected as unknown as ExpectedLineItem[]);
      }
      if (rawP) {
        const parsed = JSON.parse(rawP) as ExpectedLineItem[];
        if (Array.isArray(parsed)) setPayablesExpected(parsed);
      } else if (financeData?.payablesExpected) {
        setPayablesExpected(financeData.payablesExpected as unknown as ExpectedLineItem[]);
      }
    } catch {
      // ignore
    }
  }, [financeData]);

  const selectedMonthLabel = useMemo(() => {
    const { y, m } = parseMonthKey(monthKey);
    return `${y}년 ${m}월`;
  }, [monthKey]);

  const ledgerFromFinance = useMemo((): ReportLedgerRow[] => {
    return financeRowsAll.map((r: FinanceRow & { date?: string; status?: string; client_name?: string | null; created_at?: string }) => {
      const rawClientName =
        r.client_name ??
        (r.description?.startsWith("입금자: ")
          ? r.description.replace("입금자: ", "")
          : r.description ?? "");
      return {
        id: r.id,
        date: r.date ?? `${r.month}-01`,
        amount: Number(r.amount) || 0,
        senderName: rawClientName,
        type: r.type === "매입" ? "WITHDRAWAL" : "DEPOSIT",
        status: (r.status === "completed" ? "PAID" : "UNMAPPED") as "UNMAPPED" | "PAID",
        classification: r.category ?? undefined,
        clientName: rawClientName || undefined,
        source: "finance",
      };
    });
  }, [financeRowsAll]);

  const ledgerSource = useMemo((): ReportLedgerRow[] => {
    const fromExcel = financeData?.ledgerEntries;
    if (fromExcel && fromExcel.length > 0) {
      return fromExcel.map((r) => ({
        id: r.id,
        date: r.date,
        amount: Number(r.amount) || 0,
        senderName: r.senderName,
        type: r.type,
        status: r.status,
        classification: r.classification,
        clientName: r.clientName,
      }));
    }
    return ledgerApiRows.map((r) => ({
      id: r.id,
      date: r.date ?? "",
      amount: Number(r.amount) || 0,
      senderName: r.senderName,
      type: r.type === "WITHDRAWAL" ? "WITHDRAWAL" : "DEPOSIT",
      status: r.status === "PAID" ? "PAID" : "UNMAPPED",
      classification: r.classification,
      clientName: r.clientName,
    }));
  }, [financeData?.ledgerEntries, ledgerApiRows]);

  const ledgerWithCustomAndEdits = useMemo(() => {
    const monthKeyIso = monthKeyToFinanceMonth(monthKey);
    const customEntries = loadLedgerCustom() as unknown as ReportLedgerRow[];
    const editsOverlay = loadLedgerEdits() as Record<string, Partial<ReportLedgerRow>>;
    const normalizeDateSig = (dateStr: string) => {
      if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
        const monthPart = dateStr.slice(0, 7);
        const dayPart = dateStr.slice(8, 10);
        return dayPart === "01" ? `${monthPart}|*` : dateStr;
      }
      if (/^\d{4}-\d{2}$/.test(dateStr)) return `${dateStr}|*`;
      return dateStr;
    };

    const financeSignatures = new Set(
      ledgerFromFinance.filter((r) => isRowInMonth(r.date, monthKeyIso)).map((r) => `${normalizeDateSig(r.date)}|${r.type}|${Number(r.amount) || 0}`)
    );
    const sourceDeduped = ledgerSource.filter((r) => {
      if (!isRowInMonth(r.date, monthKeyIso)) return true;
      const sig = `${normalizeDateSig(r.date)}|${r.type}|${Number(r.amount) || 0}`;
      return !financeSignatures.has(sig);
    });

    const merged = [...ledgerFromFinance, ...customEntries, ...sourceDeduped];
    const edited = merged.map((row) => {
      const edit = editsOverlay[row.id];
      if (!edit || Object.keys(edit).length === 0) return row;
      return { ...row, ...edit, source: row.source ?? edit.source };
    });

    const keepBySig = new Map<string, ReportLedgerRow>();
    const out: ReportLedgerRow[] = [];
    for (const row of edited) {
      if (!isRowInMonth(row.date, monthKeyIso)) {
        out.push(row);
        continue;
      }
      const sig = `${normalizeDateSig(row.date)}|${row.type}|${Number(row.amount) || 0}`;
      const prev = keepBySig.get(sig);
      if (!prev) {
        keepBySig.set(sig, row);
        continue;
      }
      const prevIsFinance = prev.source === "finance";
      const rowIsFinance = row.source === "finance";
      if (!prevIsFinance && rowIsFinance) {
        keepBySig.set(sig, row);
        continue;
      }
      if (prevIsFinance && !rowIsFinance) continue;
      const prevIsPaid = prev.status === "PAID";
      const rowIsPaid = row.status === "PAID";
      if (!prevIsPaid && rowIsPaid) keepBySig.set(sig, row);
    }
    return [...out, ...Array.from(keepBySig.values())];
  }, [monthKey, ledgerFromFinance, ledgerSource]);

  const reportMetrics = useMemo(() => {
    const monthKeyIso = monthKeyToFinanceMonth(monthKey);
    const hiddenIds = loadLedgerHidden();
    const rowsInMonthPaid = ledgerWithCustomAndEdits.filter(
      (r) => isRowInMonth(r.date, monthKeyIso) && r.status === "PAID" && !hiddenIds.has(r.id)
    );
    const revenue = rowsInMonthPaid.filter((r) => r.type === "DEPOSIT").reduce((s, r) => s + (Number(r.amount) || 0), 0);
    const purchase = rowsInMonthPaid.filter((r) => r.type === "WITHDRAWAL").reduce((s, r) => s + (Number(r.amount) || 0), 0);
    const revSv = amountToSupplyVat(revenue);
    const purSv = amountToSupplyVat(purchase);
    const currentStatus = {
      salesSupply: revSv.supply,
      salesVat: revSv.vat,
      salesTotal: revenue,
      purchaseSupply: purSv.supply,
      purchaseVat: purSv.vat,
      purchaseTotal: purchase,
      grossSupply: revSv.supply - purSv.supply,
      grossVat: revSv.vat - purSv.vat,
      grossTotal: revenue - purchase,
    };
    const receivablesSupply = receivablesExpected.reduce((s, x) => s + (Number(x.supplyAmount) || 0), 0);
    const receivablesVat = receivablesExpected.reduce((s, x) => s + (Number(x.vat) || 0), 0);
    const receivablesTotal = receivablesSupply + receivablesVat;
    const payablesSupply = payablesExpected.reduce((s, x) => s + (Number(x.supplyAmount) || 0), 0);
    const payablesVat = payablesExpected.reduce((s, x) => s + (Number(x.vat) || 0), 0);
    const payablesTotal = payablesSupply + payablesVat;
    const expectedSalesSupply = currentStatus.salesSupply + receivablesSupply;
    const expectedSalesVat = currentStatus.salesVat + receivablesVat;
    const expectedSalesTotal = currentStatus.salesTotal + receivablesTotal;
    const expectedPurchaseSupply = currentStatus.purchaseSupply + payablesSupply;
    const expectedPurchaseVat = currentStatus.purchaseVat + payablesVat;
    const expectedPurchaseTotal = currentStatus.purchaseTotal + payablesTotal;
    const expectedGrossSupply = expectedSalesSupply - expectedPurchaseSupply;
    const expectedGrossTotal = expectedSalesTotal - expectedPurchaseTotal;
    const vatOnGross = Math.round(expectedGrossSupply * 0.1);

    const carryOverRaw =
      typeof window !== "undefined" ? localStorage.getItem("finance-survival-carryover") : null;
    const carryOver =
      Number(carryOverRaw ?? parseSurvivalAccount(financeData)?.carryOverBalance ?? 0) || 0;
    const currentBalance = carryOver + revenue - purchase;
    const operatingDeduction = parseSurvivalAccount(financeData)?.operatingDeduction ?? 50_000_000;
    const expectedBalance = currentBalance + receivablesTotal - payablesTotal;
    const finalExpectedBalance = expectedBalance - operatingDeduction - vatOnGross;

    const byTeam = new Map<"더널리" | "티제이웹" | "기타", { revenue: number; cost: number }>();
    byTeam.set("더널리", { revenue: 0, cost: 0 });
    byTeam.set("티제이웹", { revenue: 0, cost: 0 });
    byTeam.set("기타", { revenue: 0, cost: 0 });
    for (const r of rowsInMonthPaid) {
      const t = normalizeLedgerTeamLabel(r.classification);
      const rec = byTeam.get(t)!;
      const amt = Number(r.amount) || 0;
      if (r.type === "DEPOSIT") rec.revenue += amt;
      else rec.cost += amt;
    }
    const teamRows = Array.from(byTeam.entries())
      .map(([team, v]) => {
        const grossProfit = v.revenue - v.cost;
        const marginRatePct = v.revenue > 0 ? (grossProfit / v.revenue) * 100 : 0;
        return { team, revenue: v.revenue, cost: v.cost, grossProfit, marginRatePct };
      })
      .sort((a, b) => compareLedgerTeamOrder(a.team, b.team));
    const targetRows = teamRows.map((t) => {
      const target = BONUS_TARGET_BY_TEAM[t.team] ?? 0;
      return { ...t, target, excessAchievement: t.grossProfit - target, achieved: t.grossProfit >= target };
    });

    const expectedGross = expectedGrossSupply;
    const excessOverTarget = Math.max(0, expectedGross - BONUS_TARGET_GP);
    const bonusPool = Math.round(excessOverTarget * BONUS_POOL_RATE);
    const jaemin = Math.round(bonusPool * BONUS_JAEMIN_RATE);
    const teamPool = bonusPool - jaemin;
    const dnGross = Math.max(0, teamRows.find((x) => x.team === "더널리")?.grossProfit ?? 0);
    const tjGross = Math.max(0, teamRows.find((x) => x.team === "티제이웹")?.grossProfit ?? 0);
    const sumGross = dnGross + tjGross;
    const dnContributionPct = sumGross > 0 ? (dnGross / sumGross) * 100 : 0;
    const tjContributionPct = sumGross > 0 ? (tjGross / sumGross) * 100 : 0;
    const tjContributionBonus = sumGross > 0 ? Math.round((teamPool * tjGross) / sumGross) : 0;
    const dnContributionBonus = teamPool - tjContributionBonus;
    const jeongseop = Math.round(dnContributionBonus * BONUS_DN_JEONGSEOP_RATE);
    const yongjun   = Math.round(dnContributionBonus * BONUS_DN_YONGJUN_RATE);
    const gyuseong  = dnContributionBonus - jeongseop - yongjun;

    return {
      expectedGrossSupply,
      expectedGrossTotal,
      currentBalance,
      expectedBalance,
      operatingDeduction,
      vatOnGross,
      finalExpectedBalance,
      teamRows,
      targetRows,
      bonus: {
        expectedGross,
        excessOverTarget,
        bonusPool,
        jaemin,
        teamPool,
        dnContributionPct,
        tjContributionPct,
        dnContributionBonus,
        tjContributionBonus,
        donggyun: tjContributionBonus,
        jeongseop,
        yongjun,
        gyuseong,
      },
    };
  }, [monthKey, ledgerWithCustomAndEdits, receivablesExpected, payablesExpected, financeData]);

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

        {/* 섹션 1: 매출보고 (finance > 매출분석과 동일 로직 연동) */}
        <section className="border-b border-slate-100 py-8">
          <h2 className="mb-6 text-lg font-semibold text-slate-800">
            🛠 {monthLabel} 매출보고
          </h2>
          <div className="mb-4 rounded-xl border border-slate-200 bg-slate-50/70 px-4 py-3 text-sm text-slate-600">
            {selectedMonthLabel} 통합 원장(PAID) 기준으로 Finance 페이지의 매출분석 수치와 동일하게 계산합니다.
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="rounded-xl border border-slate-100 bg-slate-50/50 p-4">
              <p className="text-sm font-medium text-slate-500">매출 총이익 예상 (공급가)</p>
              <p className="mt-1 text-right text-lg font-bold tabular-nums text-slate-900">
                {formatMoney(reportMetrics.expectedGrossSupply)}
              </p>
            </div>
            <div className="rounded-xl border border-slate-100 bg-slate-50/50 p-4">
              <p className="text-sm font-medium text-slate-500">매출 총이익 예상 (합산)</p>
              <p className="mt-1 text-right text-lg font-bold tabular-nums text-slate-900">
                {formatMoney(reportMetrics.expectedGrossTotal)}
              </p>
            </div>
          </div>
          <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-xl border border-slate-100 bg-slate-50/50 p-4">
              <p className="text-sm font-medium text-slate-500">현재 잔고</p>
              <p className="mt-1 text-right text-lg font-bold tabular-nums text-slate-900">{formatMoney(reportMetrics.currentBalance)}</p>
            </div>
            <div className="rounded-xl border border-slate-100 bg-slate-50/50 p-4">
              <p className="text-sm font-medium text-slate-500">예상 잔고</p>
              <p className="mt-1 text-right text-lg font-bold tabular-nums text-slate-900">{formatMoney(reportMetrics.expectedBalance)}</p>
            </div>
            <div className="rounded-xl border border-slate-100 bg-slate-50/50 p-4">
              <p className="text-sm font-medium text-slate-500">운영비 차감 + 매총 부가세</p>
              <p className="mt-1 text-right text-lg font-bold tabular-nums text-rose-700">
                -{formatMoney(reportMetrics.operatingDeduction + reportMetrics.vatOnGross)}
              </p>
            </div>
            <div className="rounded-xl border border-emerald-200 bg-emerald-50/60 p-4">
              <p className="text-sm font-medium text-emerald-800">이번달 예상 잔고</p>
              <p className="mt-1 text-right text-lg font-bold tabular-nums text-emerald-800">{formatMoney(reportMetrics.finalExpectedBalance)}</p>
            </div>
          </div>

          <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
            <div className="overflow-hidden rounded-xl border border-slate-200">
              <div className="border-b border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-700">팀별 매출총이익</div>
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-100 bg-white">
                    <th className="px-4 py-2 text-left font-medium text-slate-600">팀</th>
                    <th className="px-4 py-2 text-right font-medium text-slate-600">매출총이익</th>
                  </tr>
                </thead>
                <tbody>
                  {reportMetrics.teamRows.map((r) => (
                    <tr key={r.team} className="border-b border-slate-100">
                      <td className="px-4 py-2 font-medium text-slate-800">{r.team}</td>
                      <td className="px-4 py-2 text-right tabular-nums">{formatMoney(r.grossProfit)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="overflow-hidden rounded-xl border border-slate-200">
              <div className="border-b border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-700">목표 매출총이익 (팀별)</div>
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-100 bg-white">
                    <th className="px-4 py-2 text-left font-medium text-slate-600">팀</th>
                    <th className="px-4 py-2 text-right font-medium text-slate-600">목표</th>
                    <th className="px-4 py-2 text-right font-medium text-slate-600">초과 달성분</th>
                  </tr>
                </thead>
                <tbody>
                  {reportMetrics.targetRows.map((r) => (
                    <tr key={r.team} className="border-b border-slate-100">
                      <td className="px-4 py-2 font-medium text-slate-800">{r.team}</td>
                      <td className="px-4 py-2 text-right tabular-nums">{formatMoney(r.target)}</td>
                      <td className="px-4 py-2 text-right tabular-nums">
                        {r.excessAchievement >= 0
                          ? formatMoney(r.excessAchievement)
                          : `-${formatMoney(Math.abs(r.excessAchievement))}`}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="mt-6 overflow-hidden rounded-xl border border-slate-200">
            <div className="border-b border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-700">
              성과급 산정표
            </div>
            <div className="grid grid-cols-1 gap-4 p-4 lg:grid-cols-2">
              <div className="overflow-hidden rounded-lg border border-slate-200">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50">
                      <th className="px-3 py-2 text-left font-semibold text-slate-700">항목</th>
                      <th className="px-3 py-2 text-right font-semibold text-slate-700">금액</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr className="border-b border-slate-100">
                      <td className="px-3 py-2 text-slate-700">기준 예상 매출총이익</td>
                      <td className="px-3 py-2 text-right tabular-nums font-semibold">{formatMoney(reportMetrics.bonus.expectedGross)}</td>
                    </tr>
                    <tr className="border-b border-slate-100">
                      <td className="px-3 py-2 text-slate-700">목표(5천만원) 초과달성액</td>
                      <td className="px-3 py-2 text-right tabular-nums font-semibold">{formatMoney(reportMetrics.bonus.excessOverTarget)}</td>
                    </tr>
                    <tr className="border-b border-slate-100">
                      <td className="px-3 py-2 text-slate-700">20% 성과급 재원</td>
                      <td className="px-3 py-2 text-right tabular-nums font-semibold text-emerald-700">{formatMoney(reportMetrics.bonus.bonusPool)}</td>
                    </tr>
                    <tr className="border-b border-slate-100">
                      <td className="px-3 py-2 text-slate-700">공동기여금(15%) 박재민</td>
                      <td className="px-3 py-2 text-right tabular-nums">{formatMoney(reportMetrics.bonus.jaemin)}</td>
                    </tr>
                    <tr>
                      <td className="px-3 py-2 text-slate-700">팀별기여금(85%)</td>
                      <td className="px-3 py-2 text-right tabular-nums">{formatMoney(reportMetrics.bonus.teamPool)}</td>
                    </tr>
                  </tbody>
                </table>
              </div>

              <div className="overflow-hidden rounded-lg border border-slate-200">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50">
                      <th className="px-3 py-2 text-left font-semibold text-slate-700">이름</th>
                      <th className="px-3 py-2 text-right font-semibold text-slate-700">성과급</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr className="border-b border-slate-100">
                      <td className="px-3 py-2 text-slate-700">김정섭 (더널리 45%)</td>
                      <td className="px-3 py-2 text-right tabular-nums font-semibold">{formatMoney(reportMetrics.bonus.jeongseop)}</td>
                    </tr>
                    <tr className="border-b border-slate-100">
                      <td className="px-3 py-2 text-slate-700">김용준 (더널리 27.5%)</td>
                      <td className="px-3 py-2 text-right tabular-nums font-semibold">{formatMoney(reportMetrics.bonus.yongjun)}</td>
                    </tr>
                    <tr className="border-b border-slate-100">
                      <td className="px-3 py-2 text-slate-700">심규성 (더널리 27.5%)</td>
                      <td className="px-3 py-2 text-right tabular-nums font-semibold">{formatMoney(reportMetrics.bonus.gyuseong)}</td>
                    </tr>
                    <tr className="border-b border-slate-100">
                      <td className="px-3 py-2 text-slate-700">김동균 (티제이웹 기여)</td>
                      <td className="px-3 py-2 text-right tabular-nums font-semibold">{formatMoney(reportMetrics.bonus.donggyun)}</td>
                    </tr>
                    <tr>
                      <td className="px-3 py-2 text-slate-700">박재민 (공동기여 15%)</td>
                      <td className="px-3 py-2 text-right tabular-nums font-semibold">{formatMoney(reportMetrics.bonus.jaemin)}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>

            <div className="border-t border-slate-200 bg-slate-50/70 px-4 py-3 text-xs text-slate-600">
              팀 기여율: 티제이웹 {reportMetrics.bonus.tjContributionPct.toFixed(2)}% ({formatMoney(reportMetrics.bonus.tjContributionBonus)})
              {" · "}
              더널리 {reportMetrics.bonus.dnContributionPct.toFixed(2)}% ({formatMoney(reportMetrics.bonus.dnContributionBonus)})
            </div>
          </div>
        </section>

        {SHOW_JOINERS_SECTION && (
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
        )}

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
                {ganttRows.map((t) => (
                  <tr key={t.id} className="border-b border-slate-100">
                    <td className="px-4 py-3 font-medium text-slate-800 whitespace-nowrap">{t.team}</td>
                    <td className="px-4 py-3 text-slate-700">{t.name}</td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <div className="h-1.5 w-20 overflow-hidden rounded-full bg-slate-100">
                          <div className="h-full rounded-full bg-blue-500" style={{ width: `${t.progress}%` }} />
                        </div>
                        <span className="min-w-[2.5rem] text-right text-xs font-semibold tabular-nums text-slate-700">
                          {t.progress}%
                        </span>
                      </div>
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
