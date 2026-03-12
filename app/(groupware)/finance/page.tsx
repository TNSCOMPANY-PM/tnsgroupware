"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { formatWonIntl } from "@/utils/formatWon";
import { CountUp } from "@/components/finance/CountUp";
import { createClient } from "@/utils/supabase/client";
import {
  SAMPLE_MONTH_SUMMARY,
  SAMPLE_SURVIVAL_ACCOUNT,
  SAMPLE_CLASSIFICATION_ROWS,
  SAMPLE_TODAY_SALES,
  SAMPLE_CURRENT_STATUS,
  SAMPLE_EXPECTED_RECEIVABLES,
  SAMPLE_EXPECTED_PAYABLES,
  SAMPLE_TEAM_SALES_REPORT,
  SAMPLE_TEAM_TARGET_GP,
  OVERALL_REFUND_RATE_PCT,
  type ClassificationRow,
  type ExpectedLineItem,
  type CurrentStatus,
  type TeamSalesReportRow,
  type TeamTargetGp,
  type MonthSummary,
  type SurvivalAccount,
} from "@/constants/finance";
import { parseMonthSummary, parseSurvivalAccount, type FinanceCurrentJson } from "@/lib/financeCurrent";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Wallet,
  Target,
  CalendarDays,
  TrendingUp,
  FileSpreadsheet,
  Receipt,
  ChevronDown,
  BarChart3,
  AlertTriangle,
  Plus,
} from "lucide-react";

const SHEET_LABELS = [
  "26년 3월", "26년 2월", "26년 1월", "25년12월", "25년 11월",
  "25년 10월", "25년 9월", "25년 8월", "25년 7월", "25년 6월",
  "25년 5월", "25년 4월", "25년 3월", "25년2월", "25년1월",
];

/** "26년 3월" → "2026-03" */
function sheetLabelToMonthKey(label: string): string {
  const match = label.match(/(\d{2})년\s*(\d{1,2})월/);
  if (!match) return "";
  const y = parseInt(match[1], 10);
  const m = parseInt(match[2], 10);
  const fullYear = y >= 50 ? 1900 + y : 2000 + y;
  return `${fullYear}-${String(m).padStart(2, "0")}`;
}

type FinanceRow = {
  id: string;
  month: string;
  type: string;
  amount: number;
  category: string | null;
  description: string | null;
  created_at: string;
};

const CLASSIFICATION_OPTIONS = [
  "유지보수", "호스팅", "홈페이지", "더널리 충전", "더널리", "광고 매체", "기타",
];

const LEDGER_CUSTOM_STORAGE_KEY = "finance-ledger-custom-entries";
const LEDGER_EDITS_STORAGE_KEY = "finance-ledger-edits";

