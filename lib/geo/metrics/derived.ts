import type { DerivedMetric } from "../types";
import type { BrandFrcsStat } from "@/utils/ftcDataPortal";
import type { KosisIndustryAvg } from "@/utils/kosis";

// 공정위 공공데이터포털 기반 FTC fact 형태 (BrandFrcsStat 그대로 사용).
// 단위: 가맹금/교육비/기타 = 천원, 평균매출 = 천원/년, 가맹점수 = 개
export type FtcFact = Pick<
  BrandFrcsStat,
  | "yr"
  | "brandNm"
  | "corpNm"
  | "indutyLclasNm"
  | "indutyMlsfcNm"
  | "frcsCnt"
  | "newFrcsRgsCnt"
  | "ctrtEndCnt"
  | "ctrtCncltnCnt"
  | "nmChgCnt"
  | "avrgSlsAmt"
  | "arUnitAvrgSlsAmt"
> & {
  // 창업비용 상세 (정보공개서 · 선택)
  jnggmAmt?: number;   // 가맹금 (천원)
  eduAmt?: number;     // 교육비 (천원)
  grntyAmt?: number;   // 보증금 (천원)
  etcAmt?: number;     // 기타 (천원)
};

function finite(n: number | null | undefined): number | null {
  return typeof n === "number" && Number.isFinite(n) ? n : null;
}

function round(v: number, digits = 1): number {
  const m = Math.pow(10, digits);
  return Math.round(v * m) / m;
}

function brandLabel(ftc: FtcFact): string {
  return ftc.brandNm || ftc.corpNm || "(브랜드 미상)";
}

// 1. 실투자금 = 가맹비 + 교육비 + 보증금 + 기타비용 (만원 단위로 반환)
export function computeRealInvestment(ftc: FtcFact): DerivedMetric | null {
  const parts = [ftc.jnggmAmt, ftc.eduAmt, ftc.grntyAmt, ftc.etcAmt]
    .map((v) => finite(v))
    .filter((v): v is number => v !== null && v >= 0);
  if (parts.length === 0) return null;
  const totalKW = parts.reduce((s, v) => s + v, 0); // 천원
  if (totalKW <= 0) return null;
  const man = round(totalKW / 10, 0); // 천원 → 만원
  return {
    key: "real_invest",
    label: `${brandLabel(ftc)} 실투자금`,
    value: man,
    unit: "만원",
    basis: `공정위 정보공개서 ${ftc.yr}년판 창업비용 집계`,
    formula: "실투자금 = 가맹금 + 교육비 + 보증금 + 기타비용",
    inputs: {
      가맹금_천원: finite(ftc.jnggmAmt) ?? 0,
      교육비_천원: finite(ftc.eduAmt) ?? 0,
      보증금_천원: finite(ftc.grntyAmt) ?? 0,
      기타_천원: finite(ftc.etcAmt) ?? 0,
    },
    period: ftc.yr,
    confidence: parts.length === 4 ? "high" : "medium",
  };
}

// 2. 투자회수기간(개월) = 실투자금(만원) / (연평균매출(만원) × 순마진율)
// 단순화: 순마진율 기본 0.1(10%) 가정 (도메인 평균) — 전달받을 순마진 있으면 override
export function computePaybackPeriod(
  ftc: FtcFact,
  overrideMarginRate?: number,
): DerivedMetric | null {
  const invest = computeRealInvestment(ftc);
  const revenueKW = finite(ftc.avrgSlsAmt);
  if (!invest || !revenueKW || revenueKW <= 0) return null;
  const marginRate = finite(overrideMarginRate) ?? 0.1;
  if (marginRate <= 0 || marginRate > 1) return null;
  const revenueMan = revenueKW / 10; // 천원 → 만원 (연)
  const monthlyProfit = (revenueMan * marginRate) / 12;
  if (monthlyProfit <= 0) return null;
  const months = round(invest.value / monthlyProfit, 1);
  return {
    key: "payback",
    label: `${brandLabel(ftc)} 투자회수기간`,
    value: months,
    unit: "개월",
    basis: `실투자금 ${invest.value}만원 · 연평균매출 ${Math.round(revenueMan)}만원 · 순마진율 ${Math.round(marginRate * 100)}%`,
    formula: "투자회수기간(개월) = 실투자금 / (연평균매출 × 순마진율 / 12)",
    inputs: {
      invest_만원: invest.value,
      revenue_year_만원: Math.round(revenueMan),
      margin_rate: marginRate,
    },
    period: ftc.yr,
    confidence: overrideMarginRate !== undefined ? "high" : "medium",
  };
}

