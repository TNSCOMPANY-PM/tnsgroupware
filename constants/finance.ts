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

/** finance-current.json 없을 때 폴백 — parse-finance-xlsx.js 로 생성한 26년 3월 스냅샷과 동일 */
export const SAMPLE_MONTH_SUMMARY: MonthSummary = {
  label: "26년 3월",
  currentRevenue: 29_937_438,
  currentCost: 4_589_121,
  grossProfit: 25_348_317,
  workDays: 21,
  passedWorkDays: 7,
  targetGrossProfit: 50_000_000,
  remainingTarget: 24_651_683,
  achievementRate: 0.5069663454545454,
  workDayAchievementRate: 0.17363301212121213,
};

export const SAMPLE_SURVIVAL_ACCOUNT: SurvivalAccount = {
  carryOverBalance: 79_549_764,
  currentBalance: 107_432_913,
  operatingDeduction: 50_000_000,
  vatOnGross: 2_534_832,
  expectedBalance: 54_898_081,
  monthlyPerformance: -24_651_683,
};

export const SAMPLE_TEAM_SUMMARY: TeamSummary[] = [
  { team: "티제이웹", revenue: 770_000, cost: 0, grossProfit: 770_000 },
  { team: "더널리", revenue: 28_535_347, cost: 4_589_121, grossProfit: 23_946_226 },
];

export const SAMPLE_RECEIVABLES: Receivables[] = [
  { category: "미수금", item: "나이스페이", amount: 984_099, paidAmount: 0, difference: 984_099 },
  { category: "미지급금", item: "매체비", amount: 6_222_308, paidAmount: 0, difference: 6_222_308 },
];

export const SAMPLE_CURRENT_STATUS: CurrentStatus = {
  salesSupply: 29_937_438,
  salesVat: 2_993_744,
  salesTotal: 32_931_182,
  purchaseSupply: 4_589_121,
  purchaseVat: 458_912,
  purchaseTotal: 5_048_033,
  grossSupply: 25_348_317,
  grossVat: 2_534_832,
  grossTotal: 27_883_149,
  survivalBalance: 107_432_913,
};

export const SAMPLE_EXPECTED_RECEIVABLES: ExpectedLineItem[] = [
  { id: "er1", category: "미수금", item: "나이스페이", supplyAmount: 984_099, vat: 98_410, memo: "" },
];

export const SAMPLE_EXPECTED_PAYABLES: ExpectedLineItem[] = [
  { id: "ep1", category: "미지급금", item: "매체비", supplyAmount: 6_222_308, vat: 622_231, memo: "" },
];

export const SAMPLE_TEAM_SALES_REPORT: TeamSalesReportRow[] = [
  { team: "티제이웹", revenue: 770_000, cost: 0, grossProfit: 770_000, marginRatePct: 100 },
  { team: "더널리", revenue: 28_535_347, cost: 4_589_121, grossProfit: 23_946_226, marginRatePct: 83.92 },
];

export const OVERALL_REFUND_RATE_PCT = 0;

export const SAMPLE_TEAM_TARGET_GP: TeamTargetGp[] = [
  { team: "티제이웹", target: 1_313_753, grossProfit: 770_000, excessAchievement: -543_753, achieved: false },
  { team: "더널리", target: 48_686_247, grossProfit: 23_946_226, excessAchievement: -24_740_021, achieved: false },
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
