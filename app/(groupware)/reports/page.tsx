"use client";

import { useRef, useState, useMemo, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { usePermission } from "@/contexts/PermissionContext";
import { formatWonIntl } from "@/utils/formatWon";
import { Lock, FileDown, ChevronLeft, ChevronRight, Loader2, Settings2, Save, X, Sparkles } from "lucide-react";
import { StrategicRoadmapSection, getDefaultRoadmap } from "@/components/reports/StrategicRoadmapSection";
import { createClient } from "@/utils/supabase/client";
import { loadGanttOverrides } from "@/lib/ganttStorage";
import type { RoadmapBlock } from "@/components/reports/StrategicRoadmapSection";
import { parseSurvivalAccount, computeExpectedBalance, type FinanceCurrentJson } from "@/lib/financeCurrent";
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

type FinanceRow = { id: string; month: string; type: string; amount: number; category: string | null; description: string | null; date?: string; status?: string; client_name?: string | null; created_at?: string };
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

const DEFAULT_BONUS_SETTINGS: Record<string, number> = {
  target_gp: 50_000_000,
  pool_rate: 0.2,
  jaemin_rate: 0.15,
  dn_jeongseop_rate: 0.45,
  dn_yongjun_rate: 0.275,
  dn_target: 42_000_000,
  tj_target: 8_000_000,
};

function amountToSupplyVat(amount: number): { supply: number; vat: number } {
  const supply = Math.round((Number(amount) || 0) / 1.1);
  return { supply, vat: (Number(amount) || 0) - supply };
}

function normalizeLedgerTeamLabel(classification: string | undefined): "더널리" | "티제이웹" | "기타" {
  const raw = (classification ?? "").trim();
  if (raw === "더널리" || raw === "더널리 충전" || raw === "더널리충전" || raw === "광고 매체" || raw === "매체비정산" || raw === "CPC정산" || raw === "환불(더널리)") return "더널리";
  if (raw === "티제이웹" || raw === "유지보수" || raw === "호스팅" || raw === "홈페이지" || raw === "환불(티제이웹)") return "티제이웹";
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

const PRINT_STYLES = `
@media print {
  @page { size: A4 portrait; margin: 2.5cm 2cm; }
  html, body {
    font-family: 'Malgun Gothic', 'Apple SD Gothic Neo', 'Noto Sans KR', sans-serif !important;
    background: #fff !important; font-size: 10pt !important; color: #111 !important;
  }
  * {
    -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important;
    box-shadow: none !important; text-shadow: none !important; border-radius: 0 !important;
  }
  #report-outer { background: #fff !important; padding: 0 !important; min-height: unset !important; }
  #report-container { max-width: 100% !important; margin: 0 !important; padding: 0 !important; background: #fff !important; }
  #print-doc-header { text-align: center; border-bottom: 2pt solid #111; padding-bottom: 10pt; margin-bottom: 18pt; }
  section { padding-top: 12pt !important; padding-bottom: 12pt !important; border-color: #ddd !important; background: transparent !important; }
  section h2 { font-size: 11.5pt !important; font-weight: 700 !important; color: #000 !important; border-bottom: 1.5pt solid #222 !important; padding-bottom: 3pt !important; margin-bottom: 10pt !important; background: transparent !important; }
  .overflow-x-auto, .overflow-hidden { overflow: visible !important; }
  table { border-collapse: collapse !important; width: 100% !important; font-size: 9pt !important; }
  th { background: #eee !important; border: 0.75pt solid #888 !important; padding: 3.5pt 6pt !important; font-weight: 600 !important; font-size: 8.5pt !important; color: #000 !important; }
  td { border: 0.75pt solid #bbb !important; padding: 3pt 6pt !important; color: #000 !important; background: #fff !important; }
  .grid > div { background: #fff !important; border-color: #bbb !important; }
  .text-slate-500, .text-slate-400 { color: #555 !important; }
  .text-slate-600, .text-slate-700, .text-slate-800, .text-slate-900 { color: #111 !important; }
  .text-emerald-700, .text-emerald-800 { color: #1a6b3a !important; }
  .text-rose-700 { color: #b91c1c !important; }
}
`;

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
  const [bonusSettings, setBonusSettings] = useState<Record<string, number>>(DEFAULT_BONUS_SETTINGS);
  const [bonusSettingsOpen, setBonusSettingsOpen] = useState(false);
  const [bonusDraft, setBonusDraft] = useState<Record<string, number>>(DEFAULT_BONUS_SETTINGS);
  const [bonusSaving, setBonusSaving] = useState(false);
  const [auditLogs, setAuditLogs] = useState<Array<{ id: string; action: string; actor_name: string | null; target_type: string | null; detail: Record<string, unknown> | null; created_at: string }>>([]);
  const [auditOpen, setAuditOpen] = useState(false);
  const [aiSummary, setAiSummary] = useState<string>("");
  const [aiSummaryLoading, setAiSummaryLoading] = useState(false);

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
      fetch("/api/finance").then((r) => r.ok ? r.json() : []),
      supabase.from("employees").select("id,name,department,role,hire_date"),
      fetch(`/api/roadmap/${encodeURIComponent(monthKey)}`).then((r) => r.ok ? r.json() : null),
      fetch("/api/transactions/ledger").then((r) => (r.ok ? r.json() : { ledger: [] })),
      fetch("/finance-current.json").then((r) => (r.ok ? r.json() : null)),
      fetch("/api/bonus/settings").then((r) => r.ok ? r.json() : null),
    ])
      .then(([fRes, fAllData, eRes, roadmapJson, ledgerRes, currentJson, bonusMap]) => {
        setFinanceRows((fRes.data as FinanceRow[]) ?? []);
        setFinanceRowsAll(Array.isArray(fAllData) ? (fAllData as FinanceRow[]) : []);
        if (bonusMap && typeof bonusMap === "object") {
          const merged = { ...DEFAULT_BONUS_SETTINGS, ...bonusMap };
          setBonusSettings(merged);
          setBonusDraft(merged);
        }
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

    const carryOverRaw =
      typeof window !== "undefined" ? localStorage.getItem("finance-survival-carryover") : null;
    const carryOver =
      Number(carryOverRaw ?? parseSurvivalAccount(financeData)?.carryOverBalance ?? 0) || 0;
    const currentBalance = carryOver + revenue - purchase;
    const operatingDeduction = parseSurvivalAccount(financeData)?.operatingDeduction ?? 50_000_000;
    const { vatOnGross, expectedBalance, finalExpectedBalance } = computeExpectedBalance({
      currentBalance,
      receivablesTotal,
      payablesTotal,
      operatingDeduction,
      grossSupply: expectedGrossSupply,
    });

    const bonusTargetByTeam: Record<string, number> = {
      "더널리": bonusSettings.dn_target ?? 42_000_000,
      "티제이웹": bonusSettings.tj_target ?? 8_000_000,
      "기타": 0,
    };

    const byTeam = new Map<"더널리" | "티제이웹" | "기타", { revenue: number; cost: number }>();
    byTeam.set("더널리", { revenue: 0, cost: 0 });
    byTeam.set("티제이웹", { revenue: 0, cost: 0 });
    byTeam.set("기타", { revenue: 0, cost: 0 });
    for (const r of rowsInMonthPaid) {
      const t = normalizeLedgerTeamLabel(r.classification);
      const rec = byTeam.get(t)!;
      const { supply } = amountToSupplyVat(Number(r.amount) || 0);
      if (r.type === "DEPOSIT") rec.revenue += supply;
      else rec.cost += supply;
    }
    const teamRows = Array.from(byTeam.entries())
      .map(([team, v]) => {
        const grossProfit = v.revenue - v.cost;
        const marginRatePct = v.revenue > 0 ? (grossProfit / v.revenue) * 100 : 0;
        return { team, revenue: v.revenue, cost: v.cost, grossProfit, marginRatePct };
      })
      .sort((a, b) => compareLedgerTeamOrder(a.team, b.team));
    const targetRows = teamRows.map((t) => {
      const target = bonusTargetByTeam[t.team] ?? 0;
      return { ...t, target, excessAchievement: t.grossProfit - target, achieved: t.grossProfit >= target };
    });

    const expectedGross = expectedGrossSupply;
    const excessOverTarget = Math.max(0, expectedGross - (bonusSettings.target_gp ?? 50_000_000));
    const bonusPool = Math.round(excessOverTarget * (bonusSettings.pool_rate ?? 0.2));
    const jaemin = Math.round(bonusPool * (bonusSettings.jaemin_rate ?? 0.15));
    const teamPool = bonusPool - jaemin;
    // 팀 기여% = 팀별 초과달성액 / 전체 초과달성액 (엑셀 방식)
    const dnExcess = Math.max(0, (teamRows.find((x) => x.team === "더널리")?.grossProfit ?? 0) - (bonusTargetByTeam["더널리"] ?? 0));
    const tjExcess = Math.max(0, (teamRows.find((x) => x.team === "티제이웹")?.grossProfit ?? 0) - (bonusTargetByTeam["티제이웹"] ?? 0));
    const sumExcess = dnExcess + tjExcess;
    const dnContributionPct = sumExcess > 0 ? (dnExcess / sumExcess) * 100 : 0;
    const tjContributionPct = sumExcess > 0 ? (tjExcess / sumExcess) * 100 : 0;
    const tjContributionBonus = sumExcess > 0 ? Math.round((teamPool * tjExcess) / sumExcess) : 0;
    const dnContributionBonus = teamPool - tjContributionBonus;
    const jeongseop = Math.round(dnContributionBonus * (bonusSettings.dn_jeongseop_rate ?? 0.45));
    const yongjun   = Math.round(dnContributionBonus * (bonusSettings.dn_yongjun_rate ?? 0.275));
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
  }, [monthKey, ledgerWithCustomAndEdits, receivablesExpected, payablesExpected, financeData, bonusSettings]);

  const handlePdfExport = () => {
    window.print();
  };

  const handleAiSummary = async () => {
    setAiSummaryLoading(true);
    try {
      const { y, m } = parseMonthKey(monthKey);
      const res = await fetch("/api/reports/ai-summary", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          monthLabel: `20${y}년 ${m}월`,
          revenue: reportMetrics.teamRows.reduce((s, t) => s + t.revenue, 0),
          purchase: reportMetrics.teamRows.reduce((s, t) => s + t.cost, 0),
          grossProfit: reportMetrics.teamRows.reduce((s, t) => s + t.grossProfit, 0),
          targetGP: bonusSettings.target_gp ?? 50_000_000,
          achievementRate: reportMetrics.expectedGrossSupply / (bonusSettings.target_gp ?? 50_000_000),
          pendingCount: ledgerWithCustomAndEdits.filter((r) => r.status === "UNMAPPED").length,
          teamRows: reportMetrics.teamRows,
        }),
      });
      const json = await res.json() as { summary?: string };
      setAiSummary(json.summary ?? "");
    } finally {
      setAiSummaryLoading(false);
    }
  };

  const handleOpenAuditLog = () => {
    setAuditOpen(true);
    fetch("/api/audit-logs?limit=100")
      .then((r) => r.ok ? r.json() : [])
      .then((rows) => setAuditLogs(Array.isArray(rows) ? rows : []))
      .catch(() => {});
  };

  const handleBonusSave = async () => {
    setBonusSaving(true);
    try {
      const res = await fetch("/api/bonus/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(bonusDraft),
      });
      if (res.ok) {
        setBonusSettings({ ...bonusDraft });
        setBonusSettingsOpen(false);
      }
    } finally {
      setBonusSaving(false);
    }
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
    <>
      <style dangerouslySetInnerHTML={{ __html: PRINT_STYLES }} />
      <div id="report-outer" className="min-h-screen bg-slate-50 py-8 print:bg-white print:py-0">
        <div id="report-container" ref={printRef} className="mx-auto max-w-5xl bg-white shadow-xl rounded-2xl p-8 print:shadow-none print:rounded-none print:p-0 print:max-w-none">
          {/* 인쇄 전용 문서 헤더 */}
          <div id="print-doc-header" className="hidden print:block">
            <p className="text-xs tracking-[0.25em] text-slate-400 uppercase mb-1">TNS Company</p>
            <p className="text-2xl font-bold text-slate-900 my-1">{title}</p>
            <p className="text-xs text-slate-500 mt-1">작성일: {new Date().toLocaleDateString("ko-KR", { year: "numeric", month: "long", day: "numeric" })}</p>
          </div>
        {/* 헤더 */}
        <header className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-100 pb-6 print:hidden">
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
          <div className="flex items-center gap-2 print:hidden">
            <Button
              onClick={handleAiSummary}
              disabled={aiSummaryLoading}
              variant="outline"
              className="shrink-0 gap-1.5"
            >
              <Sparkles className="size-4" />
              {aiSummaryLoading ? "AI 작성 중..." : "AI 요약 작성"}
            </Button>
            <Button
              onClick={handlePdfExport}
              className="bg-slate-800 hover:bg-slate-900 text-white font-semibold shrink-0"
            >
              <FileDown className="mr-2 size-4" />
              PDF로 내보내기
            </Button>
          </div>
        </header>

        {/* AI 요약 박스 */}
        {aiSummary && (
          <div className="mb-6 rounded-xl border border-violet-200 bg-violet-50 px-5 py-4 print:border-slate-300 print:bg-white">
            <div className="flex items-center gap-2 mb-2">
              <Sparkles className="size-4 text-violet-500 print:hidden" />
              <span className="text-xs font-semibold text-violet-700 print:text-slate-700">AI 현황 요약</span>
            </div>
            <p className="text-sm text-slate-700 leading-relaxed whitespace-pre-wrap">{aiSummary}</p>
          </div>
        )}

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
            <div className="overflow-x-auto rounded-xl border border-slate-200">
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

            <div className="overflow-x-auto rounded-xl border border-slate-200">
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

          <div className="mt-6 overflow-x-auto rounded-xl border border-slate-200">
            <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50 px-4 py-3">
              <span className="text-sm font-semibold text-slate-700">성과급 산정표</span>
              <button
                onClick={() => { setBonusDraft({ ...bonusSettings }); setBonusSettingsOpen((v) => !v); }}
                className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-600 hover:bg-slate-50 print:hidden"
              >
                <Settings2 className="size-3.5" />
                기준 설정
              </button>
            </div>
            {bonusSettingsOpen && (
              <div className="border-b border-slate-200 bg-amber-50/60 p-4 print:hidden">
                <div className="mb-3 flex items-center justify-between">
                  <p className="text-sm font-semibold text-amber-800">성과급 기준 설정 (C레벨 전용)</p>
                  <button onClick={() => setBonusSettingsOpen(false)}><X className="size-4 text-slate-400" /></button>
                </div>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {[
                    { key: "target_gp", label: "기준 매출총이익 (원)", isRate: false },
                    { key: "dn_target", label: "더널리팀 목표 (원)", isRate: false },
                    { key: "tj_target", label: "티제이웹팀 목표 (원)", isRate: false },
                    { key: "pool_rate", label: "인센티브 풀 비율 (%)", isRate: true },
                    { key: "jaemin_rate", label: "박재민 배분 비율 (%)", isRate: true },
                    { key: "dn_jeongseop_rate", label: "김정섭 배분 비율 (%)", isRate: true },
                    { key: "dn_yongjun_rate", label: "김용준 배분 비율 (%)", isRate: true },
                  ].map(({ key, label, isRate }) => (
                    <div key={key}>
                      <label className="mb-1 block text-xs font-medium text-slate-600">{label}</label>
                      <input
                        type="number"
                        step={isRate ? "0.1" : "1000000"}
                        value={isRate ? Math.round((bonusDraft[key] ?? 0) * 10000) / 100 : (bonusDraft[key] ?? 0)}
                        onChange={(e) => {
                          const raw = parseFloat(e.target.value) || 0;
                          setBonusDraft((prev) => ({ ...prev, [key]: isRate ? raw / 100 : raw }));
                        }}
                        className="w-full rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm tabular-nums text-slate-800 focus:outline-none focus:ring-2 focus:ring-amber-400"
                      />
                    </div>
                  ))}
                </div>
                <div className="mt-3 flex justify-end">
                  <button
                    onClick={handleBonusSave}
                    disabled={bonusSaving}
                    className="flex items-center gap-1.5 rounded-lg bg-amber-600 px-4 py-1.5 text-sm font-semibold text-white hover:bg-amber-700 disabled:opacity-60"
                  >
                    {bonusSaving ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
                    저장
                  </button>
                </div>
              </div>
            )}
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
                      <td className="px-3 py-2 text-slate-700">목표({formatMoney(bonusSettings.target_gp ?? 50_000_000)}) 초과달성액</td>
                      <td className="px-3 py-2 text-right tabular-nums font-semibold">{formatMoney(reportMetrics.bonus.excessOverTarget)}</td>
                    </tr>
                    <tr className="border-b border-slate-100">
                      <td className="px-3 py-2 text-slate-700">{Math.round((bonusSettings.pool_rate ?? 0.2) * 100)}% 성과급 재원</td>
                      <td className="px-3 py-2 text-right tabular-nums font-semibold text-emerald-700">{formatMoney(reportMetrics.bonus.bonusPool)}</td>
                    </tr>
                    <tr className="border-b border-slate-100">
                      <td className="px-3 py-2 text-slate-700">공동기여금({Math.round((bonusSettings.jaemin_rate ?? 0.15) * 100)}%) 박재민</td>
                      <td className="px-3 py-2 text-right tabular-nums">{formatMoney(reportMetrics.bonus.jaemin)}</td>
                    </tr>
                    <tr>
                      <td className="px-3 py-2 text-slate-700">팀별기여금({Math.round((1 - (bonusSettings.jaemin_rate ?? 0.15)) * 100)}%)</td>
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
                      <td className="px-3 py-2 text-slate-700">김정섭 (더널리 {Math.round((bonusSettings.dn_jeongseop_rate ?? 0.45) * 100)}%)</td>
                      <td className="px-3 py-2 text-right tabular-nums font-semibold">{formatMoney(reportMetrics.bonus.jeongseop)}</td>
                    </tr>
                    <tr className="border-b border-slate-100">
                      <td className="px-3 py-2 text-slate-700">김용준 (더널리 {((bonusSettings.dn_yongjun_rate ?? 0.275) * 100).toFixed(1)}%)</td>
                      <td className="px-3 py-2 text-right tabular-nums font-semibold">{formatMoney(reportMetrics.bonus.yongjun)}</td>
                    </tr>
                    <tr className="border-b border-slate-100">
                      <td className="px-3 py-2 text-slate-700">심규성 (더널리 {((1 - (bonusSettings.dn_jeongseop_rate ?? 0.45) - (bonusSettings.dn_yongjun_rate ?? 0.275)) * 100).toFixed(1)}%)</td>
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
                <div className="overflow-x-auto rounded-xl border border-slate-200">
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
          <div className="overflow-x-auto rounded-xl border border-slate-200">
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

        {/* 섹션 5: 감사 로그 (C레벨 전용, 인쇄 제외) */}
        <section className="border-t border-slate-100 py-6 print:hidden">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-slate-500">🔍 감사 로그 (C레벨 전용)</h2>
            <button
              onClick={handleOpenAuditLog}
              className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-100"
            >
              {auditOpen ? "닫기" : "로그 보기"}
            </button>
          </div>
          {auditOpen && (
            <div className="mt-4 overflow-x-auto rounded-xl border border-slate-200">
              {auditLogs.length === 0 ? (
                <p className="px-4 py-6 text-center text-sm text-slate-400">감사 로그가 없습니다.</p>
              ) : (
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50">
                      <th className="px-3 py-2 text-left font-semibold text-slate-600">시간</th>
                      <th className="px-3 py-2 text-left font-semibold text-slate-600">액션</th>
                      <th className="px-3 py-2 text-left font-semibold text-slate-600">수행자</th>
                      <th className="px-3 py-2 text-left font-semibold text-slate-600">대상</th>
                    </tr>
                  </thead>
                  <tbody>
                    {auditLogs.map((log) => (
                      <tr key={log.id} className="border-b border-slate-100">
                        <td className="px-3 py-2 tabular-nums text-slate-500">
                          {new Date(log.created_at).toLocaleString("ko-KR", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" })}
                        </td>
                        <td className="px-3 py-2 font-medium text-slate-700">{log.action}</td>
                        <td className="px-3 py-2 text-slate-600">{log.actor_name ?? "-"}</td>
                        <td className="px-3 py-2 text-slate-500">
                          {log.detail ? (
                            <span title={JSON.stringify(log.detail)}>
                              {(log.detail as Record<string, unknown>).title as string ?? log.target_type ?? "-"}
                            </span>
                          ) : (log.target_type ?? "-")}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}
        </section>
        </div>
      </div>
    </>
  );
}
