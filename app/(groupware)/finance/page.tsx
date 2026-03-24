"use client";

import React, { useState, useEffect, useCallback, useMemo, useRef } from "react";
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
  SAMPLE_EXPECTED_RECEIVABLES,
  SAMPLE_EXPECTED_PAYABLES,
  type ClassificationRow,
  type ExpectedLineItem,
  type CurrentStatus,
  type TeamSalesReportRow,
  type TeamTargetGp,
  type MonthSummary,
  type SurvivalAccount,
} from "@/constants/finance";
import { parseMonthSummary, parseSurvivalAccount, computeExpectedBalance, type FinanceCurrentJson } from "@/lib/financeCurrent";
import { countBusinessDaysExcludingHolidays } from "@/utils/leaveCalculator";
import { parseShinhanDepositSms } from "@/lib/shinhanDepositParser";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ReceiptModal, type ReceiptData } from "@/components/finance/ReceiptModal";
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
  RefreshCw,
  Trash2,
  FileText,
} from "lucide-react";
import Link from "next/link";

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

/** row.date(YYYY-MM-DD 또는 YY-MM-DD)가 해당 monthKey(YYYY-MM)와 같은 월인지 */
function isRowInMonth(rowDate: string, monthKey: string): boolean {
  if (!rowDate || !monthKey) return false;
  const ymd = rowDate.replace(/\D/g, "");
  if (ymd.length >= 6) {
    let y: number;
    let m: number;
    if (ymd.length >= 8 && (ymd.startsWith("19") || ymd.startsWith("20"))) {
      y = parseInt(ymd.slice(0, 4), 10);
      m = parseInt(ymd.slice(4, 6), 10);
    } else {
      y = 2000 + parseInt(ymd.slice(0, 2), 10);
      m = parseInt(ymd.slice(2, 4), 10);
    }
    const rowMonth = `${y}-${String(m).padStart(2, "0")}`;
    return rowMonth === monthKey;
  }
  return false;
}

