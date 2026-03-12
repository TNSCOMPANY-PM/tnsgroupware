/**
 * 엑셀 파싱 결과(public/finance-current.json) 타입
 * 스크립트: node scripts/parse-finance-xlsx.js "경로/파일.xlsx"
 * 결과는 public/finance-current.json 에 저장되어 fetch로 로드
 */

import type {
  MonthSummary,
  SurvivalAccount,
  CurrentStatus,
  ExpectedLineItem,
  TeamSalesReportRow,
  TeamTargetGp,
} from "@/constants/finance";

export interface LedgerEntryJson {
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

export interface FinanceCurrentJson {
  sheetLabel: string;
  ledgerEntries?: LedgerEntryJson[];
  monthSummary: {
    label: string;
    currentRevenue: number;
    currentCost: number;
    grossProfit: number;
    workDays: number;
    passedWorkDays: number;
    targetGrossProfit: number;
    remainingTarget: number;
    achievementRate: number;
    workDayAchievementRate: number;
  };
  survivalAccount: {
    carryOverBalance: number;
    currentBalance: number;
    operatingDeduction: number;
    vatOnGross: number;
    expectedBalance: number;
    monthlyPerformance: number;
  };
  dashboard: {
    monthlyRevenue: number;
    monthlyGrossProfit: number;
    survivalBalance: number;
  };
  /** 매출 분석 뷰: 현재 매출/매입/매총·생존통장 (파서에서 채움) */
  currentStatus?: CurrentStatus;
  teamSalesReport?: TeamSalesReportRow[];
  receivablesExpected?: ExpectedLineItem[];
  payablesExpected?: ExpectedLineItem[];
  teamTargetGp?: TeamTargetGp[];
  overallRefundRatePct?: number;
}

const DEFAULT_DASHBOARD = {
  monthlyRevenue: 185_000_000,
  monthlyGrossProfit: 62_500_000,
  survivalBalance: 42_000_000,
};

export function parseDashboardFinance(data: FinanceCurrentJson | null): {
  monthlyRevenue: number;
  monthlyGrossProfit: number;
  survivalBalance: number;
} {
  const d = data?.dashboard;
  if (d && (d.monthlyRevenue > 0 || d.monthlyGrossProfit !== 0 || d.survivalBalance !== 0))
    return d;
  return DEFAULT_DASHBOARD;
}

export function parseMonthSummary(data: FinanceCurrentJson | null): MonthSummary | null {
  const m = data?.monthSummary;
  if (!m) return null;
  return {
    label: m.label,
    currentRevenue: m.currentRevenue,
    currentCost: m.currentCost,
    grossProfit: m.grossProfit,
    workDays: m.workDays,
    passedWorkDays: m.passedWorkDays,
    targetGrossProfit: m.targetGrossProfit,
    remainingTarget: m.remainingTarget,
    achievementRate: m.achievementRate,
    workDayAchievementRate: m.workDayAchievementRate,
  };
}

export function parseSurvivalAccount(data: FinanceCurrentJson | null): SurvivalAccount | null {
  const s = data?.survivalAccount;
  if (!s) return null;
  return {
    carryOverBalance: s.carryOverBalance,
    currentBalance: s.currentBalance,
    operatingDeduction: s.operatingDeduction,
    vatOnGross: s.vatOnGross,
    expectedBalance: s.expectedBalance,
    monthlyPerformance: s.monthlyPerformance,
  };
}
