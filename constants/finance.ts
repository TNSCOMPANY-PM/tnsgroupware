/**
 * (주)티앤에스컴퍼니 매출 통계 24.01~ 구조 기반
 * 엑셀 시트: 월별(26년 3월, 26년 2월, ... 24년 01월)
 */

export interface TeamSummary {
  team: string;
  revenue: number;   // 매출액
  cost: number;      // 매입액
  grossProfit: number; // 매출 총이익
  marginRate?: number; // 매출총이익률
}

export interface MonthSummary {
  /** 예: "26년 3월" */
  label: string;
  currentRevenue: number;     // 현재 월 매출
  currentCost: number;        // 현재 월 매입
  grossProfit: number;        // 현재 매출총이익
  workDays: number;           // 해당월 영업일
  passedWorkDays: number;     // 지난 영업일
  targetGrossProfit: number;  // 목표 매출 총이익
  remainingTarget: number;    // 남은 목표 매출 총이익
  achievementRate: number;    // 달성율 (0~1)
  workDayAchievementRate: number; // 영업일 대비 달성율
}

export interface SurvivalAccount {
  carryOverBalance: number;   // 이월 잔고
  currentBalance: number;     // 현재 잔고
  operatingDeduction: number; // 운영비 차감
  vatOnGross: number;         // 매총 부가세
  expectedBalance: number;    // 이번달 예상 잔고
  monthlyPerformance: number; // 이번달 성과
}

export interface Receivables {
  category: string;  // 미수금/미지급금
  item: string;      // 나이스페이, 매체비, CPC 등
  amount: number;
  paidAmount?: number;
  difference?: number;
}

/** 현재 매출/매입/매총 (공급가액·부가세·합산) + 생존통장 잔액 */
export interface CurrentStatus {
  salesSupply: number;
  salesVat: number;
  salesTotal: number;
  purchaseSupply: number;
  purchaseVat: number;
  purchaseTotal: number;
  grossSupply: number;
  grossVat: number;
  grossTotal: number;
  survivalBalance: number;
}

/** 매출 예정액(미수금) / 매입 예정액(미지급금) 한 행 — 기입용 */
export interface ExpectedLineItem {
  id: string;
  category: string;   // 구분
  item: string;       // 항목
  supplyAmount: number; // 공급가액
  vat: number;        // 부가세 (공급가액의 10%)
  memo?: string;      // 비고
}

/** 팀별 목표 GP (목표, 매출총이익, 초과 달성액, 달성 여부) */
export interface TeamTargetGp {
  team: string;
  target: number;
  grossProfit: number;
  excessAchievement: number;
  achieved: boolean;
}

/** 팀별 매출 보고 한 행 (매출액, 매입액, 매출총이익, 팀별 매출총이익률) */
export interface TeamSalesReportRow {
  team: string;
  revenue: number;
  cost: number;
  grossProfit: number;
  marginRatePct: number;
}

export interface SalesDetail {
  no: number;
  date: string;
  client: string;
  team: string;
  paymentMethod: string;
  content: string;
  amount: number;
  supplyAmount: number;
}

/** 엑셀 26년 3월 시트 실제 데이터 기반 샘플 */
export const SAMPLE_MONTH_SUMMARY: MonthSummary = {
  label: "26년 3월",
  currentRevenue: 2_886_054.55,
  currentCost: 66_000,
  grossProfit: 2_820_054.55,
  workDays: 21,
  passedWorkDays: 1,
  targetGrossProfit: 50_000_000,
  remainingTarget: 47_179_945.45,
  achievementRate: 0.0564,   // 5.64%
  workDayAchievementRate: 0.00878, // 0.88%
};

export const SAMPLE_SURVIVAL_ACCOUNT: SurvivalAccount = {
  carryOverBalance: 79_527_514,
  currentBalance: 82_629_574,
  operatingDeduction: 50_000_000,
  vatOnGross: 282_005.45,
  expectedBalance: 32_347_568.55,
  monthlyPerformance: -47_179_945.45,
};

export const SAMPLE_TEAM_SUMMARY: TeamSummary[] = [
  { team: "티제이웹", revenue: 30_000, cost: 0, grossProfit: 30_000 },
  { team: "더널리", revenue: 2_856_054.55, cost: 66_000, grossProfit: 2_790_054.55 },
];

export const SAMPLE_RECEIVABLES: Receivables[] = [
  { category: "미수금", item: "나이스페이", amount: 0, paidAmount: 0, difference: 0 },
  { category: "미지급금", item: "매체비", amount: 1_641_708.18, paidAmount: 0, difference: 1_641_708.18 },
  { category: "미지급금", item: "CPC", amount: 0, paidAmount: 0, difference: 0 },
];

