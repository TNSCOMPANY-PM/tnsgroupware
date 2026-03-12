/**
 * 자동 매칭 정산 시스템 - Bank Transaction & Invoice Store
 * (DB 미연동 시 인메모리 저장)
 */

export type TransactionType = "DEPOSIT" | "WITHDRAWAL";

export type TransactionStatus = "UNMAPPED" | "PAID" | "MATCHED";

export interface BankTransaction {
  id: string;
  date: string;
  amount: number;
  senderName: string;
  type: TransactionType;
  bankName: string;
  status: TransactionStatus;
  matchedInvoiceId?: string;
  /** 승인 시 사용자 입력 (인라인 분류/고객사) */
  classification?: string;
  clientName?: string;
  createdAt: string;
}

export type InvoiceStatus = "PENDING" | "PAID";

export interface Invoice {
  id: string;
  clientName: string;
  amount: number;
  dueDate: string;
  description?: string;
  status: InvoiceStatus;
  transactionId?: string;
  createdAt: string;
}

// 통합 원장: UNMAPPED(승인 대기) + PAID(정산 완료). Webhook 데이터는 최상단(최신)에 인서트됨.
const transactions: BankTransaction[] = [
  {
    id: "tx-demo-1",
    date: "2026-03-10",
    amount: 20000,
    senderName: "이지임스",
    type: "DEPOSIT",
    bankName: "신한은행",
    status: "UNMAPPED",
    createdAt: new Date().toISOString(),
  },
  {
    id: "tx-demo-2",
    date: "2026-03-11",
    amount: 100000,
    senderName: "(주)굿키노",
    type: "DEPOSIT",
    bankName: "국민은행",
    status: "UNMAPPED",
    createdAt: new Date().toISOString(),
  },
  {
    id: "tx-demo-3",
    date: "2026-03-11",
    amount: 30000,
    senderName: "(주)니즈원",
    type: "DEPOSIT",
    bankName: "신한은행",
    status: "UNMAPPED",
    createdAt: new Date().toISOString(),
  },
  {
    id: "tx-demo-paid-1",
    date: "2026-03-09",
    amount: 72600,
    senderName: "뷰 커뮤니케이션",
    type: "WITHDRAWAL",
    bankName: "신한은행",
    status: "PAID",
    classification: "더널리",
    clientName: "뷰 커뮤니케이션",
    createdAt: new Date(Date.now() - 86400000).toISOString(),
  },
  {
    id: "tx-demo-paid-2",
    date: "2026-03-08",
    amount: 100000,
    senderName: "지니스키친",
    type: "DEPOSIT",
    bankName: "국민은행",
    status: "PAID",
    classification: "더널리 충전",
    clientName: "지니스키친",
    createdAt: new Date(Date.now() - 172800000).toISOString(),
  },
];
const invoices: Invoice[] = [];

// 샘플 청구서 (미수금)
const SAMPLE_INVOICES: Omit<Invoice, "id" | "createdAt">[] = [
  { clientName: "이지임스", amount: 20000, dueDate: "2026-03-10", description: "더널리 충전", status: "PENDING" },
  { clientName: "노비타코리아", amount: 5000, dueDate: "2026-03-10", status: "PENDING" },
  { clientName: "지니스키친", amount: 100000, dueDate: "2026-03-10", status: "PENDING" },
  { clientName: "(주)굿키노", amount: 100000, dueDate: "2026-03-11", status: "PENDING" },
  { clientName: "(주)니즈원", amount: 30000, dueDate: "2026-03-11", status: "PENDING" },
  { clientName: "모두샵", amount: 100000, dueDate: "2026-03-11", status: "PENDING" },
  { clientName: "360마켓", amount: 300000, dueDate: "2026-03-11", status: "PENDING" },
  { clientName: "뷰 커뮤니케이션", amount: 72600, dueDate: "2026-03-11", description: "슬롯구입정산", status: "PENDING" },
];

function initInvoices() {
  if (invoices.length === 0) {
    const now = new Date().toISOString();
    SAMPLE_INVOICES.forEach((inv, i) => {
      invoices.push({
        ...inv,
        id: `inv-${i + 1}`,
        createdAt: now,
      });
    });
  }
}
initInvoices();