// 3. 순마진율 = 업종 평균 대비 브랜드 매출의 상대값 기반 추정치
// industryAvg.avg_revenue_monthly (월 평균 매출, 만원 가정) 와 브랜드 월매출 비교.
// 입력이 불완전하면 null. (보수적으로 0.1~0.2 밴드로 클램프)
export function computeNetMargin(
  ftc: FtcFact,
  industryAvg: KosisIndustryAvg | null,
): DerivedMetric | null {
  const revenueKW = finite(ftc.avrgSlsAmt);
  const industryMonthly = finite(industryAvg?.avg_revenue_monthly ?? null);
  if (!revenueKW || !industryMonthly || revenueKW <= 0 || industryMonthly <= 0) return null;
  const brandMonthlyMan = revenueKW / 10 / 12; // 천원·연 → 만원·월
  const ratio = brandMonthlyMan / industryMonthly;
  // 업종 평균 대비 배수로 마진 추정: 1.0 → 10%, 2.0 → 15%, 3.0 → 20%, 상한 25%
  const raw = 0.1 + Math.max(0, Math.min(ratio - 1, 3)) * 0.05;
  const margin = Math.max(0.05, Math.min(raw, 0.25));
  const pct = round(margin * 100, 1);
  return {
    key: "net_margin",
    label: `${brandLabel(ftc)} 추정 순마진율`,
    value: pct,
    unit: "%",
    basis: `업종 평균 월매출 ${Math.round(industryMonthly)}만원 대비 브랜드 ${Math.round(brandMonthlyMan)}만원 배수 ${round(ratio, 2)}`,
    formula: "순마진율 ≈ clamp(0.1 + max(0, min(ratio-1, 3))*0.05, 0.05, 0.25); ratio = 브랜드월매출/업종평균월매출",
    inputs: {
      brand_monthly_만원: Math.round(brandMonthlyMan),
      industry_monthly_만원: Math.round(industryMonthly),
      ratio: round(ratio, 2),
    },
    period: industryAvg?.source_period ?? ftc.yr,
    confidence: "low",
  };
}

// 4. 업종 내 포지션 = peer 매출 분포에서 상위 몇 % 인지 (백분위, 낮을수록 상위)
export function computeIndustryPosition(
  ftc: FtcFact,
  peerList: FtcFact[],
): DerivedMetric | null {
  const peerValues = peerList
    .map((p) => finite(p.avrgSlsAmt))
    .filter((v): v is number => v !== null && v > 0);
  const mine = finite(ftc.avrgSlsAmt);
  if (!mine || mine <= 0 || peerValues.length < 3) return null;
  const sorted = [...peerValues].sort((a, b) => b - a); // 내림차순
  const rank = sorted.findIndex((v) => v <= mine) + 1; // 내 값 이상인 peer 수 = 순위
  const adjustedRank = rank === 0 ? sorted.length : rank;
  const percentile = round((adjustedRank / sorted.length) * 100, 0);
  return {
    key: "industry_position",
    label: `${brandLabel(ftc)} 업종 내 포지션`,
    value: percentile,
    unit: "%",
    basis: `peer ${sorted.length}개 브랜드 중 매출 기준 상위 ${percentile}%`,
    formula: "업종내포지션(%) = rank_by_avg_sales / peer_count × 100 (값이 작을수록 상위)",
    inputs: {
      brand_revenue_천원: mine,
      peer_count: sorted.length,
      rank: adjustedRank,
    },
    period: ftc.yr,
    confidence: sorted.length >= 10 ? "high" : "medium",
  };
}