export const SAMPLE_CURRENT_STATUS: CurrentStatus = {
  salesSupply: 115_643_917,
  salesVat: 11_564_392,
  salesTotal: 127_208_309,
  purchaseSupply: 31_868_012,
  purchaseVat: 3_186_801,
  purchaseTotal: 35_054_813,
  grossSupply: 83_775_905,
  grossVat: 8_377_591,
  grossTotal: 92_153_496,
  survivalBalance: 162_302_634,
};

export const SAMPLE_EXPECTED_RECEIVABLES: ExpectedLineItem[] = [
  { id: "er1", category: "매출 예정", item: "미수금", supplyAmount: 2_499_717, vat: 249_972, memo: "" },
];

export const SAMPLE_EXPECTED_PAYABLES: ExpectedLineItem[] = [
  { id: "ep1", category: "매입 예정", item: "", supplyAmount: 22_138_549, vat: 2_213_855, memo: "" },
  { id: "ep2", category: "매입 예정", item: "위시캣", supplyAmount: 1_159_884, vat: 115_988, memo: "위시캣" },
  { id: "ep3", category: "매입 예정", item: "", supplyAmount: 3_514_834, vat: 351_483, memo: "" },
  { id: "ep4", category: "매입 예정", item: "CPC", supplyAmount: 61_730, vat: 6_173, memo: "CPC" },
];

export const SAMPLE_TEAM_SALES_REPORT: TeamSalesReportRow[] = [
  { team: "티제이엠", revenue: 11_902_917, cost: 818_182, grossProfit: 11_084_735, marginRatePct: 93.13 },
  { team: "더널리", revenue: 106_307_376, cost: 57_924_826, grossProfit: 48_382_550, marginRatePct: 45.51 },
];

export const OVERALL_REFUND_RATE_PCT = 0.34;

export const SAMPLE_TEAM_TARGET_GP: TeamTargetGp[] = [
  { team: "티제이엠", target: 8_000_000, grossProfit: 11_084_735, excessAchievement: 3_084_735, achieved: true },
  { team: "더널리", target: 42_000_000, grossProfit: 48_382_550, excessAchievement: 6_382_550, achieved: true },
];

/** 분류별 상세 매출/매입 (Data Grid용) */
export interface ClassificationRow {
  classification: string;     // 분류: 홈페이지, 유지보수, 호스팅 등
  contractCount: number;      // 계약 건수
  revenue: number;            // 매출액
  avgRevenuePerContract: number; // 건당 평균매출
  costSettlement: number;     // 매입[정산]
  costRefund: number;         // 매입[환불]
  refundRate: number;         // 환불율 (0~1)
  grossProfit: number;        // 매출총이익
  grossProfitRate: number;    // 매출총이익률 (%)
}

/** 금일 매출 현황 (현재 월 매출, 현재 월 매입, 예상 미지급금) */
export interface TodaySales {
  currentMonthRevenue: number;  // 현재 월 매출
  currentMonthCost: number;     // 현재 월 매입
  expectedPayables: number;     // 예상 미지급금
  grossProfit?: number;
}

/** 매출/매입 상세 내역 (개별 거래 건) */
export type TransactionStatus = "정산 완료" | "미수금" | "환불 처리";

export interface TransactionDetail {
  id: string;
  date: string;           // 일자
  classification: string; // 분류
  clientMemo: string;     // 고객사/적요
  revenueAmount: number;  // 매출액 (+) 0이면 비입금
  costAmount: number;     // 매입/환불액 (-) 0이면 비출금
  grossProfit: number;    // 매출총이익
  status: TransactionStatus;
}

