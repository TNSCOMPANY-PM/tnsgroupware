/**
 * 매출/매입(통합 원장) 페이지와 동일한 소스·로직으로 당월 요약 계산.
 * DB finance + finance-current.json ledgerEntries + 수동 원장 + ledger API 를 합쳐서 집계.
 */

export interface FinanceRowForLedger {
  id: string;
  date?: string | null;
  month?: string;
  type: string;
  amount: number;
  status?: string;
  client_name?: string | null;
  description?: string | null;
  category?: string | null;
  created_at: string;
}

export interface LedgerRowForSummary {
  id: string;
  date: string;
  amount: number;
  type: "DEPOSIT" | "WITHDRAWAL";
  status: "UNMAPPED" | "PAID";
}

/** "26년 3월" 또는 row.date / row.month → 해당 월이 monthKey(YYYY-MM)와 같은지 */
export function isRowInMonth(rowDate: string, monthKey: string): boolean {
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

function toLedgerRow(r: FinanceRowForLedger): LedgerRowForSummary {
  const rawClientName =
    r.client_name ??
    (r.description?.startsWith("입금자: ")
      ? r.description.replace("입금자: ", "")
      : r.description ?? "");
  return {
    id: r.id,
    date: r.date ?? (r.month ? `${r.month}-01` : ""),
    amount: Number(r.amount) || 0,
    type: r.type === "매입" ? "WITHDRAWAL" : "DEPOSIT",
    status: (r.status === "completed" ? "PAID" : "UNMAPPED") as "UNMAPPED" | "PAID",
  };
}

function normalizeLedgerEntry(row: {
  id: string;
  date: string;
  amount: number;
  type: string;
  status: string;
}): LedgerRowForSummary {
  return {
    id: row.id,
    date: row.date,
    amount: Number(row.amount) || 0,
    type: row.type === "WITHDRAWAL" ? "WITHDRAWAL" : "DEPOSIT",
    status: (row.status === "PAID" ? "PAID" : "UNMAPPED") as "UNMAPPED" | "PAID",
  };
}

/**
 * 통합 원장과 동일한 방식으로 해당 월(YYYY-MM) 매출/매입/매출총이익 계산.
 * - ledgerSource: finance-current.json 의 ledgerEntries 또는 /api/transactions/ledger 결과 (배열)
 */
export function computeDashboardLedgerSummary(
  financeRows: FinanceRowForLedger[],
  ledgerSource: LedgerRowForSummary[],
  customEntries: LedgerRowForSummary[],
  editsOverlay: Record<string, Partial<LedgerRowForSummary>>,
  hiddenIds: Set<string>,
  monthKey: string
): { monthlyRevenue: number; monthlyGrossProfit: number; survivalBalance: number } {
  const ledgerFromFinance = financeRows.map(toLedgerRow);
  const merged = [...ledgerFromFinance, ...customEntries, ...ledgerSource].map((row) => {
    const edit = editsOverlay[row.id];
    if (!edit || Object.keys(edit).length === 0) return row;
    return { ...row, ...edit };
  });

  const rowsInMonthPaid = merged.filter(
    (r) =>
      isRowInMonth(r.date, monthKey) &&
      r.status === "PAID" &&
      !hiddenIds.has(r.id)
  );

  const revenue = rowsInMonthPaid
    .filter((r) => r.type === "DEPOSIT")
    .reduce((s, r) => s + Number(r.amount), 0);
  const purchase = rowsInMonthPaid
    .filter((r) => r.type === "WITHDRAWAL")
    .reduce((s, r) => s + Number(r.amount), 0);
  const margin = revenue - purchase;

  return {
    monthlyRevenue: revenue,
    monthlyGrossProfit: margin,
    survivalBalance: margin,
  };
}

const LEDGER_CUSTOM_STORAGE_KEY = "finance-ledger-custom-entries";
const LEDGER_EDITS_STORAGE_KEY = "finance-ledger-edits";
const LEDGER_HIDDEN_STORAGE_KEY = "finance-ledger-hidden-ids";

export function loadLedgerCustom(): LedgerRowForSummary[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(LEDGER_CUSTOM_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    const arr = Array.isArray(parsed) ? parsed : [];
    return arr.map((r: Record<string, unknown>) => ({
      id: String(r.id ?? ""),
      date: String(r.date ?? ""),
      amount: Number(r.amount) || 0,
      type: (r.type === "WITHDRAWAL" ? "WITHDRAWAL" : "DEPOSIT") as "DEPOSIT" | "WITHDRAWAL",
      status: (r.status === "PAID" ? "PAID" : "UNMAPPED") as "UNMAPPED" | "PAID",
    }));
  } catch {
    return [];
  }
}

export function loadLedgerEdits(): Record<string, Partial<LedgerRowForSummary>> {
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

export function loadLedgerHidden(): Set<string> {
  if (typeof window === "undefined") return new Set();
  try {
    const raw = localStorage.getItem(LEDGER_HIDDEN_STORAGE_KEY);
    if (!raw) return new Set();
    const parsed = JSON.parse(raw);
    const arr = Array.isArray(parsed) ? parsed : [];
    return new Set(arr.map(String));
  } catch {
    return new Set();
  }
}