function loadLedgerCustom(): LedgerRow[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(LEDGER_CUSTOM_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function loadLedgerEdits(): Record<string, { classification?: string; clientName?: string }> {
  if (typeof window === "undefined") return {};
  try {
    const raw = localStorage.getItem(LEDGER_EDITS_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

interface LedgerRow {
  id: string;
  date: string;
  amount: number;
  senderName: string;
  type: "DEPOSIT" | "WITHDRAWAL";
  bankName: string;
  status: "UNMAPPED" | "PAID";
  classification?: string;
  clientName?: string;
  createdAt: string;
}

type ViewMode = "ledger" | "analytics";

export default function FinancePage() {
  const [selectedMonth, setSelectedMonth] = useState("26년 3월");
  const [viewMode, setViewMode] = useState<ViewMode>("ledger");
  const [ledger, setLedger] = useState<LedgerRow[]>([]);
  const [approvedGrossTotal, setApprovedGrossTotal] = useState(0);
  const [ledgerFilter, setLedgerFilter] = useState<"all" | "pending" | "approved">("all");
  const [approvingId, setApprovingId] = useState<string | null>(null);
  const [justApprovedId, setJustApprovedId] = useState<string | null>(null);
  const [receivablesExpected, setReceivablesExpected] = useState<ExpectedLineItem[]>(SAMPLE_EXPECTED_RECEIVABLES);
  const [payablesExpected, setPayablesExpected] = useState<ExpectedLineItem[]>(SAMPLE_EXPECTED_PAYABLES);
  const [financeData, setFinanceData] = useState<FinanceCurrentJson | null>(null);
  const [customEntries, setCustomEntries] = useState<LedgerRow[]>([]);
  const [editsOverlay, setEditsOverlay] = useState<Record<string, { classification?: string; clientName?: string }>>({});
  const [addLedgerOpen, setAddLedgerOpen] = useState(false);
  const [addForm, setAddForm] = useState({
    date: new Date().toISOString().slice(0, 10),
    amount: "",
    type: "DEPOSIT" as "DEPOSIT" | "WITHDRAWAL",
    senderName: "",
    bankName: "무통장",
    classification: "",
    clientName: "",
  });
  const [financeRows, setFinanceRows] = useState<FinanceRow[]>([]);

  useEffect(() => {
    setCustomEntries(loadLedgerCustom());
    setEditsOverlay(loadLedgerEdits());
  }, []);

  useEffect(() => {
    const supabase = createClient();
    if (!supabase.from) return;
    supabase
      .from("finance")
      .select("*")
      .then(({ data, error }) => {
        if (error) {
          console.error("[Finance] fetch finance", error);
          return;
        }
        setFinanceRows((data as FinanceRow[]) ?? []);
      });
  }, []);

  const summary: MonthSummary = useMemo(
    () => parseMonthSummary(financeData) ?? SAMPLE_MONTH_SUMMARY,
    [financeData]
  );
  const survival: SurvivalAccount = useMemo(
    () => parseSurvivalAccount(financeData) ?? SAMPLE_SURVIVAL_ACCOUNT,
    [financeData]
  );
  const rows = SAMPLE_CLASSIFICATION_ROWS;
  const today = SAMPLE_TODAY_SALES;

  useEffect(() => {
    fetch("/finance-current.json")
      .then((r) => r.ok ? r.json() : null)
      .then((d) => {
        const data = d as FinanceCurrentJson | null;
        setFinanceData(data);
        if (data?.receivablesExpected?.length) setReceivablesExpected(data.receivablesExpected);
        if (data?.payablesExpected?.length) setPayablesExpected(data.payablesExpected);
      })
      .catch(() => setFinanceData(null));
  }, []);

  const achievementPercent = (summary.achievementRate * 100).toFixed(1);
  const remainingDays = summary.workDays - summary.passedWorkDays;
  const dailyAvgProfit =
    summary.passedWorkDays > 0 ? summary.grossProfit / summary.passedWorkDays : 0;
  const projectedProfit = dailyAvgProfit * summary.workDays;

  const dbFinanceSummary = useMemo(() => {
    const monthKey = sheetLabelToMonthKey(selectedMonth);
    const rows = financeRows.filter((r) => r.month === monthKey);
    const revenue = rows.filter((r) => r.type === "매출").reduce((s, r) => s + Number(r.amount), 0);
    const purchase = rows.filter((r) => r.type === "매입").reduce((s, r) => s + Number(r.amount), 0);
    return { revenue, purchase, margin: revenue - purchase };
  }, [financeRows, selectedMonth]);

  const fetchLedger = useCallback(async () => {
    const res = await fetch("/api/transactions/ledger");
    const data = await res.json();
    setLedger(data.ledger || []);
    setApprovedGrossTotal(data.approvedGrossTotal ?? 0);
  }, []);

  useEffect(() => {
    fetchLedger();
  }, [fetchLedger]);

  const ledgerSource = useMemo(() => {
    const fromExcel = financeData?.ledgerEntries;
    if (fromExcel && fromExcel.length > 0) {
      return fromExcel as LedgerRow[];
    }
    return ledger;
  }, [financeData?.ledgerEntries, ledger]);

  const ledgerWithCustomAndEdits = useMemo(() => {
    const merged = [...customEntries, ...ledgerSource];
    return merged.map((row) => {
      const edit = editsOverlay[row.id];
      if (!edit) return row;
      return { ...row, classification: edit.classification ?? row.classification, clientName: edit.clientName ?? row.clientName };
    }).sort((a, b) => (b.date === a.date ? 0 : b.date > a.date ? 1 : -1));
  }, [customEntries, ledgerSource, editsOverlay]);

  const filteredLedger = useMemo(() => {
    return ledgerWithCustomAndEdits.filter((row) => {
      if (ledgerFilter === "pending") return row.status === "UNMAPPED";
      if (ledgerFilter === "approved") return row.status === "PAID";
      return true;
    });
  }, [ledgerWithCustomAndEdits, ledgerFilter]);

  const pendingCount = ledgerWithCustomAndEdits.filter((r) => r.status === "UNMAPPED").length;

  const saveCustomEntries = useCallback((entries: LedgerRow[]) => {
    setCustomEntries(entries);
    try {
      localStorage.setItem(LEDGER_CUSTOM_STORAGE_KEY, JSON.stringify(entries));
    } catch { /* ignore */ }
  }, []);

  const handleEditLedgerRow = useCallback((id: string, patch: { classification?: string; clientName?: string }) => {
    setEditsOverlay((prev) => {
      const next = { ...prev, [id]: { ...prev[id], ...patch } };
      try {
        localStorage.setItem(LEDGER_EDITS_STORAGE_KEY, JSON.stringify(next));
      } catch { /* ignore */ }
      return next;
    });
  }, []);

  const handleAddLedgerSubmit = useCallback(() => {
    const amount = Number(addForm.amount);
    if (!addForm.date || !Number.isFinite(amount) || amount <= 0) return;
    const newRow: LedgerRow = {
      id: `custom-${Date.now()}`,
      date: addForm.date,
      amount: Math.round(amount),
      senderName: addForm.senderName.trim() || "수동입력",
      type: addForm.type,
      bankName: addForm.bankName.trim() || "무통장",
      status: "PAID",
      classification: addForm.classification || undefined,
      clientName: addForm.clientName.trim() || addForm.senderName.trim() || "수동입력",
      createdAt: new Date().toISOString(),
    };
    setCustomEntries((prev) => {
      const next = [newRow, ...prev];
      try {
        localStorage.setItem(LEDGER_CUSTOM_STORAGE_KEY, JSON.stringify(next));
      } catch { /* ignore */ }
      return next;
    });
    setAddForm({
      date: new Date().toISOString().slice(0, 10),
      amount: "",
      type: "DEPOSIT",
      senderName: "",
      bankName: "무통장",
      classification: "",
      clientName: "",
    });
    setAddLedgerOpen(false);
  }, [addForm]);

  // 품목별 분석 하이라이트 (Top 이익률, 최다 계약, 환불 주의)
  const topProfitRateRow = [...rows].filter((r) => r.grossProfitRate >= 0).sort((a, b) => b.grossProfitRate - a.grossProfitRate)[0];
  const topContractRow = [...rows].sort((a, b) => b.contractCount - a.contractCount)[0];
  const refundAlertRow = [...rows].filter((r) => r.refundRate > 0).sort((a, b) => b.refundRate - a.refundRate)[0];

  const effectiveAchievement =
    summary.targetGrossProfit > 0
      ? ((summary.grossProfit + approvedGrossTotal) / summary.targetGrossProfit) * 100
      : 0;

  return (
    <div className="space-y-4">
      {/* 헤더 (컴팩트) */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="fluid-title text-xl font-bold tracking-tighter">
          (주)티앤에스컴퍼니 매출 통계
        </h1>
        <div className="flex items-center gap-2 rounded-xl border border-[var(--border)] bg-white/80 px-3 py-2 backdrop-blur-xl">
          <FileSpreadsheet className="size-4 text-slate-500" />
          <select
            value={selectedMonth}
            onChange={(e) => setSelectedMonth(e.target.value)}
            className="border-0 bg-transparent text-sm font-medium tracking-tight focus:ring-0"
          >
            {SHEET_LABELS.map((l) => (
              <option key={l} value={l}>{l}</option>
            ))}
          </select>
        </div>
      </div>

      {/* 뷰 전환: 통합 원장 vs 매출 분석 */}
      <div className="flex justify-center">
        <div className="inline-flex rounded-2xl bg-slate-100/80 p-1.5 shadow-inner">
          <button type="button" onClick={() => setViewMode("ledger")} className={`rounded-xl px-4 py-2 text-sm font-medium ${viewMode === "ledger" ? "bg-white text-[var(--primary)] shadow-sm" : "text-slate-600"}`}>
            📋 통합 원장
          </button>
          <button type="button" onClick={() => setViewMode("analytics")} className={`rounded-xl px-4 py-2 text-sm font-medium ${viewMode === "analytics" ? "bg-white text-[var(--primary)] shadow-sm" : "text-slate-600"}`}>
            📊 매출 분석
          </button>
        </div>
      </div>

      {/* DB 재무 요약 (finance 테이블) */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Card className="rounded-xl border border-slate-200/80 bg-white/80">
          <CardContent className="pt-4">
            <p className="text-xs font-medium text-slate-500">DB 매출 ({selectedMonth})</p>
            <p className="mt-1 text-lg font-bold tabular-nums text-slate-900">{formatWonIntl(dbFinanceSummary.revenue)}</p>
          </CardContent>
        </Card>
        <Card className="rounded-xl border border-slate-200/80 bg-white/80">
          <CardContent className="pt-4">
            <p className="text-xs font-medium text-slate-500">DB 매입 ({selectedMonth})</p>
            <p className="mt-1 text-lg font-bold tabular-nums text-rose-600">-{formatWonIntl(dbFinanceSummary.purchase)}</p>
          </CardContent>
        </Card>
        <Card className="rounded-xl border border-emerald-200/80 bg-emerald-50/50">
          <CardContent className="pt-4">
            <p className="text-xs font-medium text-emerald-700">DB 순이익 ({selectedMonth})</p>
            <p className="mt-1 text-lg font-bold tabular-nums text-emerald-800">{formatWonIntl(dbFinanceSummary.margin)}</p>
          </CardContent>
        </Card>
      </div>

      {viewMode === "ledger" && (
      <div className="grid grid-cols-12 gap-6 min-h-0" style={{ height: "calc(100vh - 220px)", minHeight: "420px" }}>
        {/* [좌측 col-span-8] 통합 입출금 원장 */}
        <div className="col-span-12 lg:col-span-8 flex min-h-0 flex-col rounded-2xl border border-white/40 bg-white/80 shadow-[0_8px_30px_rgb(0,0,0,0.04)] backdrop-blur-2xl overflow-hidden">
          <div className="flex-shrink-0 border-b border-slate-200/80 bg-slate-50/50 px-5 py-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="flex items-center gap-2 font-semibold text-slate-800">
                  <Receipt className="size-4 text-[var(--primary)]" />
                  통합 입출금 원장
                </h2>
                <p className="mt-0.5 text-xs text-slate-500">
                  은행 알림·매출/매입 내역 · 승인 대기 행에서 분류·고객사 선택 후 [✅ 승인]
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setAddLedgerOpen(true)}
                  className="shrink-0"
                >
                  <Plus className="size-4 mr-1" />
                  수동 추가
                </Button>
                <div className="flex rounded-xl bg-slate-100/80 p-1">
                {[
                  { key: "all" as const, label: "전체" },
                  { key: "pending" as const, label: "🚨 승인 대기", count: pendingCount },
                  { key: "approved" as const, label: "정산 완료" },
                ].map(({ key, label, count }) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setLedgerFilter(key)}
                    className={`rounded-lg px-3 py-2 text-sm font-medium tracking-tight transition-colors ${
                      ledgerFilter === key ? "bg-white text-[var(--primary)] shadow-sm" : "text-slate-600 hover:text-slate-800"
                    }`}
                  >
                    {label}
                    {count != null && count > 0 && (
                      <span className="ml-1 rounded-full bg-amber-200/80 px-1.5 py-0.5 text-xs">{count}</span>
                    )}
                  </button>
                ))}
                </div>
              </div>
            </div>
          </div>
          <div className="flex-1 min-h-0 overflow-y-auto overflow-x-auto border-t border-slate-100">
            <table className="w-full text-sm tracking-tight min-w-[640px]">
              <thead className="sticky top-0 z-10 bg-slate-50/95 backdrop-blur-sm shadow-sm">
                <tr className="border-b border-slate-200">
                  <th className="px-4 py-4 text-left font-medium text-slate-600">날짜</th>
                  <th className="px-4 py-4 text-left font-medium text-slate-600">카테고리</th>
                  <th className="px-4 py-4 text-left font-medium text-slate-600">고객사</th>
                  <th className="px-4 py-4 text-right font-medium text-slate-600">금액</th>
                  <th className="px-4 py-4 text-center font-medium text-slate-600">상태</th>
                  <th className="px-4 py-4 text-center font-medium text-slate-600">승인</th>
                </tr>
              </thead>
              <tbody>
                {filteredLedger.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-16 text-center text-slate-500">
                      {ledgerFilter === "pending" ? "승인 대기 건이 없습니다." : ledgerFilter === "approved" ? "정산 완료 건이 없습니다." : "내역이 없습니다."}
                    </td>
                  </tr>
                ) : (
                  filteredLedger.map((row) => (
                    <LedgerRowComponent
                      key={row.id}
                      row={row}
                      approvingId={approvingId}
                      justApprovedId={justApprovedId}
                      onApprove={async (classification, clientName) => {
                        if (row.id.startsWith("custom-")) {
                          setCustomEntries((prev) => {
                            const next = prev.map((e) =>
                              e.id === row.id ? { ...e, status: "PAID" as const, classification, clientName } : e
                            );
                            try {
                              localStorage.setItem(LEDGER_CUSTOM_STORAGE_KEY, JSON.stringify(next));
                            } catch { /* ignore */ }
                            return next;
                          });
                          return;
                        }
                        setApprovingId(row.id);
                        const res = await fetch(`/api/transactions/${row.id}/approve`, {
                          method: "POST",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({ classification, clientName }),
                        });
                        setApprovingId(null);
                        if (res.ok) {
                          setJustApprovedId(row.id);
                          setTimeout(() => setJustApprovedId(null), 600);
                          fetchLedger();
                        } else {
                          const err = await res.json();
                          alert(err.error || "승인 실패");
                        }
                      }}
                      onEdit={handleEditLedgerRow}
                    />
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* 수동 추가 모달 */}
        <Dialog open={addLedgerOpen} onOpenChange={setAddLedgerOpen}>
          <DialogContent className="max-w-[600px]">
            <DialogHeader>
              <DialogTitle>원장 수동 추가</DialogTitle>
            </DialogHeader>
            <div className="grid gap-4 py-2">
              <div className="grid grid-cols-2 gap-4">
                <div className="grid gap-2">
                  <Label>날짜</Label>
                  <Input
                    type="date"
                    value={addForm.date}
                    onChange={(e) => setAddForm((f) => ({ ...f, date: e.target.value }))}
                  />
                </div>
                <div className="grid gap-2">
                  <Label>금액</Label>
                  <Input
                    type="number"
                    placeholder="금액"
                    value={addForm.amount}
                    onChange={(e) => setAddForm((f) => ({ ...f, amount: e.target.value }))}
                  />
                </div>
              </div>
              <div className="grid gap-2">
                <Label>구분</Label>
                <select
                  value={addForm.type}
                  onChange={(e) => setAddForm((f) => ({ ...f, type: e.target.value as "DEPOSIT" | "WITHDRAWAL" }))}
                  className="flex h-10 w-full rounded-md border border-[var(--border)] bg-transparent px-3 py-2 text-sm"
                >
                  <option value="DEPOSIT">입금 (매출)</option>
                  <option value="WITHDRAWAL">출금 (매입)</option>
                </select>
              </div>
              <div className="grid gap-2">
                <Label>입금자/업체명</Label>
                <Input
                  placeholder="입금자 또는 업체명"
                  value={addForm.senderName}
                  onChange={(e) => setAddForm((f) => ({ ...f, senderName: e.target.value }))}
                />
              </div>
              <div className="grid gap-2">
                <Label>결제 방식</Label>
                <Input
                  placeholder="무통장, 카드 등"
                  value={addForm.bankName}
                  onChange={(e) => setAddForm((f) => ({ ...f, bankName: e.target.value }))}
                />
              </div>
              <div className="grid gap-2">
                <Label>카테고리</Label>
                <select
                  value={addForm.classification}
                  onChange={(e) => setAddForm((f) => ({ ...f, classification: e.target.value }))}
                  className="flex h-10 w-full rounded-md border border-[var(--border)] bg-transparent px-3 py-2 text-sm"
                >
                  <option value="">선택</option>
                  {CLASSIFICATION_OPTIONS.map((opt) => (
                    <option key={opt} value={opt}>{opt}</option>
                  ))}
                </select>
              </div>
              <div className="grid gap-2">
                <Label>고객사</Label>
                <Input
                  placeholder="고객사/적요"
                  value={addForm.clientName}
                  onChange={(e) => setAddForm((f) => ({ ...f, clientName: e.target.value }))}
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setAddLedgerOpen(false)}>취소</Button>
              <Button
                onClick={handleAddLedgerSubmit}
                disabled={!addForm.date || !addForm.amount || Number(addForm.amount) <= 0}
              >
                추가
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* [우측 col-span-4] 인사이트 위젯 타워 */}
        <div className="col-span-12 lg:col-span-4 flex flex-col gap-6 overflow-y-auto min-h-0">
          {/* 1. 생존 통장 & 캐시플로우 */}
          <Card className="rounded-2xl border border-amber-200/60 bg-gradient-to-br from-amber-50/80 to-orange-50/60 shadow-[0_8px_30px_rgb(0,0,0,0.04)] backdrop-blur-2xl flex-shrink-0">
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-sm font-semibold text-amber-800">
                <Wallet className="size-4" />
                생존 통장 & 캐시플로우
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex justify-between text-sm tracking-tight">
                <span className="text-slate-600">이월 잔고</span>
                <span className="font-medium">{formatWonIntl(survival.carryOverBalance)}</span>
              </div>
              <div className="flex justify-between text-sm tracking-tight">
                <span className="text-slate-600">현재 잔고</span>
                <span className="font-bold text-amber-800">{formatWonIntl(survival.currentBalance)}</span>
              </div>
              <div className="border-t border-amber-200/60 pt-3">
                <div className="flex justify-between text-sm tracking-tight">
                  <span className="font-medium text-amber-800">정산 반영 합계</span>
                  <CountUp value={approvedGrossTotal} className="font-bold text-emerald-600" />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* 2. 목표 달성률 & 영업일 예상 이익 */}
          <Card className="rounded-2xl glass-card shadow-[0_8px_30px_rgb(0,0,0,0.04)] backdrop-blur-2xl flex-shrink-0">
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-sm font-semibold">
                <Target className="size-4 text-[var(--primary)]" />
                목표 달성률 & 영업일 예상
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-baseline justify-between">
                <CountUp value={effectiveAchievement} format="percent" className="text-2xl font-bold text-[var(--primary)]" />
                <span className="text-xs text-slate-500">목표 {formatWonIntl(summary.targetGrossProfit)}</span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-slate-100">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-[var(--primary)] to-blue-400 transition-all duration-500"
                  style={{ width: `${Math.min(effectiveAchievement, 100)}%` }}
                />
              </div>
              <p className="text-sm tracking-tight text-slate-600">
                {summary.passedWorkDays}/{summary.workDays}일 진행 · 남은 {remainingDays}일
              </p>
              <p className="text-base font-bold tracking-tight text-emerald-600">
                ➡️ 월말 예상 이익: {formatWonIntl(projectedProfit)}
              </p>
            </CardContent>
          </Card>

          {/* 3. 금일 요약 */}
          <Card className="rounded-2xl glass-card shadow-[0_8px_30px_rgb(0,0,0,0.04)] backdrop-blur-2xl flex-shrink-0">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold">금일 요약</CardTitle>
              <CardDescription className="text-xs">들어온 돈 · 나간 돈 · 환불</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex justify-between text-sm tracking-tight">
                <span className="text-slate-600">현재 월 매출</span>
                <span className="font-semibold text-slate-800">{formatWonIntl(today.currentMonthRevenue)}</span>
              </div>
              <div className="flex justify-between text-sm tracking-tight">
                <span className="text-slate-600">현재 월 매입</span>
                <span className="font-semibold text-rose-500">-{formatWonIntl(today.currentMonthCost)}</span>
              </div>
              <div className="flex justify-between text-sm tracking-tight">
                <span className="text-slate-600">예상 미지급금</span>
                <span className="font-semibold text-rose-500">{formatWonIntl(today.expectedPayables)}</span>
              </div>
            </CardContent>
          </Card>

          {/* 4. 품목별 Top 3 (미니 히트맵) */}
          <Card className="rounded-2xl glass-card shadow-[0_8px_30px_rgb(0,0,0,0.04)] backdrop-blur-2xl flex-shrink-0">
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-sm font-semibold">
                <BarChart3 className="size-4 text-[var(--primary)]" />
                품목별 Top 3
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="rounded-xl border border-emerald-200/60 bg-emerald-50/50 p-3">
                <p className="text-xs font-medium text-emerald-700">이익률 1위</p>
                <p className="font-bold text-emerald-800">{topProfitRateRow?.classification ?? "-"}</p>
                <p className="text-sm font-semibold text-emerald-600">{topProfitRateRow ? `${topProfitRateRow.grossProfitRate.toFixed(1)}%` : "-"}</p>
              </div>
              <div className="rounded-xl border border-slate-200/80 bg-slate-50/50 p-3">
                <p className="text-xs font-medium text-slate-600">최다 계약</p>
                <p className="font-bold text-slate-800">{topContractRow?.classification ?? "-"}</p>
                <p className="text-sm font-semibold text-[var(--primary)]">{topContractRow?.contractCount ?? 0}건</p>
              </div>
              <div className="rounded-xl border border-rose-200/60 bg-rose-50/50 p-3">
                <p className="text-xs font-medium text-rose-700">환불 주의</p>
                <p className="font-bold text-rose-800">{refundAlertRow?.classification ?? "없음"}</p>
                <p className="text-sm font-semibold text-rose-600">{refundAlertRow ? `환불율 ${(refundAlertRow.refundRate * 100).toFixed(2)}% 🚨` : "-"}</p>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
      )}

      {/* 매출 분석 뷰: finance-current.json(엑셀 파싱) 우선, 없으면 SAMPLE */}
      {viewMode === "analytics" && (
        <SalesAnalysisView
          currentStatus={financeData?.currentStatus ?? SAMPLE_CURRENT_STATUS}
          survival={survival}
          receivablesExpected={receivablesExpected}
          setReceivablesExpected={setReceivablesExpected}
          payablesExpected={payablesExpected}
          setPayablesExpected={setPayablesExpected}
          teamSalesReport={financeData?.teamSalesReport ?? SAMPLE_TEAM_SALES_REPORT}
          teamTargetGp={financeData?.teamTargetGp ?? SAMPLE_TEAM_TARGET_GP}
          overallRefundRatePct={financeData?.overallRefundRatePct ?? OVERALL_REFUND_RATE_PCT}
        />
      )}
    </div>
  );
}

/** 매출 분석 뷰: 현재/매출예정/매입예정/마진/예상잔고/팀별 매출/목표 GP */
function SalesAnalysisView({
  currentStatus,
  survival,
  receivablesExpected,
  setReceivablesExpected,
  payablesExpected,
  setPayablesExpected,
  teamSalesReport,
  teamTargetGp,
  overallRefundRatePct,
}: {
  currentStatus: CurrentStatus;
  survival: { operatingDeduction: number; vatOnGross?: number };
  receivablesExpected: ExpectedLineItem[];
  setReceivablesExpected: React.Dispatch<React.SetStateAction<ExpectedLineItem[]>>;
  payablesExpected: ExpectedLineItem[];
  setPayablesExpected: React.Dispatch<React.SetStateAction<ExpectedLineItem[]>>;
  teamSalesReport: TeamSalesReportRow[];
  teamTargetGp: TeamTargetGp[];
  overallRefundRatePct: number;
}) {
  const receivablesTotal = receivablesExpected.reduce((s, x) => s + x.supplyAmount + x.vat, 0);
  const receivablesSupply = receivablesExpected.reduce((s, x) => s + x.supplyAmount, 0);
  const receivablesVat = receivablesExpected.reduce((s, x) => s + x.vat, 0);
  const payablesTotal = payablesExpected.reduce((s, x) => s + x.supplyAmount + x.vat, 0);
  const payablesSupply = payablesExpected.reduce((s, x) => s + x.supplyAmount, 0);
  const payablesVat = payablesExpected.reduce((s, x) => s + x.vat, 0);

  const expectedSalesTotal = currentStatus.salesTotal + receivablesTotal;
  const expectedSalesSupply = currentStatus.salesSupply + receivablesSupply;
  const expectedSalesVat = currentStatus.salesVat + receivablesVat;
  const expectedPurchaseTotal = currentStatus.purchaseTotal + payablesTotal;
  const expectedPurchaseSupply = currentStatus.purchaseSupply + payablesSupply;
  const expectedPurchaseVat = currentStatus.purchaseVat + payablesVat;
  const marginSupply = expectedSalesSupply - expectedPurchaseSupply;
  const marginVat = expectedSalesVat - expectedPurchaseVat;
  const marginTotal = expectedSalesTotal - expectedPurchaseTotal;

  const balanceAfterExpected = currentStatus.survivalBalance + receivablesTotal - payablesTotal;
  const operatingDeduction = survival.operatingDeduction ?? 50_000_000;
  // 엑셀 S11: (J21-R21)*0.1 → 매총 부가세 = (매출 공급가 - 매입 공급가) × 10%
  const vatOnGross = Math.round(marginSupply * 0.1);
  const finalExpectedBalance = balanceAfterExpected - operatingDeduction - vatOnGross;

  const totalTeamRevenue = teamSalesReport.reduce((s, x) => s + x.revenue, 0);
  const totalTeamGross = teamSalesReport.reduce((s, x) => s + x.grossProfit, 0);
  const overallMarginPct = totalTeamRevenue > 0 ? (totalTeamGross / totalTeamRevenue) * 100 : 0;

  return (
    <div className="view-fade-in space-y-6">
      {/* 현재 */}
      <Card className="overflow-hidden rounded-2xl glass-card">
        <CardHeader className="pb-2">
          <CardTitle className="text-base">현재</CardTitle>
          <CardDescription className="text-xs">매출액·매입액·매총(공급가액·부가세·합산), 생존통장 잔액</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm tracking-tight">
              <thead>
                <tr className="border-b border-slate-200/80 bg-slate-50/80">
                  <th className="px-4 py-2 text-left font-medium text-slate-600">구분</th>
                  <th className="px-3 py-2 text-left font-medium text-slate-600">항목</th>
                  <th className="px-3 py-2 text-right font-medium text-slate-600">공급가액</th>
                  <th className="px-3 py-2 text-right font-medium text-slate-600">부가세</th>
                  <th className="px-3 py-2 text-right font-medium text-slate-600">합산</th>
                  <th className="px-4 py-2 text-left font-medium text-slate-600">비고</th>
                </tr>
              </thead>
              <tbody>
                <tr className="border-b border-slate-100">
                  <td className="px-4 py-2 font-medium text-slate-800">매출액</td>
                  <td className="px-3 py-2">-</td>
                  <td className="px-3 py-2 text-right tabular-nums">{formatWonIntl(currentStatus.salesSupply)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{formatWonIntl(currentStatus.salesVat)}</td>
                  <td className="px-3 py-2 text-right tabular-nums font-medium">{formatWonIntl(currentStatus.salesTotal)}</td>
                  <td className="px-4 py-2" />
                </tr>
                <tr className="border-b border-slate-100">
                  <td className="px-4 py-2 font-medium text-slate-800">매입액</td>
                  <td className="px-3 py-2">-</td>
                  <td className="px-3 py-2 text-right tabular-nums">{formatWonIntl(currentStatus.purchaseSupply)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{formatWonIntl(currentStatus.purchaseVat)}</td>
                  <td className="px-3 py-2 text-right tabular-nums font-medium">{formatWonIntl(currentStatus.purchaseTotal)}</td>
                  <td className="px-4 py-2" />
                </tr>
                <tr className="border-b border-slate-100">
                  <td className="px-4 py-2 font-medium text-slate-800">매총</td>
                  <td className="px-3 py-2">-</td>
                  <td className="px-3 py-2 text-right tabular-nums">{formatWonIntl(currentStatus.grossSupply)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{formatWonIntl(currentStatus.grossVat)}</td>
                  <td className="px-3 py-2 text-right tabular-nums font-medium">{formatWonIntl(currentStatus.grossTotal)}</td>
                  <td className="px-4 py-2" />
                </tr>
              </tbody>
            </table>
          </div>
          <p className="px-4 py-3 text-sm font-semibold text-slate-800">
            생존통장 잔액: <span className="tabular-nums text-[var(--primary)]">{formatWonIntl(currentStatus.survivalBalance)}</span>
          </p>
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* 매출 예정액 (미수금) - 기입 가능 */}
        <Card className="overflow-hidden rounded-2xl glass-card">
          <CardHeader className="pb-2 flex flex-row items-center justify-between">
            <div>
              <CardTitle className="text-base">매출 예정액 (미수금)</CardTitle>
              <CardDescription className="text-xs">행 추가·편집으로 미수금 기입</CardDescription>
            </div>
            <button
              type="button"
              onClick={() => setReceivablesExpected((prev) => [...prev, { id: `er-${Date.now()}`, category: "매출 예정", item: "", supplyAmount: 0, vat: 0, memo: "" }])}
              className="rounded-lg bg-emerald-100 px-3 py-1.5 text-sm font-medium text-emerald-800 hover:bg-emerald-200"
            >
              + 행 추가
            </button>
          </CardHeader>
          <CardContent className="p-0">
            <ExpectedLinesTable
              rows={receivablesExpected}
              setRows={setReceivablesExpected}
              totalLabel="매출액"
              showTotalRow={false}
            />
          </CardContent>
        </Card>

        {/* 매입 예정액 (미지급금) - 기입 가능 */}
        <Card className="overflow-hidden rounded-2xl glass-card">
          <CardHeader className="pb-2 flex flex-row items-center justify-between">
            <div>
              <CardTitle className="text-base">매입 예정액 (미지급금)</CardTitle>
              <CardDescription className="text-xs">행 추가·편집으로 미지급금 기입</CardDescription>
            </div>
            <button
              type="button"
              onClick={() => setPayablesExpected((prev) => [...prev, { id: `ep-${Date.now()}`, category: "매입 예정", item: "", supplyAmount: 0, vat: 0, memo: "" }])}
              className="rounded-lg bg-rose-100 px-3 py-1.5 text-sm font-medium text-rose-800 hover:bg-rose-200"
            >
              + 행 추가
            </button>
          </CardHeader>
          <CardContent className="p-0">
            <ExpectedLinesTable
              rows={payablesExpected}
              setRows={setPayablesExpected}
              totalLabel="매입액"
              showTotalRow
            />
          </CardContent>
        </Card>
      </div>

      {/* 마진 */}
      <Card className="overflow-hidden rounded-2xl glass-card">
        <CardHeader className="pb-2">
          <CardTitle className="text-base">마진</CardTitle>
          <CardDescription className="text-xs">예상 총매출액·총매입액·마진(총이익, 매총 부가세)</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm tracking-tight">
              <thead>
                <tr className="border-b border-slate-200/80 bg-slate-50/80">
                  <th className="px-4 py-2 text-left font-medium text-slate-600">항목</th>
                  <th className="px-3 py-2 text-right font-medium text-slate-600">공급가액</th>
                  <th className="px-3 py-2 text-right font-medium text-slate-600">부가세</th>
                  <th className="px-3 py-2 text-right font-medium text-slate-600">합산</th>
                  <th className="px-4 py-2 text-left font-medium text-slate-600">비고</th>
                </tr>
              </thead>
              <tbody>
                <tr className="border-b border-slate-100">
                  <td className="px-4 py-2 font-medium text-slate-800">예상 총매출액</td>
                  <td className="px-3 py-2 text-right tabular-nums">{formatWonIntl(expectedSalesSupply)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{formatWonIntl(expectedSalesVat)}</td>
                  <td className="px-3 py-2 text-right tabular-nums font-medium">{formatWonIntl(expectedSalesTotal)}</td>
                  <td className="px-4 py-2" />
                </tr>
                <tr className="border-b border-slate-100">
                  <td className="px-4 py-2 font-medium text-slate-800">총매입액</td>
                  <td className="px-3 py-2 text-right tabular-nums">{formatWonIntl(expectedPurchaseSupply)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{formatWonIntl(expectedPurchaseVat)}</td>
                  <td className="px-3 py-2 text-right tabular-nums font-medium">{formatWonIntl(expectedPurchaseTotal)}</td>
                  <td className="px-4 py-2" />
                </tr>
                <tr className="border-b border-slate-100 bg-emerald-50/50">
                  <td className="px-4 py-2 font-semibold text-emerald-800">총이익</td>
                  <td className="px-3 py-2 text-right tabular-nums font-semibold text-emerald-700">{formatWonIntl(marginSupply)}</td>
                  <td className="px-3 py-2 text-right tabular-nums font-semibold text-emerald-700">매총 부가세 {formatWonIntl(vatOnGross)}</td>
                  <td className="px-3 py-2 text-right tabular-nums font-semibold text-emerald-700">{formatWonIntl(marginTotal)}</td>
                  <td className="px-4 py-2 text-xs text-slate-500">마진</td>
                </tr>
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* 예상 잔고 */}
      <Card className="overflow-hidden rounded-2xl glass-card">
        <CardHeader className="pb-2">
          <CardTitle className="text-base">예상 잔고</CardTitle>
          <CardDescription className="text-xs">잔액+매출예정-매입예정, 운영비·매총부가세 차감 후 최종</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm tracking-tight">
              <tbody>
                <tr className="border-b border-slate-100">
                  <td className="px-4 py-2 font-medium text-slate-800">예상 잔고</td>
                  <td className="px-3 py-2 text-right tabular-nums font-medium">{formatWonIntl(balanceAfterExpected)}</td>
                  <td className="px-4 py-2 text-xs text-slate-500">잔액+매출예정액-매입예정액</td>
                </tr>
                <tr className="border-b border-slate-100">
                  <td className="px-4 py-2 font-medium text-slate-800">운영비</td>
                  <td className="px-3 py-2 text-right tabular-nums text-rose-600">-{formatWonIntl(operatingDeduction)}</td>
                  <td className="px-4 py-2" />
                </tr>
                <tr className="border-b border-slate-100">
                  <td className="px-4 py-2 font-medium text-slate-800">매총부가세</td>
                  <td className="px-3 py-2 text-right tabular-nums text-rose-600">-{formatWonIntl(vatOnGross)}</td>
                  <td className="px-4 py-2" />
                </tr>
                <tr className="bg-slate-50/80">
                  <td className="px-4 py-3 font-semibold text-slate-800">예상 잔고</td>
                  <td className="px-3 py-3 text-right tabular-nums font-bold text-[var(--primary)]">{formatWonIntl(finalExpectedBalance)}</td>
                  <td className="px-4 py-3" />
                </tr>
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* 팀별 매출 보고 */}
        <Card className="overflow-hidden rounded-2xl glass-card">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">팀별 매출 보고</CardTitle>
            <CardDescription className="text-xs">매출액·매입액·매출총이익·팀별 매출총이익률</CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm tracking-tight">
                <thead>
                  <tr className="border-b border-slate-200/80 bg-slate-50/80">
                    <th className="px-4 py-2 text-left font-medium text-slate-600">분류</th>
                    <th className="px-3 py-2 text-right font-medium text-slate-600">매출액</th>
                    <th className="px-3 py-2 text-right font-medium text-slate-600">매입액</th>
                    <th className="px-3 py-2 text-right font-medium text-slate-600">매출총이익</th>
                    <th className="px-3 py-2 text-right font-medium text-slate-600">팀별 매출총이익률</th>
                  </tr>
                </thead>
                <tbody>
                  {teamSalesReport.map((r) => (
                    <tr key={r.team} className="border-b border-slate-100">
                      <td className="px-4 py-2 font-medium text-slate-800">{r.team}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{formatWonIntl(r.revenue)}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{formatWonIntl(r.cost)}</td>
                      <td className="px-3 py-2 text-right tabular-nums font-medium">{formatWonIntl(r.grossProfit)}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{r.marginRatePct.toFixed(2)}%</td>
                    </tr>
                  ))}
                  <tr className="border-t-2 border-slate-200/80 bg-slate-50/50 font-semibold">
                    <td className="px-4 py-2 text-slate-800">전체 매출총이익률</td>
                    <td colSpan={3} className="px-3 py-2 text-right" />
                    <td className="px-3 py-2 text-right text-[var(--primary)]">{overallMarginPct.toFixed(2)}%</td>
                  </tr>
                  <tr className="bg-slate-50/50 font-semibold">
                    <td className="px-4 py-2 text-slate-800">전체 환불율</td>
                    <td colSpan={3} className="px-3 py-2 text-right" />
                    <td className="px-3 py-2 text-right">{overallRefundRatePct}%</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>

        {/* 목표 GP (팀별) */}
        <Card className="overflow-hidden rounded-2xl glass-card">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">목표 GP (팀별)</CardTitle>
            <CardDescription className="text-xs">목표·매출총이익·초과 달성액·달성 여부</CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm tracking-tight">
                <thead>
                  <tr className="border-b border-slate-200/80 bg-slate-50/80">
                    <th className="px-4 py-2 text-left font-medium text-slate-600">분류</th>
                    <th className="px-3 py-2 text-right font-medium text-slate-600">목표</th>
                    <th className="px-3 py-2 text-right font-medium text-slate-600">매출총이익</th>
                    <th className="px-3 py-2 text-right font-medium text-slate-600">초과 달성액</th>
                    <th className="px-3 py-2 text-center font-medium text-slate-600">달성 여부</th>
                  </tr>
                </thead>
                <tbody>
                  {teamTargetGp.map((r) => (
                    <tr key={r.team} className="border-b border-slate-100">
                      <td className="px-4 py-2 font-medium text-slate-800">{r.team}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{formatWonIntl(r.target)}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{formatWonIntl(r.grossProfit)}</td>
                      <td className="px-3 py-2 text-right tabular-nums text-emerald-600 font-medium">{formatWonIntl(r.excessAchievement)}</td>
                      <td className="px-3 py-2 text-center">
                        <span className={`inline-flex rounded-lg px-2 py-0.5 text-xs font-medium ${r.achieved ? "bg-emerald-100 text-emerald-800" : "bg-rose-100 text-rose-800"}`}>
                          {r.achieved ? "달성" : "미달성"}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

/** 미수금/미지급금 기입 테이블: 행 추가·편집·삭제 */
function ExpectedLinesTable({
  rows,
  setRows,
  totalLabel,
  showTotalRow,
}: {
  rows: ExpectedLineItem[];
  setRows: React.Dispatch<React.SetStateAction<ExpectedLineItem[]>>;
  totalLabel: string;
  showTotalRow: boolean;
}) {
  const updateRow = (id: string, patch: Partial<ExpectedLineItem>) => {
    setRows((prev) =>
      prev.map((r) => {
        if (r.id !== id) return r;
        const next = { ...r, ...patch };
        if (typeof patch.supplyAmount === "number") next.vat = Math.round(patch.supplyAmount * 0.1);
        return next;
      })
    );
  };
  const removeRow = (id: string) => setRows((prev) => prev.filter((r) => r.id !== id));

  const totalSupply = rows.reduce((s, x) => s + x.supplyAmount, 0);
  const totalVat = rows.reduce((s, x) => s + x.vat, 0);
  const totalSum = totalSupply + totalVat;

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm tracking-tight">
        <thead>
          <tr className="border-b border-slate-200/80 bg-slate-50/80">
            <th className="px-2 py-2 text-left font-medium text-slate-600 w-20">구분</th>
            <th className="px-2 py-2 text-left font-medium text-slate-600">항목</th>
            <th className="px-2 py-2 text-right font-medium text-slate-600">공급가액</th>
            <th className="px-2 py-2 text-right font-medium text-slate-600">부가세</th>
            <th className="px-2 py-2 text-right font-medium text-slate-600">{totalLabel}</th>
            <th className="px-2 py-2 text-left font-medium text-slate-600">비고</th>
            <th className="px-2 py-2 w-16" />
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} className="border-b border-slate-100 hover:bg-slate-50/50">
              <td className="px-2 py-1.5">
                <input
                  value={r.category}
                  onChange={(e) => updateRow(r.id, { category: e.target.value })}
                  className="w-full min-w-0 rounded border border-slate-200 px-1.5 py-1 text-xs focus:border-[var(--primary)] focus:outline-none"
                />
              </td>
              <td className="px-2 py-1.5">
                <input
                  value={r.item}
                  onChange={(e) => updateRow(r.id, { item: e.target.value })}
                  className="w-full min-w-0 rounded border border-slate-200 px-1.5 py-1 text-xs focus:border-[var(--primary)] focus:outline-none"
                  placeholder="항목"
                />
              </td>
              <td className="px-2 py-1.5">
                <input
                  type="number"
                  value={r.supplyAmount || ""}
                  onChange={(e) => updateRow(r.id, { supplyAmount: Number(e.target.value) || 0 })}
                  className="w-28 rounded border border-slate-200 px-1.5 py-1 text-right text-xs tabular-nums focus:border-[var(--primary)] focus:outline-none"
                  placeholder="0"
                />
              </td>
              <td className="px-2 py-1.5 text-right tabular-nums text-slate-600">{formatWonIntl(r.vat)}</td>
              <td className="px-2 py-1.5 text-right tabular-nums font-medium">{formatWonIntl(r.supplyAmount + r.vat)}</td>
              <td className="px-2 py-1.5">
                <input
                  value={r.memo ?? ""}
                  onChange={(e) => updateRow(r.id, { memo: e.target.value })}
                  className="w-full min-w-0 rounded border border-slate-200 px-1.5 py-1 text-xs focus:border-[var(--primary)] focus:outline-none"
                  placeholder="비고"
                />
              </td>
              <td className="px-2 py-1.5">
                <button
                  type="button"
                  onClick={() => removeRow(r.id)}
                  className="rounded p-1 text-slate-400 hover:bg-rose-100 hover:text-rose-600"
                  title="행 삭제"
                >
                  ✕
                </button>
              </td>
            </tr>
          ))}
        </tbody>
        {showTotalRow && rows.length > 0 && (
          <tfoot>
            <tr className="border-t-2 border-slate-200/80 bg-slate-50/80 font-semibold">
              <td className="px-2 py-2" colSpan={2}>총액</td>
              <td className="px-2 py-2 text-right tabular-nums text-rose-600">{formatWonIntl(totalSupply)}</td>
              <td className="px-2 py-2 text-right tabular-nums text-rose-600">{formatWonIntl(totalVat)}</td>
              <td className="px-2 py-2 text-right tabular-nums text-rose-600">{formatWonIntl(totalSum)}</td>
              <td className="px-2 py-2" colSpan={2} />
            </tr>
          </tfoot>
        )}
      </table>
    </div>
  );
}

/** 히트맵용 행: 매출총이익률 80%+ 초록 뱃지, 환불율 로즈 배경 강도 */
function HeatmapRow({ row }: { row: ClassificationRow }) {
  const profitRateHigh = row.grossProfitRate >= 80;
  const refundPct = row.refundRate * 100;
  const hasRefund = refundPct > 0;
  const refundBgStrength = hasRefund ? Math.min(0.3 + row.refundRate * 0.7, 1) : 0;

  return (
    <tr className="border-b border-slate-100/80 transition-colors duration-200 hover:bg-white/40">
      <td className="px-4 py-2.5 font-medium text-slate-800">{row.classification}</td>
      <td className="px-3 py-2.5 text-right tabular-nums">{formatWonIntl(row.contractCount)}</td>
      <td className="px-3 py-2.5 text-right tabular-nums">{formatWonIntl(row.revenue)}</td>
      <td className="px-3 py-2.5 text-right tabular-nums">{formatWonIntl(row.avgRevenuePerContract)}</td>
      <td className="px-3 py-2.5 text-right tabular-nums">{formatWonIntl(row.costSettlement)}</td>
      <td className="px-3 py-2.5 text-right tabular-nums">{formatWonIntl(row.costRefund)}</td>
      <td
        className={`px-3 py-2.5 text-right tabular-nums ${hasRefund ? "font-bold text-rose-500" : ""}`}
        style={hasRefund ? { backgroundColor: `rgb(255 228 230 / ${refundBgStrength})` } : undefined}
      >
        {refundPct.toFixed(2)}%
      </td>
      <td className="px-3 py-2.5 text-right tabular-nums font-medium">
        {formatWonIntl(row.grossProfit)}
      </td>
      <td className="px-3 py-2.5 text-right">
        {profitRateHigh ? (
          <span className="inline-flex rounded-lg border border-emerald-200/80 bg-emerald-50/80 px-2 py-0.5 font-bold text-emerald-600">
            {row.grossProfitRate.toFixed(1)}%
          </span>
        ) : (
          <span className={row.grossProfitRate < 0 ? "font-bold text-rose-500" : "tabular-nums"}>
            {row.grossProfitRate.toFixed(1)}%
          </span>
        )}
      </td>
    </tr>
  );
}

function DataGridRow({ row }: { row: ClassificationRow }) {
  const hasRefund = row.costRefund > 0;
  const negativeProfit = row.grossProfit < 0 || row.grossProfitRate < 0;

  return (
    <tr className="border-b border-slate-100 transition-colors duration-200 hover:bg-blue-50/40">
      <td className="px-4 py-2.5 font-medium text-slate-800">{row.classification}</td>
      <td className="px-3 py-2.5 text-right tabular-nums">{formatWonIntl(row.contractCount)}</td>
      <td className="px-3 py-2.5 text-right tabular-nums">{formatWonIntl(row.revenue)}</td>
      <td className="px-3 py-2.5 text-right tabular-nums">{formatWonIntl(row.avgRevenuePerContract)}</td>
      <td className="px-3 py-2.5 text-right tabular-nums">{formatWonIntl(row.costSettlement)}</td>
      <td className={`px-3 py-2.5 text-right tabular-nums ${hasRefund ? "text-rose-500 font-medium" : "text-slate-700"}`}>
        {formatWonIntl(row.costRefund)}
      </td>
      <td className={`px-3 py-2.5 text-right tabular-nums ${hasRefund ? "text-rose-500 font-medium" : "text-slate-700"}`}>
        {(row.refundRate * 100).toFixed(2)}%
      </td>
      <td className={`px-3 py-2.5 text-right tabular-nums font-medium ${negativeProfit ? "text-rose-500" : "text-slate-800"}`}>
        {formatWonIntl(row.grossProfit)}
      </td>
      <td className={`px-3 py-2.5 text-right tabular-nums font-medium ${negativeProfit ? "text-rose-500" : "text-slate-800"}`}>
        {row.grossProfitRate.toFixed(1)}%
      </td>
    </tr>
  );
}

function LedgerRowComponent({
  row,
  approvingId,
  justApprovedId,
  onApprove,
  onEdit,
}: {
  row: LedgerRow;
  approvingId: string | null;
  justApprovedId: string | null;
  onApprove: (classification: string, clientName: string) => Promise<void>;
  onEdit?: (id: string, patch: { classification?: string; clientName?: string }) => void;
}) {
  const isPending = row.status === "UNMAPPED";
  const isApproving = approvingId === row.id;
  const justApproved = justApprovedId === row.id;
  const canEditPaid = !isPending && onEdit;

  const [classification, setClassification] = useState(row.classification ?? "");
  const [clientName, setClientName] = useState(row.clientName ?? "");
  const [showClassDropdown, setShowClassDropdown] = useState(false);
  const [showClientDropdown, setShowClientDropdown] = useState(false);

  const revenueAmount = row.type === "DEPOSIT" ? row.amount : 0;
  const costAmount = row.type === "WITHDRAWAL" ? row.amount : 0;
  const grossProfit = revenueAmount - costAmount;

  const canApprove = isPending && classification.trim() && clientName.trim();

  return (
    <tr
      className={`border-b border-slate-100 transition-all duration-300 ${
        justApproved ? "bg-white" : isPending ? "bg-amber-50/50" : "bg-transparent hover:bg-blue-50/40"
      }`}
    >
      <td className="px-4 py-4 text-slate-700">{row.date}</td>
      <td className="px-4 py-4">
        {(isPending || canEditPaid) ? (
          <div className="relative">
            <button
              type="button"
              onClick={() => {
                setShowClassDropdown((v) => !v);
                setShowClientDropdown(false);
              }}
              className="flex min-w-[100px] items-center justify-between rounded-lg border border-dashed border-slate-300 bg-white px-2 py-1.5 text-left text-slate-500 hover:border-[var(--primary)]/50 hover:text-slate-700"
            >
              {(isPending ? classification : row.classification) || "분류 선택"}
              <ChevronDown className="size-4 shrink-0" />
            </button>
            {showClassDropdown && (
              <>
                <div className="fixed inset-0 z-20" aria-hidden onClick={() => setShowClassDropdown(false)} />
                <ul className="absolute left-0 top-full z-30 mt-1 max-h-48 w-48 overflow-y-auto rounded-lg border border-slate-200 bg-white py-1 shadow-lg">
                  {CLASSIFICATION_OPTIONS.map((opt) => (
                    <li key={opt}>
                      <button
                        type="button"
                        className="w-full px-3 py-2 text-left text-sm hover:bg-slate-50"
                        onClick={() => {
                          setClassification(opt);
                          setShowClassDropdown(false);
                          if (canEditPaid && onEdit) onEdit(row.id, { classification: opt });
                        }}
                      >
                        {opt}
                      </button>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </div>
        ) : (
          <span className="text-slate-800">{row.classification || "-"}</span>
        )}
      </td>
      <td className="px-4 py-4">
        {(isPending || canEditPaid) ? (
          <div className="relative">
            <button
              type="button"
              onClick={() => {
                setShowClientDropdown((v) => !v);
                setShowClassDropdown(false);
              }}
              className="flex min-w-[120px] items-center justify-between rounded-lg border border-dashed border-slate-300 bg-white px-2 py-1.5 text-left text-slate-500 hover:border-[var(--primary)]/50 hover:text-slate-700"
            >
              {(isPending ? clientName : row.clientName) || "고객사 선택"}
              <ChevronDown className="size-4 shrink-0" />
            </button>
            {showClientDropdown && (
              <>
                <div className="fixed inset-0 z-20" aria-hidden onClick={() => setShowClientDropdown(false)} />
                <div className="absolute left-0 top-full z-30 mt-1 w-56 rounded-lg border border-slate-200 bg-white p-2 shadow-lg">
                  <input
                    type="text"
                    value={isPending ? clientName : (row.clientName ?? "")}
                    onChange={(e) => {
                      const v = e.target.value;
                      setClientName(v);
                      if (canEditPaid && onEdit) onEdit(row.id, { clientName: v });
                    }}
                    placeholder="고객사/적요 입력"
                    className="w-full rounded border border-slate-200 px-2 py-1.5 text-sm focus:border-[var(--primary)] focus:outline-none focus:ring-1 focus:ring-[var(--primary)]"
                  />
                  <p className="mt-1.5 text-xs text-slate-500">입금자: {row.senderName}</p>
                  <button
                    type="button"
                    className="mt-2 rounded bg-slate-100 px-2 py-1 text-xs hover:bg-slate-200"
                    onClick={() => {
                      setClientName(row.senderName);
                      setShowClientDropdown(false);
                      if (canEditPaid && onEdit) onEdit(row.id, { clientName: row.senderName });
                    }}
                  >
                    입금자명으로 채우기
                  </button>
                </div>
              </>
            )}
          </div>
        ) : (
          <span className="text-slate-800">{row.clientName || "-"}</span>
        )}
      </td>
      <td className="px-4 py-4 text-right tabular-nums font-medium">
        {revenueAmount > 0 ? (
          <span className="text-slate-800">+{formatWonIntl(revenueAmount)}</span>
        ) : costAmount > 0 ? (
          <span className="text-rose-500">-{formatWonIntl(costAmount)}</span>
        ) : (
          "-"
        )}
      </td>
      <td className="px-4 py-4 text-center">
        {isPending ? (
          <span className="inline-flex items-center gap-1 rounded-lg border border-amber-300/80 bg-amber-100/80 px-2.5 py-0.5 text-xs font-medium text-amber-800">
            🚨 분류 필요
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 rounded-lg border border-emerald-200/80 bg-emerald-100/80 px-2.5 py-0.5 text-xs font-medium text-emerald-800">
            ✅ 정산 완료
          </span>
        )}
      </td>
      <td className="px-4 py-4 text-center">
        {isPending ? (
          <button
            type="button"
            onClick={() => canApprove && onApprove(classification, clientName)}
            disabled={!canApprove || isApproving}
            className="rounded-lg bg-[var(--primary)] px-3 py-2 text-sm font-semibold text-white transition-all hover:bg-[var(--primary)]/90 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isApproving ? "처리 중..." : "✅ 승인"}
          </button>
        ) : (
          <span className="text-slate-400">-</span>
        )}
      </td>
    </tr>
  );
}
