/**
 * 엑셀 파싱 결과(public/finance-current.json) 타입
 * 스크립트: node scripts/parse-finance-xlsx.js "경로/파일.xlsx"
 * 결과는 public/finance-current.json (+ data/) 에 저장되어 fetch로 로드
 *
 * 시트 매핑(티앤에스 매출 통계 양식):
 * - 요약: "현재 월 매출" 라벨 행 + 그 다음 행에 월 매출·매입·매총·영업일·남은 목표
 * - 생존통장: 같은 라벨 행에 이월, 값 행에 현재 잔고; 이후 행에 운영비·매총 부가세·예상 잔고·이번달 성과
 * - 달성율: 엑셀 "달성율" / "영업일 대비 달성율" 셀 값 우선
 * - 팀별: "분류" 헤더(매출액 열) 다음 행부터 ~ "전체 매출총익률" 전까지
 * - 미수/미지급: 해당 구간에서 H열=미수금|미지급금, 공급가는 J열(10)
 * - 매출분석 합계: "합계" 행의 거래금액·공급가액(매출/매입 각각)
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

/**
 * 생존통장 예상 잔고 계산 (Finance, Reports, Dashboard 공통 로직)
 *
 * @param currentBalance 현재 잔고 (이월 + 당월 매출 - 매입)
 * @param receivablesTotal 미수금 합계 (공급가 + 부가세)
 * @param payablesTotal 미지급금 합계 (공급가 + 부가세)
 * @param operatingDeduction 운영비 차감 금액
 * @param grossSupply 매출총이익 공급가 (VAT 계산 기준)
 */
export function computeExpectedBalance(params: {
  currentBalance: number;
  receivablesTotal: number;
  payablesTotal: number;
  operatingDeduction: number;
  grossSupply: number;
}): { vatOnGross: number; expectedBalance: number; finalExpectedBalance: number } {
  const { currentBalance, receivablesTotal, payablesTotal, operatingDeduction, grossSupply } = params;
  const vatOnGross = Math.round(grossSupply * 0.1);
  const expectedBalance = currentBalance + receivablesTotal - payablesTotal;
  const finalExpectedBalance = expectedBalance - operatingDeduction - vatOnGross;
  return { vatOnGross, expectedBalance, finalExpectedBalance };
}