export const SAMPLE_CLASSIFICATION_ROWS: ClassificationRow[] = [
  {
    classification: "홈페이지 제작",
    contractCount: 3,
    revenue: 1_500_000,
    avgRevenuePerContract: 500_000,
    costSettlement: 280_000,
    costRefund: 0,
    refundRate: 0,
    grossProfit: 1_220_000,
    grossProfitRate: 81.3,
  },
  {
    classification: "유지보수",
    contractCount: 12,
    revenue: 890_000,
    avgRevenuePerContract: 74_167,
    costSettlement: 45_000,
    costRefund: 12_000,
    refundRate: 0.026,
    grossProfit: 833_000,
    grossProfitRate: 93.6,
  },
  {
    classification: "호스팅",
    contractCount: 8,
    revenue: 320_000,
    avgRevenuePerContract: 40_000,
    costSettlement: 9_000,
    costRefund: 0,
    refundRate: 0,
    grossProfit: 311_000,
    grossProfitRate: 97.2,
  },
  {
    classification: "더널리 충전",
    contractCount: 45,
    revenue: 2_856_055,
    avgRevenuePerContract: 63_468,
    costSettlement: 66_000,
    costRefund: 0,
    refundRate: 0,
    grossProfit: 2_790_055,
    grossProfitRate: 97.7,
  },
  {
    classification: "광고 매체",
    contractCount: 2,
    revenue: 50_000,
    avgRevenuePerContract: 25_000,
    costSettlement: 520_000,
    costRefund: 0,
    refundRate: 0,
    grossProfit: -470_000,
    grossProfitRate: -940,
  },
];

export const SAMPLE_TODAY_SALES: TodaySales = {
  currentMonthRevenue: 2_886_055,
  currentMonthCost: 66_000,
  expectedPayables: 1_641_708,
  grossProfit: 2_820_055,
};

export const SAMPLE_TRANSACTION_DETAILS: TransactionDetail[] = [
  { id: "t1", date: "2026-03-10", classification: "더널리 충전", clientMemo: "이지임스", revenueAmount: 20_000, costAmount: 0, grossProfit: 20_000, status: "정산 완료" },
  { id: "t2", date: "2026-03-10", classification: "더널리 충전", clientMemo: "노비타코리아", revenueAmount: 5_000, costAmount: 0, grossProfit: 5_000, status: "정산 완료" },
  { id: "t3", date: "2026-03-10", classification: "더널리 충전", clientMemo: "지니스키친", revenueAmount: 100_000, costAmount: 0, grossProfit: 100_000, status: "정산 완료" },
  { id: "t4", date: "2026-03-11", classification: "더널리 충전", clientMemo: "이지임스", revenueAmount: 20_000, costAmount: 0, grossProfit: 20_000, status: "정산 완료" },
  { id: "t5", date: "2026-03-11", classification: "더널리 충전", clientMemo: "(주)굿키노", revenueAmount: 100_000, costAmount: 0, grossProfit: 100_000, status: "정산 완료" },
  { id: "t6", date: "2026-03-11", classification: "홈페이지", clientMemo: "A사", revenueAmount: 0, costAmount: 0, grossProfit: 0, status: "미수금" },
  { id: "t7", date: "2026-03-11", classification: "더널리", clientMemo: "뷰 커뮤니케이션 - 슬롯구입정산", revenueAmount: 0, costAmount: 72_600, grossProfit: -72_600, status: "정산 완료" },
  { id: "t8", date: "2026-03-12", classification: "유지보수", clientMemo: "B사", revenueAmount: 150_000, costAmount: 0, grossProfit: 150_000, status: "미수금" },
  { id: "t9", date: "2026-03-09", classification: "호스팅", clientMemo: "C사 환불", revenueAmount: 0, costAmount: 12_000, grossProfit: -12_000, status: "환불 처리" },
  { id: "t10", date: "2026-03-11", classification: "더널리 충전", clientMemo: "(주)니즈원", revenueAmount: 30_000, costAmount: 0, grossProfit: 30_000, status: "정산 완료" },
  { id: "t11", date: "2026-03-11", classification: "더널리 충전", clientMemo: "360마켓", revenueAmount: 300_000, costAmount: 0, grossProfit: 300_000, status: "정산 완료" },
];

export const SAMPLE_SALES_DETAILS: SalesDetail[] = [
  { no: 1, date: "2026-03-10", client: "이지임스", team: "더널리 충전", paymentMethod: "무통장", content: "", amount: 20_000, supplyAmount: 18_181.82 },
  { no: 2, date: "2026-03-10", client: "노비타코리아", team: "더널리 충전", paymentMethod: "무통장", content: "", amount: 5_000, supplyAmount: 4_545.45 },
  { no: 3, date: "2026-03-10", client: "지니스키친", team: "더널리 충전", paymentMethod: "무통장", content: "", amount: 100_000, supplyAmount: 90_909.09 },
  { no: 4, date: "2026-03-11", client: "이지임스", team: "더널리 충전", paymentMethod: "무통장", content: "", amount: 20_000, supplyAmount: 18_181.82 },
  { no: 5, date: "2026-03-11", client: "(주)굿키노", team: "더널리 충전", paymentMethod: "무통장", content: "", amount: 100_000, supplyAmount: 90_909.09 },
];