/** row.date → YYYY-MM-DD (isRowInMonth와 동일 연·월 규칙 + 일) */
function rowDateToYMD(rowDate: string): string | null {
  if (!rowDate) return null;
  const ymd = rowDate.replace(/\D/g, "");
  if (ymd.length < 6) return null;
  let y: number;
  let m: number;
  let d: number;
  if (ymd.length >= 8 && (ymd.startsWith("19") || ymd.startsWith("20"))) {
    y = parseInt(ymd.slice(0, 4), 10);
    m = parseInt(ymd.slice(4, 6), 10);
    d = parseInt(ymd.slice(6, 8), 10) || 1;
  } else {
    y = 2000 + parseInt(ymd.slice(0, 2), 10);
    m = parseInt(ymd.slice(2, 4), 10);
    d = ymd.length >= 6 ? parseInt(ymd.slice(4, 6), 10) || 1 : 1;
  }
  if (!y || !m || !d || m < 1 || m > 12 || d < 1 || d > 31) return null;
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

function isRowOnCalendarDay(rowDate: string, dayYmd: string): boolean {
  const rowYmd = rowDateToYMD(rowDate);
  return rowYmd !== null && rowYmd === dayYmd;
}

/** 매출 분석 「팀별」집계: 더널리/티제이웹/기타 3개로 병합 */
function normalizeLedgerTeamLabel(classification: string | undefined): string {
  const raw = classification?.trim();
  if (!raw) return "기타";
  if (raw === "더널리" || raw === "더널리 충전" || raw === "더널리충전" || raw === "광고 매체") return "더널리";
  if (raw === "티제이웹" || raw === "유지보수" || raw === "호스팅" || raw === "홈페이지") return "티제이웹";
  return "기타";
}

/** 팀별 표시 순서: 더널리 → 티제이웹 → 기타 */
function compareLedgerTeamOrder(a: string, b: string): number {
  const order: Record<string, number> = { "더널리": 0, "티제이웹": 1, "기타": 2 };
  return (order[a] ?? 99) - (order[b] ?? 99);
}

/** 금액(세금 포함) → 공급가액(부가세 제외) + 부가세 (10% 가정) */
function amountToSupplyVat(amount: number): { supply: number; vat: number } {
  const supply = Math.round(amount / 1.1);
  return { supply, vat: amount - supply };
}

/** 해당 월 영업일 수 (주말·공휴일 제외) */
function getWorkDaysInMonth(year: number, month: number): number {
  const first = new Date(year, month - 1, 1);
  const last = new Date(year, month, 0);
  return countBusinessDaysExcludingHolidays(first, last);
}

/** 해당 월 1일 ~ 오늘까지 영업일 수 (주말·공휴일 제외) */
function getPassedWorkDaysInMonth(year: number, month: number): number {
  const now = new Date();
  const first = new Date(year, month - 1, 1);
  const last = new Date(year, month, 0);
  if (now < first) return 0;
  const end = now > last ? last : new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return countBusinessDaysExcludingHolidays(first, end);
}

type FinanceRow = {
  id: string;
  month: string;
  type: string;
  amount: number;
  category: string | null;
  description: string | null;
  created_at: string;
  status?: "pending" | "completed";
  client_name?: string | null;
  date?: string | null;
  receipt_data?: import("@/components/finance/ReceiptModal").ReceiptData | null;
};

const CLASSIFICATION_OPTIONS = [
  "더널리", "더널리 충전", "티제이웹", "기타",
];

const LEDGER_CUSTOM_STORAGE_KEY = "finance-ledger-custom-entries";
const LEDGER_EDITS_STORAGE_KEY = "finance-ledger-edits";
const LEDGER_HIDDEN_STORAGE_KEY = "finance-ledger-hidden-ids";
const SURVIVAL_CARRYOVER_STORAGE_KEY = "finance-survival-carryover";
const RECEIVABLES_STORAGE_KEY = "finance-receivables-expected";
const PAYABLES_STORAGE_KEY = "finance-payables-expected";

function loadLedgerHidden(): Set<string> {
  if (typeof window === "undefined") return new Set();
  try {
    const raw = localStorage.getItem(LEDGER_HIDDEN_STORAGE_KEY);
    if (!raw) return new Set();
    const parsed = JSON.parse(raw);
    return new Set(Array.isArray(parsed) ? parsed : []);
  } catch {
    return new Set();
  }
}

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

function loadLedgerEdits(): Record<string, Partial<LedgerRow>> {
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
  description?: string;
  createdAt: string;
  /** DB finance 테이블 행이면 'finance' (승인 시 Supabase update) */
  source?: "finance";
}

type ViewMode = "ledger" | "analytics";

export default function FinancePage() {
  const supabaseRef = useRef<ReturnType<typeof createClient> | null>(null);
  const getSupabase = useCallback(() => {
    if (!supabaseRef.current) supabaseRef.current = createClient();
    return supabaseRef.current;
  }, []);

  const [selectedMonth, setSelectedMonth] = useState("26년 3월");
  const [viewMode, setViewMode] = useState<ViewMode>("ledger");
  const [ledger, setLedger] = useState<LedgerRow[]>([]);
  const [ledgerFilter, setLedgerFilter] = useState<"all" | "pending" | "approved">("all");
  const [approvingId, setApprovingId] = useState<string | null>(null);
  const [justApprovedId, setJustApprovedId] = useState<string | null>(null);
  const [receivablesExpected, setReceivablesExpected] = useState<ExpectedLineItem[]>(SAMPLE_EXPECTED_RECEIVABLES);
  const [payablesExpected, setPayablesExpected] = useState<ExpectedLineItem[]>(SAMPLE_EXPECTED_PAYABLES);
  const [financeData, setFinanceData] = useState<FinanceCurrentJson | null>(null);
  const receivablesLoadedRef = useRef(false);
  const payablesLoadedRef = useRef(false);
  const [customEntries, setCustomEntries] = useState<LedgerRow[]>([]);
  const [editsOverlay, setEditsOverlay] = useState<Record<string, Partial<LedgerRow>>>({});
  const [addLedgerOpen, setAddLedgerOpen] = useState(false);
  const [editLedgerRow, setEditLedgerRow] = useState<LedgerRow | null>(null);
  const [syncLoading, setSyncLoading] = useState(false);
  const [syncToast, setSyncToast] = useState<string | null>(null);
  const [receiptTarget, setReceiptTarget] = useState<FinanceRow | null>(null);
  type AddFormType = "DEPOSIT" | "WITHDRAWAL" | "RECEIVABLE" | "PAYABLE";
  const [addForm, setAddForm] = useState({
    date: new Date().toISOString().slice(0, 10),
    amount: "",
    type: "DEPOSIT" as AddFormType,
    senderName: "",
    bankName: "무통장",
    classification: "",
    clientName: "",
  });
  const [financeRows, setFinanceRows] = useState<FinanceRow[]>([]);
  const [smsOpen, setSmsOpen] = useState(false);
  const [smsText, setSmsText] = useState("");
  const [smsParsed, setSmsParsed] = useState<{ date: string; amount: number; client_name: string } | null>(null);
  const [smsSaving, setSmsSaving] = useState(false);
  const [crmClients, setCrmClients] = useState<{ id: string; name: string; aliases: string[]; representative?: string | null }[]>([]);
  const [autoMapping, setAutoMapping] = useState(false);
  const [autoMapMsg, setAutoMapMsg] = useState<string | null>(null);
  const [ledgerDateFrom, setLedgerDateFrom] = useState<string>("");
  const [ledgerDateTo, setLedgerDateTo] = useState<string>("");

  const [hiddenIds, setHiddenIds] = useState<Set<string>>(new Set());
  const [carryOverBalance, setCarryOverBalance] = useState<number>(0);
  const [carryOverTouched, setCarryOverTouched] = useState(false);

  const carryLoadedFromStorage = useRef(false);
  useEffect(() => {
    // 수동 항목: API에서 로드, 실패 시 localStorage 폴백
    fetch("/api/finance/custom")
      .then((r) => r.ok ? r.json() : null)
      .then((rows: Record<string, unknown>[] | null) => {
        if (rows && Array.isArray(rows) && rows.length > 0) {
          setCustomEntries(rows.map((r) => ({
            id: String(r.id ?? ""),
            date: String(r.date ?? ""),
            amount: Number(r.amount) || 0,
            senderName: String(r.sender_name ?? "수동입력"),
            type: (r.type === "WITHDRAWAL" ? "WITHDRAWAL" : "DEPOSIT") as "DEPOSIT" | "WITHDRAWAL",
            bankName: String(r.bank_name ?? "무통장"),
            status: (r.status === "PAID" ? "PAID" : "UNMAPPED") as "UNMAPPED" | "PAID",
            classification: r.classification ? String(r.classification) : undefined,
            clientName: r.client_name ? String(r.client_name) : undefined,
            description: r.description ? String(r.description) : undefined,
            createdAt: String(r.created_at ?? new Date().toISOString()),
            source: undefined,
          })));
        } else {
          setCustomEntries(loadLedgerCustom());
        }
      })
      .catch(() => setCustomEntries(loadLedgerCustom()));
    fetch("/api/clients").then((r) => r.ok ? r.json() : []).then((data: { id: string; name: string; aliases: string[]; representative?: string | null }[]) => {
      if (Array.isArray(data)) setCrmClients(data);
    }).catch(() => {});
    setEditsOverlay(loadLedgerEdits());
    setHiddenIds(loadLedgerHidden());
    try {
      const raw = localStorage.getItem(SURVIVAL_CARRYOVER_STORAGE_KEY);
      if (raw != null && raw !== "") {
        const n = Number(raw);
        if (Number.isFinite(n)) {
          setCarryOverBalance(n);
          carryLoadedFromStorage.current = true;
        }
      }
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    if (carryOverTouched || carryLoadedFromStorage.current) return;
    const parsed = parseSurvivalAccount(financeData);
    if (parsed && Number.isFinite(parsed.carryOverBalance)) setCarryOverBalance(parsed.carryOverBalance);
  }, [financeData, carryOverTouched]);

  // SMS 텍스트 변경 시 실시간 파싱
  const handleSmsChange = (text: string) => {
    setSmsText(text);
    setSmsParsed(parseShinhanDepositSms(text));
  };

  // SMS 파싱 결과를 DB에 저장
  const handleSmsSave = async () => {
    if (!smsParsed) return;
    setSmsSaving(true);
    try {
      const res = await fetch("/api/webhook/deposit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sms_text: smsText }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) {
        alert(`등록 실패: ${json.error ?? res.status}`);
        return;
      }
      setSmsOpen(false);
      setSmsText("");
      setSmsParsed(null);
      await fetchFinanceRows();
    } catch (e) {
      alert(`오류: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setSmsSaving(false);
    }
  };

  const fetchFinanceRows = useCallback(async () => {
    try {
      const res = await fetch("/api/finance");
      if (!res.ok) return;
      const data = (await res.json()) as FinanceRow[];
      setFinanceRows(Array.isArray(data) ? data : []);
    } catch (e) {
      console.error("[Finance] fetch finance", e);
    }
  }, []);

  useEffect(() => {
    fetchFinanceRows();
    const supabase = createClient();
    if (supabase.channel && typeof supabase.channel === "function") {
      const channel = supabase
        .channel("finance-realtime")
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "finance" },
          (payload: { eventType: string; new: Record<string, unknown>; old: Record<string, unknown> }) => {
            if (payload.eventType === "INSERT") {
              setFinanceRows((prev) => [payload.new as FinanceRow, ...prev]);
            } else if (payload.eventType === "UPDATE") {
              setFinanceRows((prev) =>
                prev.map((r) => r.id === (payload.new as FinanceRow).id ? { ...r, ...(payload.new as FinanceRow) } : r)
              );
            } else if (payload.eventType === "DELETE") {
              setFinanceRows((prev) => prev.filter((r) => r.id !== (payload.old as { id: string }).id));
            }
          }
        )
        .subscribe();
      return () => {
        supabase.removeChannel(channel);
      };
    }
  }, [fetchFinanceRows]);

  // 페이지 로드 시 + 주기적 Pushbullet 동기화 (메시지 수신 반영)
  useEffect(() => {
    let mounted = true;
    const runSync = () => {
      if (!mounted) return;
      fetch("/api/sync-pushbullet")
        .then((r) => r.json())
        .then((res: { ok?: boolean; count?: number }) => {
          if (!mounted) return;
          if ((res.count ?? 0) > 0) {
            setSyncToast(`✅ 새 입금 내역 ${res.count}건이 자동으로 추가됐습니다.`);
            fetchFinanceRows();
            setTimeout(() => setSyncToast(null), 4000);
          }
        })
        .catch(() => {});
    };
    runSync();
    const retry = setTimeout(runSync, 4000);
    const interval = setInterval(runSync, 90_000);
    return () => {
      mounted = false;
      clearTimeout(retry);
      clearInterval(interval);
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const summary: MonthSummary = useMemo(
    () => parseMonthSummary(financeData) ?? SAMPLE_MONTH_SUMMARY,
    [financeData]
  );
  const survival: SurvivalAccount = useMemo(
    () => parseSurvivalAccount(financeData) ?? SAMPLE_SURVIVAL_ACCOUNT,
    [financeData]
  );

  /** 선택 월의 영업일 자동 계산 */
  const monthWorkDays = useMemo(() => {
    const monthKey = sheetLabelToMonthKey(selectedMonth);
    const [y, m] = monthKey.split("-").map(Number);
    if (!y || !m) return { workDays: summary.workDays, passedWorkDays: summary.passedWorkDays };
    return {
      workDays: getWorkDaysInMonth(y, m),
      passedWorkDays: getPassedWorkDaysInMonth(y, m),
    };
  }, [selectedMonth, summary.workDays, summary.passedWorkDays]);

  const rows = SAMPLE_CLASSIFICATION_ROWS;

  useEffect(() => {
    try {
      const rawR = typeof window !== "undefined" ? localStorage.getItem(RECEIVABLES_STORAGE_KEY) : null;
      const rawP = typeof window !== "undefined" ? localStorage.getItem(PAYABLES_STORAGE_KEY) : null;
      if (rawR) {
        const parsed = JSON.parse(rawR) as ExpectedLineItem[];
        if (Array.isArray(parsed)) {
          setReceivablesExpected(parsed);
          receivablesLoadedRef.current = true;
        }
      }
      if (rawP) {
        const parsed = JSON.parse(rawP) as ExpectedLineItem[];
        if (Array.isArray(parsed)) {
          setPayablesExpected(parsed);
          payablesLoadedRef.current = true;
        }
      }
    } catch { /* ignore */ }

    fetch("/finance-current.json")
      .then((r) => r.ok ? r.json() : null)
      .then((d) => {
        const data = d as FinanceCurrentJson | null;
        setFinanceData(data);
        if (!receivablesLoadedRef.current && data?.receivablesExpected?.length)
          setReceivablesExpected(data.receivablesExpected);
        if (!payablesLoadedRef.current && data?.payablesExpected?.length)
          setPayablesExpected(data.payablesExpected);
      })
      .catch(() => setFinanceData(null));
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(RECEIVABLES_STORAGE_KEY, JSON.stringify(receivablesExpected));
      localStorage.setItem(PAYABLES_STORAGE_KEY, JSON.stringify(payablesExpected));
    } catch { /* ignore */ }
  }, [receivablesExpected, payablesExpected]);

  const isFetchingLedger = useRef(false);
  const fetchLedger = useCallback(async () => {
    if (isFetchingLedger.current) return;
    isFetchingLedger.current = true;
    try {
      const res = await fetch("/api/transactions/ledger");
      const data = await res.json();
      setLedger(data.ledger || []);
    } finally {
      isFetchingLedger.current = false;
    }
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

  const ledgerFromFinance = useMemo((): LedgerRow[] => {
    return financeRows.map((r) => {
      // client_name 우선, 없으면 description(폴백 INSERT 시 "입금자: xxx" 형태), 없으면 빈 문자열
      const rawClientName =
        r.client_name ??
        (r.description?.startsWith("입금자: ")
          ? r.description.replace("입금자: ", "")
          : r.description ?? "");
      return {
        id: r.id,
        date: r.date ?? r.month + "-01",
        amount: Number(r.amount),
        senderName: rawClientName,
        type: r.type === "매입" ? "WITHDRAWAL" : "DEPOSIT",
        bankName: "신한",
        status: (r.status === "completed" ? "PAID" : "UNMAPPED") as "UNMAPPED" | "PAID",
        classification: r.category ?? undefined,
        clientName: rawClientName || undefined,
        description: r.description ?? undefined,
        createdAt: r.created_at,
        source: "finance" as const,
      };
    });
  }, [financeRows]);

  // DB(finance) 데이터와 엑셀/ledger 소스(finance-current.json)의 동일 거래가 같이 들어오면서
  // 같은 행이 2개씩 보이는 현상을 방지하기 위한 중복 제거(현재 선택 월 기준).
  const ledgerSourceDeduped = useMemo((): LedgerRow[] => {
    const monthKey = sheetLabelToMonthKey(selectedMonth);

    // 중복 제거를 위해 시그니처를 최대한 단순화:
    // - 클라이언트명/입금자 문자열이 DB/엑셀에서 미묘하게 달라서 매칭이 깨지는 케이스가 많음
    // - 그래서 date(type 포함) + amount만 기준으로 우선 dedupe
    const normalizeDateSig = (dateStr: string) => {
      if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
        const monthPart = dateStr.slice(0, 7);
        const dayPart = dateStr.slice(8, 10);
        return dayPart === "01" ? `${monthPart}|*` : dateStr;
      }
      if (/^\d{4}-\d{2}-\d{2}/.test(dateStr)) return dateStr;
      return dateStr;
    };

    const signature = (r: { date?: string; type: "DEPOSIT" | "WITHDRAWAL" | string; amount: number }) => {
      const date = r.date ?? "";
      const dateSig = normalizeDateSig(date);
      return `${dateSig}|${r.type}|${Number(r.amount) || 0}`;
    };

    const financeSignatures = new Set(
      ledgerFromFinance.filter((r) => isRowInMonth(r.date, monthKey)).map((r) => signature(r))
    );

    return ledgerSource.filter((r) => {
      // 현재 월이 아니면 중복 제거하지 않음(필요 이상으로 숨기지 않기 위함)
      if (!isRowInMonth(r.date, monthKey)) return true;
      return !financeSignatures.has(signature(r));
    });
  }, [ledgerSource, ledgerFromFinance, selectedMonth]);

  const ledgerWithCustomAndEdits = useMemo(() => {
    const merged = [...ledgerFromFinance, ...customEntries, ...ledgerSourceDeduped];
    const monthKey = sheetLabelToMonthKey(selectedMonth);
    const normalizeClient = (r: LedgerRow) => (r.clientName ?? r.senderName ?? "").trim();
    const normalizeDateSig = (dateStr: string) => {
      // YYYY-MM-DD 형태면 날짜가 01일(월에서의 placeholder 포함)인 경우 month-level로 묶기
      if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
        const monthPart = dateStr.slice(0, 7);
        const dayPart = dateStr.slice(8, 10);
        return dayPart === "01" ? `${monthPart}|*` : dateStr;
      }
      if (/^\d{4}-\d{2}$/.test(dateStr)) return `${dateStr}|*`;
      return dateStr;
    };

    const edited = merged.map((row) => {
      const edit = editsOverlay[row.id];
      if (!edit || Object.keys(edit).length === 0) return row;
      // source는 편집에서 덮어쓰지 않음 — DB 행 삭제 시 source 필요
      return { ...row, ...edit, source: row.source ?? (edit as Partial<LedgerRow>).source };
    });

    // 월 단위 dedup
    // 규칙 ①: finance 소스끼리 같은 sig에 PAID가 있으면 finance UNMAPPED 전부 제거
    //         (승인 후 Pushbullet 재알림으로 생기는 중복 방지, senderName 변경 무관)
    // 규칙 ②: UNMAPPED만 남은 경우 senderName으로 그룹핑 → 다른 입금자는 각각 유지
    //         같은 입금자(같은 senderName) 내에서는 1건만 유지
    const extractIden = (r: LedgerRow) => {
      const m = (r.description ?? "").match(/pb:(\S+)/);
      return m ? m[1] : null;
    };

    const out: LedgerRow[] = [];
    const monthRows: LedgerRow[] = [];
    for (const row of edited) {
      if (!isRowInMonth(row.date, monthKey)) {
        out.push(row);
      } else {
        monthRows.push(row);
      }
    }

    // 1차: sig(날짜|타입|금액)로 그룹핑
    const sigGroups = new Map<string, LedgerRow[]>();
    for (const row of monthRows) {
      const sig = `${normalizeDateSig(row.date)}|${row.type}|${Number(row.amount) || 0}`;
      const g = sigGroups.get(sig) ?? [];
      g.push(row);
      sigGroups.set(sig, g);
    }

    const dedupedMonthRows: LedgerRow[] = [];
    for (const [, group] of sigGroups) {
      if (group.length === 1) {
        dedupedMonthRows.push(group[0]);
        continue;
      }

      // 규칙 ①: finance PAID가 있으면 finance UNMAPPED 제거 (cross-senderName 포함)
      const financePaid = group.filter((r) => r.source === "finance" && r.status === "PAID");
      const financeUnmapped = group.filter((r) => r.source === "finance" && r.status !== "PAID");
      const nonFinance = group.filter((r) => r.source !== "finance");

      // finance PAID가 존재 → finance UNMAPPED 전부 버리고 PAID + non-finance만 남김
      const candidates = financePaid.length > 0
        ? [...financePaid, ...nonFinance]
        : group;

      // 규칙 ②: 남은 항목을 senderName으로 그룹핑 → 다른 입금자는 각각 유지
      const nameGroups = new Map<string, LedgerRow[]>();
      for (const r of candidates) {
        const name = (r.senderName ?? "").trim();
        const ng = nameGroups.get(name) ?? [];
        ng.push(r);
        nameGroups.set(name, ng);
      }

      for (const [, ng] of nameGroups) {
        if (ng.length === 1) {
          dedupedMonthRows.push(ng[0]);
          continue;
        }
        // 같은 senderName 내 복수 항목: PAID 우선, 그 다음 iden 있는 것, 없으면 첫 번째
        const paid = ng.find((r) => r.status === "PAID");
        if (paid) { dedupedMonthRows.push(paid); continue; }
        const withIden = ng.find((r) => !!extractIden(r));
        dedupedMonthRows.push(withIden ?? ng[0]);
      }

      // finance PAID가 있었고 finance UNMAPPED가 있었는데 nonFinance가 없으면
      // financeUnmapped는 이미 제외됨 — 명시적 확인용 (lint 경고 방지)
      void financeUnmapped;
    }

    return [...out, ...dedupedMonthRows].sort((a, b) => {
      if (a.date !== b.date) return b.date! > a.date! ? 1 : -1;
      return (b.createdAt ?? "").localeCompare(a.createdAt ?? "");
    });
  }, [ledgerFromFinance, customEntries, ledgerSourceDeduped, editsOverlay, selectedMonth]);

  const ledgerMonthKey = sheetLabelToMonthKey(selectedMonth);

  /** 매출/매입/매출총이익: 통합 원장 모든 소스(DB·수동·엑셀 등) 중 해당 월 승인 완료(PAID)만 합산 */
  const dbFinanceSummary = useMemo(() => {
    const rowsInMonthPaid = ledgerWithCustomAndEdits.filter(
      (r) => isRowInMonth(r.date, ledgerMonthKey) && r.status === "PAID" && !hiddenIds.has(r.id)
    );
    const revenue = rowsInMonthPaid.filter((r) => r.type === "DEPOSIT").reduce((s, r) => s + Number(r.amount), 0);
    const purchase = rowsInMonthPaid.filter((r) => r.type === "WITHDRAWAL").reduce((s, r) => s + Number(r.amount), 0);
    const revSv = amountToSupplyVat(revenue);
    const purSv = amountToSupplyVat(purchase);
    const grossSupply = revSv.supply - purSv.supply;
    const grossVat = revSv.vat - purSv.vat;
    return {
      revenue,
      revenueSupply: revSv.supply,
      revenueVat: revSv.vat,
      purchase,
      purchaseSupply: purSv.supply,
      purchaseVat: purSv.vat,
      margin: revenue - purchase,
      grossSupply,
      grossVat,
    };
  }, [ledgerWithCustomAndEdits, ledgerMonthKey, hiddenIds]);

  /** 금일(로컬) 기준 승인(PAID) 거래 — 금액별 공급가(부가세 제외) 합계 */
  const todaySupplySummary = useMemo(() => {
    const now = new Date();
    const todayYmd = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
    const rowsTodayPaid = ledgerWithCustomAndEdits.filter(
      (r) => isRowOnCalendarDay(r.date, todayYmd) && r.status === "PAID" && !hiddenIds.has(r.id)
    );
    let revenueSupply = 0;
    let purchaseSupply = 0;
    for (const r of rowsTodayPaid) {
      const amt = Number(r.amount) || 0;
      const { supply } = amountToSupplyVat(amt);
      if (r.type === "DEPOSIT") revenueSupply += supply;
      else purchaseSupply += supply;
    }
    return {
      revenueSupply,
      purchaseSupply,
      marginSupply: revenueSupply - purchaseSupply,
    };
  }, [ledgerWithCustomAndEdits, hiddenIds]);

  /** 생존통장: 이월 직접 입력, 현재 = 이월 + 해당월 입금 - 해당월 출금 */
  const survivalResolved = useMemo(() => ({
    ...survival,
    carryOverBalance,
    currentBalance: carryOverBalance + dbFinanceSummary.revenue - dbFinanceSummary.purchase,
  }), [survival, carryOverBalance, dbFinanceSummary.revenue, dbFinanceSummary.purchase]);

  /** 매출 분석 탭 「매출 현황」: 선택 월·통합 원장·PAID·부가세 10% 역산 (원장 카드와 동일) */
  const ledgerDerivedCurrentStatus: CurrentStatus = useMemo(
    () => ({
      salesSupply: dbFinanceSummary.revenueSupply,
      salesVat: dbFinanceSummary.revenueVat,
      salesTotal: dbFinanceSummary.revenue,
      purchaseSupply: dbFinanceSummary.purchaseSupply,
      purchaseVat: dbFinanceSummary.purchaseVat,
      purchaseTotal: dbFinanceSummary.purchase,
      grossSupply: dbFinanceSummary.grossSupply,
      grossVat: dbFinanceSummary.grossVat,
      grossTotal: dbFinanceSummary.margin,
      survivalBalance: survivalResolved.currentBalance,
    }),
    [dbFinanceSummary, survivalResolved.currentBalance]
  );

  /** 팀별: 통합 원장 classification(팀) 기준, 선택 월·PAID */
  const ledgerTeamSalesReport: TeamSalesReportRow[] = useMemo(() => {
    const rowsInMonthPaid = ledgerWithCustomAndEdits.filter(
      (r) => isRowInMonth(r.date, ledgerMonthKey) && r.status === "PAID" && !hiddenIds.has(r.id)
    );
    const byTeam = new Map<string, { revenue: number; cost: number }>();
    for (const r of rowsInMonthPaid) {
      const team = normalizeLedgerTeamLabel(r.classification);
      if (!byTeam.has(team)) byTeam.set(team, { revenue: 0, cost: 0 });
      const rec = byTeam.get(team)!;
      const amt = Number(r.amount) || 0;
      if (r.type === "DEPOSIT") rec.revenue += amt;
      else rec.cost += amt;
    }
    return Array.from(byTeam.entries())
      .map(([team, { revenue, cost }]) => {
        const grossProfit = revenue - cost;
        const marginRatePct = revenue > 0 ? (grossProfit / revenue) * 100 : 0;
        return {
          team,
          revenue,
          cost,
          grossProfit,
          marginRatePct: Math.round(marginRatePct * 100) / 100,
        };
      })
      .sort((a, b) => compareLedgerTeamOrder(a.team, b.team));
  }, [ledgerWithCustomAndEdits, ledgerMonthKey, hiddenIds]);

  /** 목표 매출총이익(고정): 더널리 4,200만 / 티제이웹 800만 / 기타 0 */
  const ledgerTeamTargetGp: TeamTargetGp[] = useMemo(() => {
    const targetByTeam: Record<string, number> = {
      "더널리": 42_000_000,
      "티제이웹": 8_000_000,
      "기타": 0,
    };
    return ledgerTeamSalesReport.map((t) => {
      const teamTarget = targetByTeam[t.team] ?? 0;
      const excessAchievement = t.grossProfit - teamTarget;
      return {
        team: t.team,
        target: teamTarget,
        grossProfit: t.grossProfit,
        excessAchievement,
        achieved: t.grossProfit >= teamTarget,
      };
    });
  }, [ledgerTeamSalesReport]);

  /** 전체 환불율: 통합 원장에서 「환불」이 적요/분류에 포함된 출금 ÷ 입금 합 */
  const ledgerOverallRefundRatePct = useMemo(() => {
    const rowsInMonthPaid = ledgerWithCustomAndEdits.filter(
      (r) => isRowInMonth(r.date, ledgerMonthKey) && r.status === "PAID" && !hiddenIds.has(r.id)
    );
    const sales = rowsInMonthPaid.filter((r) => r.type === "DEPOSIT").reduce((s, r) => s + (Number(r.amount) || 0), 0);
    const 환불출금 = rowsInMonthPaid
      .filter((r) => {
        if (r.type !== "WITHDRAWAL") return false;
        const hay = `${r.classification ?? ""} ${r.clientName ?? ""} ${r.senderName ?? ""} ${r.description ?? ""}`;
        return /환불/i.test(hay);
      })
      .reduce((s, r) => s + (Number(r.amount) || 0), 0);
    if (sales <= 0) return 0;
    return Math.round((환불출금 / sales) * 10000) / 100;
  }, [ledgerWithCustomAndEdits, ledgerMonthKey, hiddenIds]);

  const workDays = monthWorkDays.workDays;
  const passedWorkDays = monthWorkDays.passedWorkDays;
  const remainingDays = workDays - passedWorkDays;
  const dailyAvgProfit = passedWorkDays > 0 ? dbFinanceSummary.margin / passedWorkDays : 0;
  const receivablesTotal = receivablesExpected.reduce((s, x) => s + x.supplyAmount + x.vat, 0);
  const payablesTotal = payablesExpected.reduce((s, x) => s + x.supplyAmount + x.vat, 0);
  const projectedProfit = dailyAvgProfit * workDays + receivablesTotal - payablesTotal;

  const isRowInDateRange = useCallback((rowDate: string): boolean => {
    if (ledgerDateFrom || ledgerDateTo) {
      const ymd = rowDateToYMD(rowDate);
      if (!ymd) return false;
      if (ledgerDateFrom && ymd < ledgerDateFrom) return false;
      if (ledgerDateTo && ymd > ledgerDateTo) return false;
      return true;
    }
    return isRowInMonth(rowDate, ledgerMonthKey);
  }, [ledgerDateFrom, ledgerDateTo, ledgerMonthKey]);

  const filteredLedger = useMemo(() => {
    return ledgerWithCustomAndEdits.filter((row) => {
      if (!isRowInDateRange(row.date)) return false;
      if (hiddenIds.has(row.id)) return false;
      if (ledgerFilter === "pending") return row.status === "UNMAPPED";
      if (ledgerFilter === "approved") return row.status === "PAID";
      return true;
    });
  }, [ledgerWithCustomAndEdits, ledgerFilter, hiddenIds, isRowInDateRange]);

  const pendingCount = ledgerWithCustomAndEdits.filter((r) => isRowInDateRange(r.date) && r.status === "UNMAPPED" && !hiddenIds.has(r.id)).length;

  const saveCustomEntries = useCallback((entries: LedgerRow[]) => {
    setCustomEntries(entries);
    try { localStorage.setItem(LEDGER_CUSTOM_STORAGE_KEY, JSON.stringify(entries)); } catch { /* ignore */ }
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

  const handleSaveEditLedgerRow = useCallback(async (row: LedgerRow, patch: Partial<LedgerRow>) => {
    if (row.id.startsWith("custom-")) {
      await fetch(`/api/finance/custom/${row.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...(patch.date != null ? { date: patch.date } : {}),
          ...(patch.amount != null ? { amount: patch.amount } : {}),
          ...(patch.senderName != null ? { senderName: patch.senderName } : {}),
          ...(patch.type != null ? { type: patch.type } : {}),
          ...(patch.bankName != null ? { bankName: patch.bankName } : {}),
          ...(patch.status != null ? { status: patch.status } : {}),
          ...(patch.classification !== undefined ? { classification: patch.classification } : {}),
          ...(patch.clientName !== undefined ? { clientName: patch.clientName } : {}),
        }),
      }).catch(() => {});
      setCustomEntries((prev) => {
        const next = prev.map((e) => (e.id === row.id ? { ...e, ...patch } : e));
        try { localStorage.setItem(LEDGER_CUSTOM_STORAGE_KEY, JSON.stringify(next)); } catch { /* ignore */ }
        return next;
      });
      setEditLedgerRow(null);
      return;
    }
    if (row.source === "finance") {
      const body: Record<string, unknown> = {};
      if (patch.amount != null) body.amount = patch.amount;
      if (patch.date != null) body.date = patch.date;
      if (patch.classification != null) body.category = patch.classification;
      if (patch.clientName != null) body.client_name = patch.clientName;
      if (patch.status != null) body.status = patch.status === "PAID" ? "completed" : "pending";
      if (patch.type != null) body.type = patch.type === "DEPOSIT" ? "매출" : "매입";
      const res = await fetch(`/api/finance/${row.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      if (res.ok) {
        setFinanceRows((prev) => prev.map((r) => r.id !== row.id ? r : {
          ...r,
          ...(patch.amount != null ? { amount: patch.amount } : {}),
          ...(patch.date != null ? { date: patch.date } : {}),
          ...(patch.classification != null ? { category: patch.classification } : {}),
          ...(patch.clientName != null ? { client_name: patch.clientName } : {}),
          ...(patch.status != null ? { status: patch.status === "PAID" ? "completed" : "pending" } : {}),
          ...(patch.type != null ? { type: patch.type === "DEPOSIT" ? "매출" : "매입" } : {}),
        }));
        setEditLedgerRow(null);
      } else {
        const err = await res.json().catch(() => ({}));
        alert(err.error || "저장 실패");
      }
      return;
    }
    setEditsOverlay((prev) => {
      const next = { ...prev, [row.id]: { ...prev[row.id], ...patch } };
      try {
        localStorage.setItem(LEDGER_EDITS_STORAGE_KEY, JSON.stringify(next));
      } catch { /* ignore */ }
      return next;
    });
    setEditLedgerRow(null);
  }, [fetchFinanceRows]);

  const handleAmountChange = useCallback(async (id: string, amount: number, source?: string) => {
    if (!Number.isFinite(amount) || amount <= 0) return;
    if (id.startsWith("custom-")) {
      await fetch(`/api/finance/custom/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amount }),
      }).catch(() => {});
      setCustomEntries((prev) => {
        const next = prev.map((e) => (e.id === id ? { ...e, amount } : e));
        try { localStorage.setItem(LEDGER_CUSTOM_STORAGE_KEY, JSON.stringify(next)); } catch { /* ignore */ }
        return next;
      });
      return;
    }
    if (source === "finance") {
      const res = await fetch(`/api/finance/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amount }),
      });
      if (res.ok) {
        setFinanceRows((prev) => prev.map((r) => r.id === id ? { ...r, amount } : r));
      } else {
        const err = await res.json().catch(() => ({}));
        alert(err.error || "금액 저장 실패");
      }
      return;
    }
    setEditsOverlay((prev) => {
      const next = { ...prev, [id]: { ...prev[id], amount } };
      try {
        localStorage.setItem(LEDGER_EDITS_STORAGE_KEY, JSON.stringify(next));
      } catch { /* ignore */ }
      return next;
    });
  }, [fetchFinanceRows]);

  const handleDeleteLedgerRow = useCallback(async (id: string, source?: string) => {
    if (!window.confirm("이 항목을 삭제하시겠습니까?")) return;

    if (source === "finance") {
      const res = await fetch(`/api/finance/${String(id)}`, { method: "DELETE" });
      const err = await res.json().catch(() => ({}));
      if (res.ok) {
        setFinanceRows((prev) => prev.filter((r) => r.id !== id));
        // 같은 id가 엑셀/ledger 소스에 있으면 목록에서 숨김
        setHiddenIds((prev) => {
          const next = new Set(prev);
          next.add(id);
          try { localStorage.setItem(LEDGER_HIDDEN_STORAGE_KEY, JSON.stringify([...next])); } catch { /* ignore */ }
          return next;
        });
      } else {
        alert(err.error || "삭제 실패");
      }
      return;
    }

    if (id.startsWith("custom-")) {
      await fetch(`/api/finance/custom/${id}`, { method: "DELETE" }).catch(() => {});
      setCustomEntries((prev) => {
        const next = prev.filter((e) => e.id !== id);
        try { localStorage.setItem(LEDGER_CUSTOM_STORAGE_KEY, JSON.stringify(next)); } catch { /* ignore */ }
        return next;
      });
      return;
    }

    // 데모/엑셀/트랜잭션 데이터 → hiddenIds에 추가
    setHiddenIds((prev) => {
      const next = new Set(prev);
      next.add(id);
      try { localStorage.setItem(LEDGER_HIDDEN_STORAGE_KEY, JSON.stringify([...next])); } catch { /* ignore */ }
      return next;
    });
  }, [fetchFinanceRows]);

  const handleAddLedgerSubmit = useCallback(() => {
    const amountRaw = addForm.amount.replace(/[^0-9]/g, "");
    const amount = parseInt(amountRaw, 10) || 0;
    if (!addForm.date || amount <= 0) return;

    const isReceivable = addForm.type === "RECEIVABLE";
    const isPayable = addForm.type === "PAYABLE";
    const ledgerType: "DEPOSIT" | "WITHDRAWAL" = isReceivable ? "DEPOSIT" : isPayable ? "WITHDRAWAL" : (addForm.type as "DEPOSIT" | "WITHDRAWAL");
    const status: "UNMAPPED" | "PAID" = isReceivable || isPayable ? "UNMAPPED" : "PAID";

    const newRow: LedgerRow = {
      id: `custom-${Date.now()}`,
      date: addForm.date,
      amount,
      senderName: addForm.senderName.trim() || (isReceivable ? "미수금" : isPayable ? "미지급금" : "수동입력"),
      type: ledgerType,
      bankName: addForm.bankName.trim() || "무통장",
      status,
      classification: addForm.classification || undefined,
      clientName: addForm.clientName.trim() || addForm.senderName.trim() || (isReceivable ? "미수금" : isPayable ? "미지급금" : "수동입력"),
      createdAt: new Date().toISOString(),
    };
    // API 저장 (실패해도 로컬 상태에는 반영)
    fetch("/api/finance/custom", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(newRow),
    }).catch(() => {});
    setCustomEntries((prev) => {
      const next = [newRow, ...prev];
      try { localStorage.setItem(LEDGER_CUSTOM_STORAGE_KEY, JSON.stringify(next)); } catch { /* ignore */ }
      return next;
    });

    if (isReceivable) {
      const { supply, vat } = amountToSupplyVat(amount);
      setReceivablesExpected((prev) => [
        ...prev,
        { id: `er-${Date.now()}`, category: "미수금", item: addForm.senderName.trim() || addForm.clientName.trim() || "미수금", supplyAmount: supply, vat, memo: "" },
      ]);
    }
    if (isPayable) {
      const { supply, vat } = amountToSupplyVat(amount);
      setPayablesExpected((prev) => [
        ...prev,
        { id: `ep-${Date.now()}`, category: "미지급금", item: addForm.senderName.trim() || addForm.clientName.trim() || "미지급금", supplyAmount: supply, vat, memo: "" },
      ]);
    }

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
      ? (dbFinanceSummary.margin / summary.targetGrossProfit) * 100
      : 0;

  const fetchSyncPushbullet = useCallback(async () => {
    setSyncLoading(true);
    try {
      // 원장 DB 갱신 + Pushbullet REST 동기화 병렬 실행
      const [, pbRes] = await Promise.all([
        fetchFinanceRows(),
        fetch("/api/sync-pushbullet").then((r) => r.json()).catch(() => ({ ok: false, count: 0 })),
      ]);
      const res = pbRes as { ok?: boolean; count?: number; permanents_error?: string };
      const added = res.count ?? 0;
      if (added > 0) {
        setSyncToast(`✅ 푸시불렛 입금 내역 ${added}건이 새로 추가됐습니다.`);
        await fetchFinanceRows();
      } else if (res.permanents_error) {
        setSyncToast(`⚠️ 입금 동기화: SMS 스레드 조회 실패 (${res.permanents_error}). 실시간 수신은 pushbullet-stream.js 실행 필요.`);
      } else {
        setSyncToast("🔄 원장 데이터를 최신으로 갱신했습니다.");
      }
      setTimeout(() => setSyncToast(null), 3000);
    } finally {
      setSyncLoading(false);
    }
  }, [fetchFinanceRows]);


  return (
    <div className="space-y-4">
      {/* 푸시불렛 동기화 Toast */}
      {syncToast && (
        <div
          role="status"
          className="fixed bottom-6 right-6 z-[100] rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-800 shadow-lg"
        >
          {syncToast}
        </div>
      )}
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

      {/* 재무 요약 (finance 테이블) */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Card className="rounded-xl border border-slate-200 bg-white">
          <CardContent className="pt-4 pb-4">
            <p className="text-xs font-medium text-slate-500">매출 ({selectedMonth})</p>
            <p className="mt-1 text-lg font-bold tabular-nums text-slate-900">{formatWonIntl(dbFinanceSummary.revenueSupply)}</p>
            <p className="mt-0.5 text-xs text-slate-500">입금액(부가세포함) {formatWonIntl(dbFinanceSummary.revenue)}</p>
          </CardContent>
        </Card>
        <Card className="rounded-xl border border-slate-200 bg-white">
          <CardContent className="pt-4 pb-4">
            <p className="text-xs font-medium text-slate-500">매입 ({selectedMonth})</p>
            <p className="mt-1 text-lg font-bold tabular-nums text-rose-600">-{formatWonIntl(dbFinanceSummary.purchaseSupply)}</p>
            <p className="mt-0.5 text-xs text-slate-500">출금액(부가세포함) {formatWonIntl(dbFinanceSummary.purchase)}</p>
          </CardContent>
        </Card>
        <Card className="rounded-xl border border-emerald-200 bg-emerald-50/50">
          <CardContent className="pt-4 pb-4">
            <p className="text-xs font-medium text-emerald-700">매출총이익 ({selectedMonth})</p>
            <p className="mt-1 text-lg font-bold tabular-nums text-emerald-800">{formatWonIntl(dbFinanceSummary.grossSupply)}</p>
            <p className="mt-0.5 text-xs text-emerald-700">부가세 포함 {formatWonIntl(dbFinanceSummary.margin)}</p>
          </CardContent>
        </Card>
      </div>

      {viewMode === "ledger" && (
      <div className="grid grid-cols-12 gap-6 min-h-0" style={{ height: "calc(100vh - 220px)", minHeight: "420px" }}>
        {/* [좌측 col-span-8] 통합 입출금 원장 */}
        <div className="col-span-12 lg:col-span-8 flex min-h-0 flex-col rounded-2xl border border-white/40 bg-white/80 shadow-[0_8px_30px_rgb(0,0,0,0.04)] backdrop-blur-2xl overflow-hidden">
          <div className="flex-shrink-0 border-b border-slate-200/80 bg-slate-50/50 px-5 py-3">
            {/* 날짜 필터 */}
            <div className="mb-2.5 flex items-center gap-2">
              <span className="text-xs font-medium text-slate-500">기간</span>
              <input
                type="date"
                value={ledgerDateFrom}
                onChange={(e) => setLedgerDateFrom(e.target.value)}
                className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs text-slate-700 focus:outline-none focus:ring-1 focus:ring-slate-300"
              />
              <span className="text-xs text-slate-400">~</span>
              <input
                type="date"
                value={ledgerDateTo}
                onChange={(e) => setLedgerDateTo(e.target.value)}
                className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs text-slate-700 focus:outline-none focus:ring-1 focus:ring-slate-300"
              />
              {(ledgerDateFrom || ledgerDateTo) && (
                <button
                  type="button"
                  onClick={() => { setLedgerDateFrom(""); setLedgerDateTo(""); }}
                  className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs text-slate-500 hover:bg-slate-50"
                >
                  초기화
                </button>
              )}
              {(ledgerDateFrom || ledgerDateTo) && (
                <span className="text-xs text-blue-600 font-medium">
                  {filteredLedger.length}건
                </span>
              )}
            </div>
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
                  onClick={() => fetchSyncPushbullet()}
                  disabled={syncLoading}
                  className="shrink-0"
                  title="원장 갱신 + Pushbullet 입금 메시지 동기화"
                >
                  <RefreshCw className={`size-4 mr-1 ${syncLoading ? "animate-spin" : ""}`} />
                  입금 동기화
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => { setSmsOpen(true); setSmsText(""); setSmsParsed(null); }}
                  className="shrink-0 border-blue-300 text-blue-700 hover:bg-blue-50"
                >
                  <FileText className="size-4 mr-1" />
                  SMS 등록
                </Button>
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
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={autoMapping}
                  onClick={async () => {
                    setAutoMapping(true);
                    setAutoMapMsg(null);
                    try {
                      const res = await fetch("/api/clients/remap", { method: "POST" });
                      const json = await res.json();
                      setAutoMapMsg(`✓ ${json.updated}건 자동 매핑`);
                      if ((json.updated ?? 0) > 0) {
                        await fetchLedger();
                        const freshClients = await fetch("/api/clients").then((r) => r.ok ? r.json() : []);
                        if (Array.isArray(freshClients)) setCrmClients(freshClients);
                      }
                    } catch {
                      setAutoMapMsg("매핑 실패");
                    } finally {
                      setAutoMapping(false);
                      setTimeout(() => setAutoMapMsg(null), 3000);
                    }
                  }}
                  className="shrink-0 border-blue-300 text-blue-700 hover:bg-blue-50"
                  title="입금자명을 CRM 거래처 별칭과 대조해 고객사를 자동으로 채웁니다"
                >
                  <RefreshCw className={`size-4 mr-1 ${autoMapping ? "animate-spin" : ""}`} />
                  {autoMapMsg ?? "거래처 자동 매칭"}
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
            <table className="w-full text-xs tracking-tight table-fixed">
              <thead className="sticky top-0 z-10 bg-slate-50/95 backdrop-blur-sm shadow-sm">
                <tr className="border-b border-slate-200">
                  <th className="w-20 px-2 py-2 text-left font-medium text-slate-600">날짜</th>
                  <th className="px-2 py-2 text-left font-medium text-slate-600">카테고리</th>
                  <th className="px-2 py-2 text-left font-medium text-slate-600">고객사</th>
                  <th className="w-24 px-2 py-2 text-right font-medium text-slate-600">입금액</th>
                  <th className="w-24 px-2 py-2 text-right font-medium text-slate-600">공급가</th>
                  <th className="w-16 px-1 py-2 text-center font-medium text-slate-600">상태</th>
                  <th className="w-20 px-1 py-2 text-center font-medium text-slate-600">승인</th>
                </tr>
              </thead>
              <tbody>
                {filteredLedger.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-2 py-8 text-center text-xs text-slate-500">
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
                        if (row.source === "finance") {
                          setApprovingId(row.id);
                          const supabase = getSupabase();
                          if (supabase.from) {
                            const { error } = await supabase
                              .from("finance")
                              .update({ status: "completed", category: classification, client_name: clientName })
                              .eq("id", row.id);
                            setApprovingId(null);
                            if (!error) {
                              setJustApprovedId(row.id);
                              setTimeout(() => setJustApprovedId(null), 600);
                              setFinanceRows((prev) => prev.map((r) => r.id !== row.id ? r : {
                                ...r, status: "completed", category: classification ?? null, client_name: clientName ?? null,
                              }));
                            } else {
                              alert(error.message || "승인 실패");
                            }
                          } else {
                            setApprovingId(null);
                          }
                          return;
                        }
                        if (row.id.startsWith("custom-")) {
                          fetch(`/api/finance/custom/${row.id}`, {
                            method: "PATCH",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({ status: "PAID", classification, clientName }),
                          }).catch(() => {});
                          setCustomEntries((prev) => {
                            const next = prev.map((e) =>
                              e.id === row.id ? { ...e, status: "PAID" as const, classification, clientName } : e
                            );
                            try { localStorage.setItem(LEDGER_CUSTOM_STORAGE_KEY, JSON.stringify(next)); } catch { /* ignore */ }
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
                      onEditRow={row.status === "PAID" ? () => setEditLedgerRow(row) : undefined}
                      onAmountChange={row.status === "UNMAPPED" ? handleAmountChange : undefined}
                      onDelete={(id) => handleDeleteLedgerRow(id, row.source)}
                      clients={crmClients}
                      onReceipt={row.source === "finance" ? async () => {
                        const fr = financeRows.find((r) => r.id === row.id) ?? null;
                        if (fr) {
                          const res = await fetch(`/api/finance/${row.id}`);
                          const json = res.ok ? await res.json() : {};
                          setReceiptTarget({ ...fr, receipt_data: json.receipt_data ?? null });
                        }
                      } : undefined}
                    />
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* 영수증 / 세금계산서 모달 */}
        {receiptTarget && (
          <ReceiptModal
            open={!!receiptTarget}
            onOpenChange={(o) => { if (!o) setReceiptTarget(null); }}
            financeId={receiptTarget.id}
            amount={Number(receiptTarget.amount)}
            clientName={receiptTarget.client_name ?? ""}
            date={receiptTarget.date ?? receiptTarget.month}
            initialData={receiptTarget.receipt_data}
            onSaved={(data: ReceiptData) => {
              setFinanceRows((prev) =>
                prev.map((r) => r.id === receiptTarget.id ? { ...r, receipt_data: data } : r)
              );
            }}
          />
        )}

        {/* SMS 붙여넣기 등록 모달 */}
        <Dialog open={smsOpen} onOpenChange={(o) => { setSmsOpen(o); if (!o) { setSmsText(""); setSmsParsed(null); } }}>
          <DialogContent className="max-w-[480px]">
            <DialogHeader>
              <DialogTitle>신한은행 SMS 붙여넣기 등록</DialogTitle>
            </DialogHeader>
            <div className="grid gap-4 py-2">
              <div className="grid gap-2">
                <Label>SMS 전문 붙여넣기</Label>
                <textarea
                  className="w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm font-mono resize-none focus:outline-none focus:ring-2 focus:ring-blue-400"
                  rows={6}
                  placeholder={"[Web발신]\n신한03/17 09:46\n140-***-578547\n입금 48,400\n홍민수(위노시스)"}
                  value={smsText}
                  onChange={(e) => handleSmsChange(e.target.value)}
                />
              </div>
              {smsParsed ? (
                <div className="rounded-lg bg-green-50 border border-green-200 px-4 py-3 text-sm space-y-1">
                  <p className="font-semibold text-green-700">✅ 파싱 성공</p>
                  <p><span className="text-slate-500">날짜:</span> <strong>{smsParsed.date}</strong></p>
                  <p><span className="text-slate-500">금액:</span> <strong>{smsParsed.amount.toLocaleString()}원</strong></p>
                  <p><span className="text-slate-500">입금자:</span> <strong>{smsParsed.client_name || "—"}</strong></p>
                </div>
              ) : smsText.trim() ? (
                <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-600">
                  ❌ 파싱 실패 — 신한은행 입금 SMS 형식인지 확인해주세요.
                </div>
              ) : null}
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setSmsOpen(false)}>취소</Button>
              <Button
                onClick={handleSmsSave}
                disabled={!smsParsed || smsSaving}
                className="bg-blue-600 hover:bg-blue-700 text-white"
              >
                {smsSaving ? "등록 중..." : "등록"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

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
                  <Label>금액 (부가세 포함)</Label>
                  <Input
                    type="text"
                    inputMode="numeric"
                    placeholder="0"
                    value={addForm.amount === "" ? "" : formatWonIntl(parseInt(addForm.amount.replace(/[^0-9]/g, ""), 10) || 0)}
                    onChange={(e) => {
                      const raw = e.target.value.replace(/[^0-9]/g, "");
                      setAddForm((f) => ({ ...f, amount: raw }));
                    }}
                    className="tabular-nums"
                  />
                </div>
              </div>
              <div className="grid gap-2">
                <Label>구분</Label>
                <select
                  value={addForm.type}
                  onChange={(e) => setAddForm((f) => ({ ...f, type: e.target.value as AddFormType }))}
                  className="flex h-10 w-full rounded-md border border-[var(--border)] bg-transparent px-3 py-2 text-sm"
                >
                  <option value="DEPOSIT">입금 (매출)</option>
                  <option value="WITHDRAWAL">출금 (매입)</option>
                  <option value="RECEIVABLE">미수금 (원장에 미승인)</option>
                  <option value="PAYABLE">미지급금 (원장에 미승인)</option>
                </select>
                {(addForm.type === "RECEIVABLE" || addForm.type === "PAYABLE") && (
                  <p className="text-xs text-slate-500">
                    통합 원장에 미승인 상태로 등록되며, 매출 분석 탭의 미수금·미지급금 표에도 반영됩니다.
                  </p>
                )}
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

        {/* 원장 수정 모달 (수동 추가 항목만) */}
        {editLedgerRow && (
          <EditLedgerModal
            key={editLedgerRow.id + (editLedgerRow.source ?? "")}
            row={editLedgerRow}
            onSave={(patch) => handleSaveEditLedgerRow(editLedgerRow, patch)}
            onClose={() => setEditLedgerRow(null)}
          />
        )}

        {/* [우측 col-span-4] 인사이트 위젯 타워 */}
        <div className="col-span-12 lg:col-span-4 flex flex-col gap-6 overflow-y-auto min-h-0">
          {/* 1. 생존 통장 & 캐시플로우 */}
          <Card className="rounded-2xl border border-amber-200/60 bg-amber-50/50 flex-shrink-0">
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-sm font-semibold text-amber-800">
                <Wallet className="size-4" />
                생존 통장 & 캐시플로우
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex justify-between items-center gap-2 text-sm">
                <span className="text-slate-600">이월 잔고</span>
                <Input
                  type="text"
                  inputMode="numeric"
                  value={carryOverBalance === 0 ? "" : formatWonIntl(carryOverBalance)}
                  onChange={(e) => {
                    setCarryOverTouched(true);
                    const raw = e.target.value.replace(/[^0-9]/g, "");
                    const v = raw === "" ? 0 : parseInt(raw, 10);
                    if (Number.isFinite(v)) {
                      setCarryOverBalance(v);
                      try {
                        localStorage.setItem(SURVIVAL_CARRYOVER_STORAGE_KEY, String(v));
                      } catch { /* ignore */ }
                    }
                  }}
                  onBlur={() => {
                    try {
                      localStorage.setItem(SURVIVAL_CARRYOVER_STORAGE_KEY, String(carryOverBalance));
                    } catch { /* ignore */ }
                  }}
                  className="h-8 w-28 text-right text-sm tabular-nums"
                  placeholder="0"
                />
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-slate-600">현재 잔고</span>
                <span className="font-semibold tabular-nums text-amber-800">{formatWonIntl(survivalResolved.currentBalance)}</span>
              </div>
              <p className="text-xs text-slate-500">
                이월 + {selectedMonth} 입금 {formatWonIntl(dbFinanceSummary.revenue)} − 출금 {formatWonIntl(dbFinanceSummary.purchase)}
              </p>
              <div className="border-t border-amber-200/60 pt-2 space-y-1">
                <div className="flex justify-between text-sm">
                  <span className="text-amber-800">정산 반영 합계</span>
                  <CountUp value={dbFinanceSummary.margin} className="font-semibold text-emerald-600 tabular-nums" />
                </div>
                <p className="text-[11px] leading-snug text-amber-900/70">
                  {selectedMonth} · 승인(PAID)만 · 통합 원장(DB·엑셀·수동 반영) — 위 입금 합 − 출금 합과 동일
                </p>
              </div>
            </CardContent>
          </Card>

          {/* 2. 월 목표 달성율 & 영업일 예상 */}
          <Card className="rounded-2xl border-2 border-slate-200 bg-white shadow-md flex-shrink-0">
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-base font-bold text-slate-800">
                <Target className="size-5 text-[var(--primary)]" />
                월 목표 달성율 & 영업일 예상
              </CardTitle>
              <p className="text-xs text-slate-500">{selectedMonth} 기준</p>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-baseline justify-between gap-2">
                <CountUp value={effectiveAchievement} format="percent" className="text-2xl font-bold tabular-nums text-[var(--primary)]" />
                <span className="text-xs text-slate-500 shrink-0">목표 {formatWonIntl(summary.targetGrossProfit)}</span>
              </div>
              <div className="h-3 overflow-hidden rounded-full bg-slate-100">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-[var(--primary)] to-blue-400 transition-all duration-500"
                  style={{ width: `${Math.min(effectiveAchievement, 100)}%` }}
                />
              </div>
              <p className="text-sm font-medium text-slate-700">
                <span className="text-slate-500">{selectedMonth}</span> 영업일 {passedWorkDays}/{workDays}일 진행 · 남은 {remainingDays}일
              </p>
              <p className="text-sm text-slate-600">
                일평균 매출총이익 <span className="font-semibold tabular-nums text-slate-800">{formatWonIntl(dailyAvgProfit)}</span>
              </p>
              <div className="rounded-lg border-2 border-emerald-200 bg-emerald-50/80 px-3 py-3">
                <p className="text-xs font-semibold text-emerald-700">월말 예상 이익</p>
                <p className="mt-1 text-xl font-bold tabular-nums text-emerald-800">{formatWonIntl(projectedProfit)}</p>
              </div>
            </CardContent>
          </Card>

          {/* 3. 금일 요약 */}
          <Card className="rounded-2xl glass-card shadow-[0_8px_30px_rgb(0,0,0,0.04)] backdrop-blur-2xl flex-shrink-0">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold">금일 요약</CardTitle>
              <CardDescription className="text-xs">
                오늘 날짜·승인(PAID) 거래 기준, 금액은 공급가(부가세 제외, 10% 역산)
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex justify-between text-sm tracking-tight">
                <span className="text-slate-600">오늘 매출</span>
                <span className="font-semibold text-slate-800">{formatWonIntl(todaySupplySummary.revenueSupply)}</span>
              </div>
              <div className="flex justify-between text-sm tracking-tight">
                <span className="text-slate-600">오늘 매입</span>
                <span className="font-semibold text-rose-500">-{formatWonIntl(todaySupplySummary.purchaseSupply)}</span>
              </div>
              <div className="flex justify-between text-sm tracking-tight">
                <span className="text-slate-600">오늘 매출총이익</span>
                <span className={`font-semibold tabular-nums ${todaySupplySummary.marginSupply >= 0 ? "text-slate-800" : "text-rose-600"}`}>
                  {formatWonIntl(todaySupplySummary.marginSupply)}
                </span>
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

      {/* 매출 분석: 수치는 통합 원장·선택 월·PAID 연동 / 목표·운영비 등은 엑셀 JSON(summary·survival) */}
      {viewMode === "analytics" && (
        <SalesAnalysisView
          currentStatus={ledgerDerivedCurrentStatus}
          survival={survival}
          receivablesExpected={receivablesExpected}
          setReceivablesExpected={setReceivablesExpected}
          payablesExpected={payablesExpected}
          setPayablesExpected={setPayablesExpected}
          teamSalesReport={ledgerTeamSalesReport}
          teamTargetGp={ledgerTeamTargetGp}
          overallRefundRatePct={ledgerOverallRefundRatePct}
          dailyAvgProfit={dailyAvgProfit}
          workDays={workDays}
          passedWorkDays={passedWorkDays}
          selectedMonth={selectedMonth}
        />
      )}
    </div>
  );
}

/** 매출 분석 뷰 — 엑셀 용어: 매출 현황·미수금/미지급금·매출 총이익 예상·이번달 예상 잔고·팀별·목표 매출총이익 */
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
  dailyAvgProfit = 0,
  workDays = 0,
  passedWorkDays = 0,
  selectedMonth = "",
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
  dailyAvgProfit?: number;
  workDays?: number;
  passedWorkDays?: number;
  selectedMonth?: string;
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

  const operatingDeduction = survival.operatingDeduction ?? 50_000_000;
  // 공통 유틸로 계산 (Reports, Dashboard와 동일 로직)
  const { vatOnGross, expectedBalance: balanceAfterExpected, finalExpectedBalance } = computeExpectedBalance({
    currentBalance: currentStatus.survivalBalance,
    receivablesTotal,
    payablesTotal,
    operatingDeduction,
    grossSupply: marginSupply,
  });

  const totalTeamRevenue = teamSalesReport.reduce((s, x) => s + x.revenue, 0);
  const totalTeamGross = teamSalesReport.reduce((s, x) => s + x.grossProfit, 0);
  const overallMarginPct = totalTeamRevenue > 0 ? (totalTeamGross / totalTeamRevenue) * 100 : 0;

  return (
    <div className="view-fade-in space-y-6">
      {selectedMonth && workDays > 0 && (
        <div className="rounded-xl border border-slate-200 bg-slate-50/80 px-4 py-3 text-sm">
          <span className="text-slate-600">{selectedMonth} · 통합 원장 연동 · 승인(PAID) · </span>
          <span className="font-semibold text-slate-800">일평균 매출총이익 {formatWonIntl(dailyAvgProfit)}</span>
          <span className="text-slate-500"> (해당월 영업일 {passedWorkDays}/{workDays}일)</span>
        </div>
      )}
      {/* 매출 현황 (엑셀 상단 블록과 동일 용어) */}
      <Card className="overflow-hidden rounded-2xl glass-card">
        <CardHeader className="pb-2">
          <CardTitle className="text-base">매출 현황</CardTitle>
          <CardDescription className="text-xs">통합 원장 · 선택 월 · 승인(PAID) — 공급가액·부가세·합산(거래금액), 현재 잔고</CardDescription>
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
                  <td className="px-4 py-2 font-medium text-slate-800">매입 [환불제외]</td>
                  <td className="px-3 py-2">-</td>
                  <td className="px-3 py-2 text-right tabular-nums">{formatWonIntl(currentStatus.purchaseSupply)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{formatWonIntl(currentStatus.purchaseVat)}</td>
                  <td className="px-3 py-2 text-right tabular-nums font-medium">{formatWonIntl(currentStatus.purchaseTotal)}</td>
                  <td className="px-4 py-2" />
                </tr>
                <tr className="border-b border-slate-100">
                  <td className="px-4 py-2 font-medium text-slate-800">매출총이익</td>
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
            현재 잔고: <span className="tabular-nums text-[var(--primary)]">{formatWonIntl(currentStatus.survivalBalance)}</span>
            <span className="ml-2 text-xs font-normal text-slate-500">(이월 + 입금 − 출금, 통합 원장)</span>
          </p>
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* 미수금 - 기입 가능 */}
        <Card className="overflow-hidden rounded-2xl glass-card">
          <CardHeader className="pb-2 flex flex-row items-center justify-between">
            <div>
              <CardTitle className="text-base">미수금</CardTitle>
              <CardDescription className="text-xs">미수금/미지급금 관리 — 미수금. 통합 원장·로컬 저장과 동기화</CardDescription>
            </div>
            <button
              type="button"
              onClick={() => setReceivablesExpected((prev) => [...prev, { id: `er-${Date.now()}`, category: "미수금", item: "", supplyAmount: 0, vat: 0, memo: "" }])}
              className="rounded-lg bg-emerald-100 px-3 py-1.5 text-sm font-medium text-emerald-800 hover:bg-emerald-200"
            >
              + 행 추가
            </button>
          </CardHeader>
          <CardContent className="p-0">
            <ExpectedLinesTable
              rows={receivablesExpected}
              setRows={setReceivablesExpected}
              totalLabel="합산"
              showTotalRow={false}
            />
          </CardContent>
        </Card>

        {/* 미지급금 - 기입 가능 */}
        <Card className="overflow-hidden rounded-2xl glass-card">
          <CardHeader className="pb-2 flex flex-row items-center justify-between">
            <div>
              <CardTitle className="text-base">미지급금</CardTitle>
              <CardDescription className="text-xs">미수금/미지급금 관리 — 미지급금. 통합 원장·로컬 저장과 동기화</CardDescription>
            </div>
            <button
              type="button"
              onClick={() => setPayablesExpected((prev) => [...prev, { id: `ep-${Date.now()}`, category: "미지급금", item: "", supplyAmount: 0, vat: 0, memo: "" }])}
              className="rounded-lg bg-rose-100 px-3 py-1.5 text-sm font-medium text-rose-800 hover:bg-rose-200"
            >
              + 행 추가
            </button>
          </CardHeader>
          <CardContent className="p-0">
            <ExpectedLinesTable
              rows={payablesExpected}
              setRows={setPayablesExpected}
              totalLabel="합산"
              showTotalRow
            />
          </CardContent>
        </Card>
      </div>

      {/* 매출 총이익 예상 */}
      <Card className="overflow-hidden rounded-2xl glass-card">
        <CardHeader className="pb-2">
          <CardTitle className="text-base">매출 총이익 예상</CardTitle>
          <CardDescription className="text-xs">위 매출 현황 + 미수금·미지급금 반영 (예상 매출·예상 매입·예상 매출총이익)</CardDescription>
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
                  <td className="px-4 py-2 font-medium text-slate-800">예상 매출 합계</td>
                  <td className="px-3 py-2 text-right tabular-nums">{formatWonIntl(expectedSalesSupply)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{formatWonIntl(expectedSalesVat)}</td>
                  <td className="px-3 py-2 text-right tabular-nums font-medium">{formatWonIntl(expectedSalesTotal)}</td>
                  <td className="px-4 py-2" />
                </tr>
                <tr className="border-b border-slate-100">
                  <td className="px-4 py-2 font-medium text-slate-800">예상 매입 합계</td>
                  <td className="px-3 py-2 text-right tabular-nums">{formatWonIntl(expectedPurchaseSupply)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{formatWonIntl(expectedPurchaseVat)}</td>
                  <td className="px-3 py-2 text-right tabular-nums font-medium">{formatWonIntl(expectedPurchaseTotal)}</td>
                  <td className="px-4 py-2" />
                </tr>
                <tr className="border-b border-slate-100 bg-emerald-50/50">
                  <td className="px-4 py-2 font-semibold text-emerald-800">예상 매출총이익</td>
                  <td className="px-3 py-2 text-right tabular-nums font-semibold text-emerald-700">{formatWonIntl(marginSupply)}</td>
                  <td className="px-3 py-2 text-right tabular-nums font-semibold text-emerald-700">매총 부가세 {formatWonIntl(vatOnGross)}</td>
                  <td className="px-3 py-2 text-right tabular-nums font-semibold text-emerald-700">{formatWonIntl(marginTotal)}</td>
                  <td className="px-4 py-2 text-xs text-slate-500">매출 총이익 예상</td>
                </tr>
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* 이번달 예상 잔고 */}
      <Card className="overflow-hidden rounded-2xl glass-card">
        <CardHeader className="pb-2">
          <CardTitle className="text-base">이번달 예상 잔고</CardTitle>
          <CardDescription className="text-xs">현재 잔고 + 미수금 − 미지급금 후, 운영비 차감·매총 부가세 반영</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm tracking-tight">
              <tbody>
                <tr className="border-b border-slate-100">
                  <td className="px-4 py-2 font-medium text-slate-800">예상 잔고</td>
                  <td className="px-3 py-2 text-right tabular-nums font-medium">{formatWonIntl(balanceAfterExpected)}</td>
                  <td className="px-4 py-2 text-xs text-slate-500">현재 잔고 + 미수금 − 미지급금</td>
                </tr>
                <tr className="border-b border-slate-100">
                  <td className="px-4 py-2 font-medium text-slate-800">운영비 차감</td>
                  <td className="px-3 py-2 text-right tabular-nums text-rose-600">-{formatWonIntl(operatingDeduction)}</td>
                  <td className="px-4 py-2" />
                </tr>
                <tr className="border-b border-slate-100">
                  <td className="px-4 py-2 font-medium text-slate-800">매총 부가세</td>
                  <td className="px-3 py-2 text-right tabular-nums text-rose-600">-{formatWonIntl(vatOnGross)}</td>
                  <td className="px-4 py-2" />
                </tr>
                <tr className="bg-slate-50/80">
                  <td className="px-4 py-3 font-semibold text-slate-800">이번달 예상 잔고</td>
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
            <CardTitle className="text-base">팀별</CardTitle>
            <CardDescription className="text-xs">통합 원장 분류(팀) 기준 · 표시 순서: 더널리 → 티제이웹 → 기타·그 외(분류 없음은 기타)</CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm tracking-tight">
                <thead>
                  <tr className="border-b border-slate-200/80 bg-slate-50/80">
                    <th className="px-4 py-2 text-left font-medium text-slate-600">분류</th>
                    <th className="px-3 py-2 text-right font-medium text-slate-600">매출액</th>
                    <th className="px-3 py-2 text-right font-medium text-slate-600">매입액</th>
                    <th className="px-3 py-2 text-right font-medium text-slate-600">매출 총이익</th>
                    <th className="px-3 py-2 text-right font-medium text-slate-600">매출총이익률</th>
                  </tr>
                </thead>
                <tbody>
                  {teamSalesReport.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="px-4 py-6 text-center text-sm text-slate-500">
                        선택 월에 승인(PAID)된 통합 원장 거래가 없습니다. 팀은 원장의 <strong>분류</strong>(엑셀 팀 열) 기준으로 집계됩니다.
                      </td>
                    </tr>
                  ) : (
                    teamSalesReport.map((r) => (
                      <tr key={r.team} className="border-b border-slate-100">
                        <td className="px-4 py-2 font-medium text-slate-800">{r.team}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{formatWonIntl(r.revenue)}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{formatWonIntl(r.cost)}</td>
                        <td className="px-3 py-2 text-right tabular-nums font-medium">{formatWonIntl(r.grossProfit)}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{r.marginRatePct.toFixed(2)}%</td>
                      </tr>
                    ))
                  )}
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
            <CardTitle className="text-base">목표 매출 총이익 (팀별)</CardTitle>
            <CardDescription className="text-xs">월 목표 매출 총이익을 팀 매출액 비율로 배분 · 매출 총이익·초과 달성액·달성 여부</CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm tracking-tight">
                <thead>
                  <tr className="border-b border-slate-200/80 bg-slate-50/80">
                    <th className="px-4 py-2 text-left font-medium text-slate-600">분류</th>
                    <th className="px-3 py-2 text-right font-medium text-slate-600">목표 매출 총이익</th>
                    <th className="px-3 py-2 text-right font-medium text-slate-600">매출 총이익</th>
                    <th className="px-3 py-2 text-right font-medium text-slate-600">초과 달성액</th>
                    <th className="px-3 py-2 text-center font-medium text-slate-600">달성 여부</th>
                  </tr>
                </thead>
                <tbody>
                  {teamTargetGp.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="px-4 py-6 text-center text-sm text-slate-500">
                        팀별 매출이 없으면 목표 배분을 할 수 없습니다. 통합 원장에서 분류(팀)를 입력한 뒤 확인하세요.
                      </td>
                    </tr>
                  ) : (
                    teamTargetGp.map((r) => (
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
                    ))
                  )}
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

const LedgerRowComponent = React.memo(function LedgerRowComponent({
  row,
  approvingId,
  justApprovedId,
  onApprove,
  onEdit,
  onEditRow,
  onAmountChange,
  onDelete,
  onReceipt,
  clients,
}: {
  row: LedgerRow;
  approvingId: string | null;
  justApprovedId: string | null;
  onApprove: (classification: string, clientName: string) => Promise<void>;
  onEdit?: (id: string, patch: { classification?: string; clientName?: string }) => void;
  onEditRow?: () => void;
  onAmountChange?: (id: string, amount: number, source?: string) => void;
  onDelete?: (id: string) => void;
  onReceipt?: () => void;
  clients?: { id: string; name: string; aliases: string[]; representative?: string | null }[];
}) {
  const isPending = row.status === "UNMAPPED";
  const isApproving = approvingId === row.id;
  const justApproved = justApprovedId === row.id;
  const isFinanceCompleted = row.source === "finance" && !isPending;
  const canEditPaid = !isPending && onEdit && !isFinanceCompleted;

  const [classification, setClassification] = useState(row.classification ?? "");
  const [clientName, setClientName] = useState(row.clientName ?? "");
  const [showClassDropdown, setShowClassDropdown] = useState(false);
  const [showClientDropdown, setShowClientDropdown] = useState(false);
  const [amountStr, setAmountStr] = useState(String(row.amount));
  useEffect(() => {
    setAmountStr(String(row.amount));
  }, [row.amount]);
  const amountNum = parseInt(amountStr.replace(/[^0-9]/g, ""), 10) || 0;

  const revenueAmount = row.type === "DEPOSIT" ? row.amount : 0;
  const costAmount = row.type === "WITHDRAWAL" ? row.amount : 0;
  const grossProfit = revenueAmount - costAmount;

  const canApprove = isPending;

  return (
    <tr
      className={`border-b border-slate-100 align-middle transition-all duration-300 ${
        justApproved ? "bg-white" : isPending ? "bg-amber-50/50" : "bg-transparent hover:bg-blue-50/40"
      }`}
    >
      <td className="w-20 px-2 py-2 text-slate-700 whitespace-nowrap text-xs">{row.date}</td>
      <td className="px-2 py-2 min-w-0">
        {(isPending || canEditPaid) ? (
          <div className="relative">
            <button
              type="button"
              onClick={() => {
                setShowClassDropdown((v) => !v);
                setShowClientDropdown(false);
              }}
              className="flex min-w-0 w-full items-center justify-between rounded border border-dashed border-slate-300 bg-white px-1.5 py-1 text-left text-xs text-slate-500 hover:border-[var(--primary)]/50 hover:text-slate-700 truncate"
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
          <span className="text-xs text-slate-800 truncate block">{row.classification || "-"}</span>
        )}
      </td>
      <td className="px-2 py-2 min-w-0">
        {(isPending || canEditPaid) ? (
          <div className="relative">
            <button
              type="button"
              onClick={() => {
                setShowClientDropdown((v) => !v);
                setShowClassDropdown(false);
              }}
              className="flex min-w-0 w-full items-center justify-between rounded border border-dashed border-slate-300 bg-white px-1.5 py-1 text-left text-xs text-slate-500 hover:border-[var(--primary)]/50 hover:text-slate-700 truncate"
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
                  {/* CRM 자동 제안 */}
                  {(() => {
                    const raw = (row.senderName ?? "").trim().toLowerCase();
                    const suggestions = raw && clients
                      ? clients.filter((c) => {
                          const rep = (c.representative ?? "").toLowerCase();
                          return c.name.toLowerCase().includes(raw) ||
                            c.aliases.some((a) => a.toLowerCase().includes(raw)) ||
                            raw.includes(c.name.toLowerCase()) ||
                            c.aliases.some((a) => a && raw.includes(a.toLowerCase())) ||
                            (rep && (rep.includes(raw) || raw.includes(rep)));
                        }).slice(0, 4)
                      : [];
                    if (suggestions.length === 0) return null;
                    return (
                      <div className="mt-1.5">
                        <p className="mb-1 text-[10px] font-semibold text-blue-600">CRM 매칭 후보</p>
                        <div className="flex flex-wrap gap-1">
                          {suggestions.map((c) => (
                            <button
                              key={c.id}
                              type="button"
                              className="rounded bg-blue-50 px-2 py-0.5 text-xs text-blue-700 hover:bg-blue-100"
                              onClick={() => {
                                setClientName(c.name);
                                setShowClientDropdown(false);
                                if (canEditPaid && onEdit) onEdit(row.id, { clientName: c.name });
                              }}
                            >
                              {c.name}
                            </button>
                          ))}
                        </div>
                      </div>
                    );
                  })()}
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
          row.clientName
            ? <Link href={`/crm?search=${encodeURIComponent(row.clientName)}`} className="text-xs text-blue-600 hover:underline truncate block" title="CRM에서 보기">{row.clientName}</Link>
            : <span className="text-xs text-slate-400">-</span>
        )}
      </td>
      <td className="w-28 min-w-[7rem] px-2 py-2 text-right text-xs tabular-nums font-medium whitespace-nowrap">
        {isPending && onAmountChange ? (
          <div className="flex items-center justify-end gap-0.5">
            {row.type === "WITHDRAWAL" && <span className="text-rose-500">-</span>}
            <input
              type="text"
              inputMode="numeric"
              value={amountStr === "" ? "" : formatWonIntl(amountNum)}
              onChange={(e) => setAmountStr(e.target.value.replace(/[^0-9]/g, ""))}
              onBlur={() => {
                if (amountNum > 0 && amountNum !== row.amount) {
                  onAmountChange(row.id, amountNum, row.source);
                }
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  (e.target as HTMLInputElement).blur();
                }
              }}
              className="w-20 rounded border border-slate-300 bg-white px-1.5 py-1 text-right text-xs tabular-nums focus:border-[var(--primary)] focus:outline-none focus:ring-1 focus:ring-[var(--primary)]"
            />
          </div>
        ) : revenueAmount > 0 ? (
          <span className="text-slate-800">+{formatWonIntl(revenueAmount)}</span>
        ) : costAmount > 0 ? (
          <span className="text-rose-500">-{formatWonIntl(costAmount)}</span>
        ) : (
          "-"
        )}
      </td>
      <td className="w-24 px-2 py-2 text-right text-xs tabular-nums text-slate-600 whitespace-nowrap">
        {row.amount ? (
          <span>{formatWonIntl(amountToSupplyVat(row.amount).supply)}</span>
        ) : (
          "-"
        )}
      </td>
      <td className="w-16 px-1 py-2 text-center whitespace-nowrap">
        {isPending ? (
          <span className="inline-flex items-center gap-0.5 rounded border border-amber-300/80 bg-amber-100/80 px-1.5 py-0.5 text-[10px] font-medium text-amber-800">
            분류필요
          </span>
        ) : (
          <span className="inline-flex items-center gap-0.5 rounded border border-emerald-200/80 bg-emerald-100/80 px-1.5 py-0.5 text-[10px] font-medium text-emerald-800">
            완료
          </span>
        )}
      </td>
      <td className="w-20 px-1 py-2 text-center whitespace-nowrap">
        <div className="flex items-center justify-center gap-1">
          {isPending ? (
            <button
              type="button"
              onClick={() => onApprove(classification, clientName)}
              disabled={!canApprove || isApproving}
              className="rounded bg-[var(--primary)] px-2 py-1 text-xs font-semibold text-white hover:bg-[var(--primary)]/90 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isApproving ? "..." : "승인"}
            </button>
          ) : (
            <span className="text-slate-300 text-xs">-</span>
          )}
          {onEditRow && (
            <button
              type="button"
              onClick={onEditRow}
              className="rounded p-1 text-slate-300 hover:bg-slate-100 hover:text-slate-600"
              title="수정"
            >
              수정
            </button>
          )}
          {onReceipt && row.source === "finance" && (
            <button
              type="button"
              onClick={onReceipt}
              className="rounded p-1 text-slate-300 hover:bg-blue-50 hover:text-blue-500"
              title="영수증 / 세금계산서"
            >
              <FileText className="size-3.5" />
            </button>
          )}
          {onDelete && (
            <button
              type="button"
              onClick={() => onDelete(row.id)}
              className="rounded p-1 text-slate-300 hover:bg-red-50 hover:text-red-500"
              title="삭제"
            >
              <Trash2 className="size-3.5" />
            </button>
          )}
        </div>
      </td>
    </tr>
  );
});

function EditLedgerModal({
  row,
  onSave,
  onClose,
}: {
  row: LedgerRow;
  onSave: (patch: Partial<LedgerRow>) => void;
  onClose: () => void;
}) {
  const [date, setDate] = useState(row.date);
  const [amount, setAmount] = useState(String(row.amount));
  const [type, setType] = useState<"DEPOSIT" | "WITHDRAWAL">(row.type);
  const [senderName, setSenderName] = useState(row.senderName ?? "");
  const [bankName, setBankName] = useState(row.bankName ?? "");
  const [classification, setClassification] = useState(row.classification ?? "");
  const [clientName, setClientName] = useState(row.clientName ?? "");
  const [status, setStatus] = useState<"UNMAPPED" | "PAID">(row.status);

  const amountNum = parseInt(amount.replace(/[^0-9]/g, ""), 10) || 0;

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-[600px]">
        <DialogHeader>
          <DialogTitle>원장 수정</DialogTitle>
          <DialogDescription>수동으로 추가한 항목만 수정할 수 있습니다.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-2">
          <div className="grid grid-cols-2 gap-4">
            <div className="grid gap-2">
              <Label>날짜</Label>
              <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
            <div className="grid gap-2">
              <Label>금액 (부가세 포함)</Label>
              <Input
                type="text"
                inputMode="numeric"
                placeholder="0"
                value={amount === "" ? "" : formatWonIntl(parseInt(amount.replace(/[^0-9]/g, ""), 10) || 0)}
                onChange={(e) => setAmount(e.target.value.replace(/[^0-9]/g, ""))}
                className="tabular-nums"
              />
            </div>
          </div>
          <div className="grid gap-2">
            <Label>구분</Label>
            <select
              value={type}
              onChange={(e) => setType(e.target.value as "DEPOSIT" | "WITHDRAWAL")}
              className="flex h-10 w-full rounded-md border border-[var(--border)] bg-transparent px-3 py-2 text-sm"
            >
              <option value="DEPOSIT">입금 (매출)</option>
              <option value="WITHDRAWAL">출금 (매입)</option>
            </select>
          </div>
          <div className="grid gap-2">
            <Label>입금자/업체명</Label>
            <Input placeholder="입금자 또는 업체명" value={senderName} onChange={(e) => setSenderName(e.target.value)} />
          </div>
          <div className="grid gap-2">
            <Label>결제 방식</Label>
            <Input placeholder="무통장, 카드 등" value={bankName} onChange={(e) => setBankName(e.target.value)} />
          </div>
          <div className="grid gap-2">
            <Label>카테고리</Label>
            <select
              value={classification}
              onChange={(e) => setClassification(e.target.value)}
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
            <Input placeholder="고객사/적요" value={clientName} onChange={(e) => setClientName(e.target.value)} />
          </div>
          <div className="grid gap-2">
            <Label>승인 상태</Label>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value as "UNMAPPED" | "PAID")}
              className="flex h-10 w-full rounded-md border border-[var(--border)] bg-transparent px-3 py-2 text-sm"
            >
              <option value="UNMAPPED">미승인 (분류필요)</option>
              <option value="PAID">완료</option>
            </select>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>취소</Button>
          <Button
            onClick={() => onSave({ date, amount: amountNum, type, senderName, bankName, classification: classification || undefined, clientName: clientName || undefined, status })}
            disabled={!date || amountNum <= 0}
          >
            저장
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