function generateId() {
  return `tx-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

/** Webhook 수신: 입출금 저장 및 자동 매칭 시도 */
export function ingestBankTransaction(payload: {
  date: string;
  amount: number;
  senderName: string;
  type: TransactionType;
  bankName: string;
}): { status: TransactionStatus; transaction: BankTransaction; matchedInvoice?: Invoice } {
  const tx: BankTransaction = {
    id: generateId(),
    date: payload.date,
    amount: payload.amount,
    senderName: payload.senderName,
    type: payload.type,
    bankName: payload.bankName,
    status: "UNMAPPED",
    createdAt: new Date().toISOString(),
  };

  if (payload.type === "DEPOSIT") {
    const match = findMatchingInvoice(payload.senderName, payload.amount);
    if (match) {
      tx.status = "PAID";
      tx.matchedInvoiceId = match.id;
      match.status = "PAID";
      match.transactionId = tx.id;
      transactions.push(tx);
      return { status: "PAID", transaction: tx, matchedInvoice: match };
    }
  }

  transactions.push(tx);
  return { status: "UNMAPPED", transaction: tx };
}

/** senderName + amount 1차 대조 */
function findMatchingInvoice(senderName: string, amount: number): Invoice | null {
  const normalized = (s: string) => s.replace(/\s/g, "").toLowerCase();
  const nameNorm = normalized(senderName);
  for (const inv of invoices) {
    if (inv.status !== "PENDING") continue;
    if (Math.abs(inv.amount - amount) <= 1) {
      if (normalized(inv.clientName).includes(nameNorm) || nameNorm.includes(normalized(inv.clientName))) {
        return inv;
      }
    }
  }
  for (const inv of invoices) {
    if (inv.status !== "PENDING") continue;
    if (Math.abs(inv.amount - amount) <= 1) return inv;
  }
  return null;
}

/** UNMAPPED 거래 목록 */
export function getUnmappedTransactions(): BankTransaction[] {
  return transactions
    .filter((t) => t.status === "UNMAPPED")
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
}

/** 청구서 목록 (PENDING만) */
export function getPendingInvoices(): Invoice[] {
  return invoices.filter((i) => i.status === "PENDING");
}

/** 금액/날짜 기반 유력 청구서 후보 3개 */
export function getInvoiceCandidates(
  amount: number,
  date: string,
  senderName?: string
): Invoice[] {
  const pending = getPendingInvoices();
  const dateNum = new Date(date).getTime();
  const scored = pending.map((inv) => {
    const amountDiff = Math.abs(inv.amount - amount);
    const dateDiff = Math.abs(new Date(inv.dueDate).getTime() - dateNum);
    const nameMatch =
      senderName && inv.clientName
        ? inv.clientName.replace(/\s/g, "").toLowerCase().includes(senderName.replace(/\s/g, "").toLowerCase()) ||
          senderName.replace(/\s/g, "").toLowerCase().includes(inv.clientName.replace(/\s/g, "").toLowerCase())
        : false;
    const score =
      (nameMatch ? 100 : 0) - amountDiff * 0.01 - dateDiff / (1000 * 60 * 60 * 24);
    return { inv, score };
  });
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, 3).map((s) => s.inv);
}

/** 수동 매칭: UNMAPPED → PAID */
export function matchTransactionToInvoice(
  transactionId: string,
  invoiceId: string
): { success: boolean; error?: string } {
  const tx = transactions.find((t) => t.id === transactionId);
  const inv = invoices.find((i) => i.id === invoiceId);
  if (!tx) return { success: false, error: "거래를 찾을 수 없습니다." };
  if (tx.status !== "UNMAPPED") return { success: false, error: "이미 매칭된 거래입니다." };
  if (!inv) return { success: false, error: "청구서를 찾을 수 없습니다." };
  if (inv.status !== "PENDING") return { success: false, error: "이미 수납된 청구서입니다." };

  tx.status = "PAID";
  tx.matchedInvoiceId = invoiceId;
  tx.classification = inv.description || "기타";
  tx.clientName = inv.clientName;
  inv.status = "PAID";
  inv.transactionId = transactionId;
  return { success: true };
}

/** 통합 원장: 승인 대기(UNMAPPED)를 최상단, 이어서 정산 완료(PAID) */
export function getLedger(): BankTransaction[] {
  const pending = transactions
    .filter((t) => t.status === "UNMAPPED")
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  const approved = transactions
    .filter((t) => t.status === "PAID")
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  return [...pending, ...approved];
}

/** 인라인 승인: 분류 + 고객사 입력 후 정산 완료 처리 */
export function approveTransaction(
  transactionId: string,
  classification: string,
  clientName: string
): { success: boolean; error?: string } {
  const tx = transactions.find((t) => t.id === transactionId);
  if (!tx) return { success: false, error: "거래를 찾을 수 없습니다." };
  if (tx.status !== "UNMAPPED") return { success: false, error: "이미 정산된 거래입니다." };
  tx.status = "PAID";
  tx.classification = classification;
  tx.clientName = clientName;
  return { success: true };
}

/** 정산 완료 건만 합산: 매출총이익(입금 - 출금) */
export function getApprovedGrossTotal(): number {
  return transactions
    .filter((t) => t.status === "PAID")
    .reduce((sum, t) => sum + (t.type === "DEPOSIT" ? t.amount : -t.amount), 0);
}