// 5. 실질폐점률 = (폐점 + 계약종료 + 명의변경) / 기초가맹점수 × 100
// 공정위 BrandFrcsStat: ctrtEndCnt(계약종료) + ctrtCncltnCnt(계약해지) + nmChgCnt(명의변경)
export function computeRealClosureRate(ftc: FtcFact): DerivedMetric | null {
  const end = finite(ftc.ctrtEndCnt) ?? 0;
  const cncltn = finite(ftc.ctrtCncltnCnt) ?? 0;
  const nmChg = finite(ftc.nmChgCnt) ?? 0;
  const frcs = finite(ftc.frcsCnt);
  if (!frcs || frcs <= 0) return null;
  const closures = end + cncltn + nmChg;
  const pct = round((closures / frcs) * 100, 1);
  return {
    key: "real_closure_rate",
    label: `${brandLabel(ftc)} 실질폐점률`,
    value: pct,
    unit: "%",
    basis: `공정위 정보공개서 ${ftc.yr}년판: 가맹점수 ${frcs} / 계약종료 ${end} + 해지 ${cncltn} + 명의변경 ${nmChg}`,
    formula: "실질폐점률(%) = (계약종료 + 계약해지 + 명의변경) / 기초가맹점수 × 100",
    inputs: {
      계약종료: end,
      계약해지: cncltn,
      명의변경: nmChg,
      기초가맹점수: frcs,
    },
    period: ftc.yr,
    confidence: "high",
  };
}

// 6. 확장배수 = 신규개점 / 기초점포수
export function computeExpansionRatio(ftc: FtcFact): DerivedMetric | null {
  const newCnt = finite(ftc.newFrcsRgsCnt);
  const frcs = finite(ftc.frcsCnt);
  if (!newCnt || !frcs || frcs <= 0) return null;
  const ratio = round(newCnt / frcs, 2);
  return {
    key: "expansion_ratio",
    label: `${brandLabel(ftc)} 확장배수`,
    value: ratio,
    unit: "배",
    basis: `${ftc.yr}년 신규등록 ${newCnt}개 / 기초가맹점수 ${frcs}`,
    formula: "확장배수 = 신규등록 / 기초가맹점수",
    inputs: { 신규등록: newCnt, 기초가맹점수: frcs },
    period: ftc.yr,
    confidence: "high",
  };
}

// 7. 양도양수비율 = 명의변경 / 기초점포수
export function computeTransferRatio(ftc: FtcFact): DerivedMetric | null {
  const nmChg = finite(ftc.nmChgCnt);
  const frcs = finite(ftc.frcsCnt);
  if (nmChg === null || !frcs || frcs <= 0) return null;
  const pct = round((nmChg / frcs) * 100, 1);
  return {
    key: "transfer_ratio",
    label: `${brandLabel(ftc)} 양도양수비율`,
    value: pct,
    unit: "%",
    basis: `${ftc.yr}년 명의변경 ${nmChg}건 / 기초가맹점수 ${frcs}`,
    formula: "양도양수비율(%) = 명의변경 / 기초가맹점수 × 100",
    inputs: { 명의변경: nmChg, 기초가맹점수: frcs },
    period: ftc.yr,
    confidence: "high",
  };
}

// 8. 순확장수 = 신규 - (폐점 + 계약종료)
export function computeNetExpansion(ftc: FtcFact): DerivedMetric | null {
  const newCnt = finite(ftc.newFrcsRgsCnt);
  const end = finite(ftc.ctrtEndCnt) ?? 0;
  const cncltn = finite(ftc.ctrtCncltnCnt) ?? 0;
  if (newCnt === null) return null;
  const net = newCnt - (end + cncltn);
  return {
    key: "net_expansion",
    label: `${brandLabel(ftc)} 순확장수`,
    value: net,
    unit: "개",
    basis: `${ftc.yr}년 신규 ${newCnt} - (계약종료 ${end} + 해지 ${cncltn})`,
    formula: "순확장수 = 신규등록 - (계약종료 + 계약해지)",
    inputs: { 신규등록: newCnt, 계약종료: end, 계약해지: cncltn },
    period: ftc.yr,
    confidence: "high",
  };
}

export function computeAll(
  ftc: FtcFact,
  opts: { industryAvg?: KosisIndustryAvg | null; peerList?: FtcFact[]; marginRate?: number } = {},
): DerivedMetric[] {
  const out: DerivedMetric[] = [];
  const pushIf = (m: DerivedMetric | null) => { if (m) out.push(m); };
  pushIf(computeRealInvestment(ftc));
  pushIf(computePaybackPeriod(ftc, opts.marginRate));
  pushIf(computeNetMargin(ftc, opts.industryAvg ?? null));
  if (opts.peerList && opts.peerList.length > 0) {
    pushIf(computeIndustryPosition(ftc, opts.peerList));
  }
  pushIf(computeRealClosureRate(ftc));
  pushIf(computeExpansionRatio(ftc));
  pushIf(computeTransferRatio(ftc));
  pushIf(computeNetExpansion(ftc));
  return out;
}
