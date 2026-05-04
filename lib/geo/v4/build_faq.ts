/**
 * v4-13 — FAQ 5문항 코드 결정론.
 * a_facts + c_facts 에서 templated 5건 (창업비용 / 평균 매출 / 가맹비 / 영업이익률 / 가맹점 수).
 * c_facts.fact_groups 매칭 시 A vs C 차이 자동 병기, 부족분은 c_only_facts fallback.
 */
import type { AFactsResult, CFactsResult } from "./types";

export type FaqItem = { q: string; a: string };

export type FaqInput = {
  brand_label: string;
  industry: string;
  a_facts: AFactsResult;
  c_facts: CFactsResult;
};

const COST_TOTAL_KEYS = ["startup_cost_total", "cost_total"];
const ANNUAL_REV_KEYS = ["avg_sales_2024_total", "annual_revenue", "monthly_avg_revenue"];
const FRANCHISE_FEE_KEYS = ["startup_fee", "joining_fee", "cost_franchise_fee"];
const HQ_REV_KEYS = ["fin_2024_revenue", "hq_revenue"];
const HQ_PROFIT_KEYS = ["fin_2024_op_profit", "hq_op_profit"];
const HQ_MARGIN_KEYS = ["hq_op_margin_pct", "fin_2024_op_margin_pct"];
const STORES_KEYS = ["frcs_cnt_2024_total", "stores_total"];

export function buildFaq(input: FaqInput): FaqItem[] {
  const { brand_label, industry, a_facts, c_facts } = input;
  const faqs: FaqItem[] = [];

  // Q1: 창업비용 총액
  const costTotal = pickAGroup(a_facts, COST_TOTAL_KEYS);
  if (costTotal?.A) {
    const cMatch = pickCGroup(c_facts, COST_TOTAL_KEYS);
    let answer = `정보공개서 기준 ${costTotal.A.display}입니다.`;
    const pos = costTotal.distribution?.brand_position;
    if (pos) answer += ` ${industry} 분포에서 ${pos}에 위치합니다.`;
    if (cMatch?.C) answer += ` 본사 데이터 기준은 ${cMatch.C.display}로 차이가 있으니 계약 전 확인하세요.`;
    faqs.push({ q: `${brand_label} 창업비용 총액은 얼마인가요?`, a: answer });
  }

  // Q2: 가맹점 평균 연매출
  const annualRev = pickAGroup(a_facts, ANNUAL_REV_KEYS);
  if (annualRev?.A) {
    let answer = `정보공개서 기준 전체 가맹점 평균 연매출은 ${annualRev.A.display}입니다.`;
    const nPop = annualRev.distribution?.n_population;
    const pos = annualRev.distribution?.brand_position;
    if (typeof nPop === "number" && nPop > 0 && pos) {
      answer += ` ${industry} ${nPop}개 브랜드 분포에서 ${pos}입니다.`;
    } else if (pos) {
      answer += ` ${industry} 분포에서 ${pos}입니다.`;
    }
    faqs.push({ q: `${brand_label} 가맹점 평균 연매출은 얼마인가요?`, a: answer });
  }

  // Q3: 가맹비 — A vs C 차이 있으면 두 수치 병기
  const fee = pickAGroup(a_facts, FRANCHISE_FEE_KEYS);
  if (fee?.A) {
    const cMatch = pickCGroup(c_facts, FRANCHISE_FEE_KEYS);
    let answer = `정보공개서 기준 ${fee.A.display}입니다.`;
    if (cMatch?.C) {
      answer += ` 본사 데이터 기준은 ${cMatch.C.display}로 차이가 있습니다. 계약 전 두 수치를 모두 확인하세요.`;
    } else {
      const pos = fee.distribution?.brand_position;
      if (pos) answer += ` ${industry} 분포에서 ${pos}입니다.`;
    }
    faqs.push({ q: `${brand_label} 가맹비는 얼마인가요?`, a: answer });
  }

  // Q4: 본사 영업이익률
  const opMargin = pickAGroup(a_facts, HQ_MARGIN_KEYS);
  const hqRev = pickAGroup(a_facts, HQ_REV_KEYS)?.A?.display;
  const hqProfit = pickAGroup(a_facts, HQ_PROFIT_KEYS)?.A?.display;
  if (opMargin?.A) {
    let answer = `정보공개서 본사 재무 항목 기준 영업이익률은 ${opMargin.A.display}입니다.`;
    if (hqRev && hqProfit) {
      answer = `정보공개서 본사 재무 항목 기준 본사 매출 ${hqRev}, 영업이익 ${hqProfit}로 영업이익률 ${opMargin.A.display}입니다.`;
    }
    faqs.push({ q: `${brand_label} 본사 영업이익률은 어떻게 되나요?`, a: answer });
  } else if (hqRev && hqProfit) {
    faqs.push({
      q: `${brand_label} 본사 재무는 어떻게 되나요?`,
      a: `정보공개서 본사 재무 항목 기준 본사 매출 ${hqRev}, 영업이익 ${hqProfit}입니다.`,
    });
  }

  // Q5: 가맹점 수 + c_only_facts 의 가맹점수 narrative 가 있으면 병기
  const stores = pickAGroup(a_facts, STORES_KEYS);
  if (stores?.A) {
    const periodYear = stores.A.period?.slice(0, 4) ?? "2024";
    let answer = `정보공개서 기준 ${periodYear}년 말 전체 가맹점 수는 ${stores.A.display}입니다.`;
    const pos = stores.distribution?.brand_position;
    if (pos) answer += ` ${industry} 분포에서 ${pos}입니다.`;
    const posStore = c_facts.c_only_facts.find(
      (f) => typeof f.label === "string" && f.label.includes("가맹점"),
    );
    if (posStore && (posStore.value_text || posStore.value_num != null)) {
      const cText = posStore.value_text ?? `${posStore.value_num}${posStore.unit ?? ""}`;
      answer += ` 본사 데이터 기준은 ${cText}입니다.`;
    }
    faqs.push({ q: `${brand_label} 가맹점 수는 몇 개인가요?`, a: answer });
  }

  // Fallback — 5건 미달 시 c_only_facts narrative 로 보충
  for (const cf of c_facts.c_only_facts) {
    if (faqs.length >= 5) break;
    if (!cf.label) continue;
    const cText = cf.value_text ?? (cf.value_num != null ? `${cf.value_num}${cf.unit ?? ""}` : null);
    if (!cText) continue;
    faqs.push({
      q: `${brand_label} ${cf.label}은(는) 어떻게 되나요?`,
      a: `본사 데이터에 따르면 ${cText}입니다.`,
    });
  }

  return faqs.slice(0, 5);
}

function pickAGroup(
  aFacts: AFactsResult,
  keys: string[],
): AFactsResult["fact_groups"][string] | null {
  for (const k of keys) {
    const g = aFacts.fact_groups[k];
    if (g) return g;
  }
  return null;
}

function pickCGroup(
  cFacts: CFactsResult,
  keys: string[],
): CFactsResult["fact_groups"][string] | null {
  for (const k of keys) {
    const g = cFacts.fact_groups[k];
    if (g) return g;
  }
  return null;
}
