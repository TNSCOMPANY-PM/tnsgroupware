/**
 * PR045 — D3 본문 진입 / 결론 박스 생성에 쓰일 facts 휴리스틱.
 */

import { formatManwon } from "@/lib/format/manwon";
import { withJosa } from "@/lib/format/josa";
import type { Fact, DerivedMetric } from "@/lib/geo/types";
import type { StatItem, FormulaItem } from "./blocks";

type FactLite = Pick<Fact, "fact_key" | "value" | "unit" | "source_tier" | "year_month" | "period_month">;

function num(v: string | number | null | undefined): number | null {
  if (v == null) return null;
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  const n = Number(String(v).replace(/[,\s만원%개건배호점]/g, ""));
  return Number.isFinite(n) ? n : null;
}

function pickByKey(facts: FactLite[], key: string, tier?: "A" | "B" | "C"): FactLite | null {
  return facts.find((f) => f.fact_key === key && (!tier || f.source_tier === tier)) ?? null;
}

function periodLabel(f: FactLite | null): string {
  const p = f?.period_month ?? f?.year_month ?? null;
  if (!p) return "";
  const m = p.match(/^(\d{4})-(\d{2})$/);
  if (!m) return p;
  return m[2] === "12" ? `${m[1]}년 말` : `${m[1]}년 ${parseInt(m[2], 10)}월`;
}

export type MetaPattern = "A" | "B";
export type MetaPatternSelection = {
  pattern: MetaPattern;
  /** 패턴 B 채택 시 시점 차이 개월. */
  period_gap_months: number | null;
};

export function pickMetaPattern(opts: {
  facts: FactLite[];
  deriveds: DerivedMetric[];
}): MetaPatternSelection {
  const { facts, deriveds } = opts;
  const frcsGrowth = deriveds.find((d) => d.key === "frcs_growth")?.value ?? null;
  const dilution = deriveds.find((d) => d.key === "avg_sales_dilution")?.value ?? null;

  const aStores = pickByKey(facts, "frcs_cnt", "A");
  const cStores = pickByKey(facts, "frcs_cnt", "C");
  const aPeriod = aStores?.period_month ?? aStores?.year_month ?? null;
  const cPeriod = cStores?.period_month ?? cStores?.year_month ?? null;
  const periodGap = (() => {
    if (!aPeriod || !cPeriod) return null;
    const ma = aPeriod.match(/^(\d{4})-(\d{2})/);
    const mc = cPeriod.match(/^(\d{4})-(\d{2})/);
    if (!ma || !mc) return null;
    const months =
      (parseInt(mc[1], 10) - parseInt(ma[1], 10)) * 12 +
      (parseInt(mc[2], 10) - parseInt(ma[2], 10));
    return months;
  })();

  const useB =
    frcsGrowth !== null &&
    Math.abs(frcsGrowth) >= 5 &&
    dilution !== null &&
    periodGap !== null &&
    periodGap >= 6;

  return { pattern: useB ? "B" : "A", period_gap_months: periodGap };
}

export function buildOneLineAnswer(opts: {
  brand: string;
  facts: FactLite[];
  deriveds: DerivedMetric[];
}): { answer: string; detail: string | null } {
  const { brand, facts, deriveds } = opts;

  const aStores = pickByKey(facts, "frcs_cnt", "A");
  const cStores = pickByKey(facts, "frcs_cnt", "C");
  const frcsGrowth = deriveds.find((d) => d.key === "frcs_growth")?.value ?? null;
  if (aStores && cStores && frcsGrowth != null) {
    const aN = num(aStores.value);
    const cN = num(cStores.value);
    const sign = frcsGrowth > 0 ? "+" : "";
    const answer = `${withJosa(`${brand} 가맹점`, "은/는")} 공정위 ${periodLabel(aStores)} 기준 ${aN}개에서 본사 발표 기준 ${cN}호점으로 ${sign}${frcsGrowth}개 확장됐습니다.`;
    const cost = num(pickByKey(facts, "docx_cost_total", "A")?.value);
    const rev = num(pickByKey(facts, "docx_avg_monthly_revenue", "A")?.value);
    const detail =
      cost != null && rev != null
        ? `창업비용 ${formatManwon(cost)}, 가맹점당 월평균매출 ${formatManwon(rev)} 수준입니다.`
        : null;
    return { answer, detail };
  }

  const cost = num(pickByKey(facts, "docx_cost_total", "A")?.value);
  const rev = num(pickByKey(facts, "docx_avg_monthly_revenue", "A")?.value);
  if (cost != null && rev != null) {
    const answer = `${withJosa(`${brand} 창업비용`, "은/는")} ${formatManwon(cost)}, 가맹점당 월평균매출은 ${formatManwon(rev)}으로 집계됩니다.`;
    const aN = num(aStores?.value);
    const detail = aN != null ? `공정위 정보공개서 ${periodLabel(aStores)} 기준 가맹점은 ${aN}개입니다.` : null;
    return { answer, detail };
  }

  const aN = num(aStores?.value) ?? num(cStores?.value);
  const fallback = aN != null
    ? `${brand}의 공시 가맹점은 ${aN}개로 집계됩니다.`
    : `${withJosa(`${brand} 공개 자료`, "을/를")} 정리합니다.`;
  return { answer: fallback, detail: null };
}

export function pickHeadlineStats(opts: {
  facts: FactLite[];
  deriveds: DerivedMetric[];
}): StatItem[] {
  const { facts } = opts;
  const items: StatItem[] = [];

  const aStores = pickByKey(facts, "frcs_cnt", "A");
  if (aStores) {
    const n = num(aStores.value);
    if (n != null) items.push({ num: `${n}개`, lbl: `공정위 ${periodLabel(aStores)} 가맹점` });
  }

  const rev = pickByKey(facts, "docx_avg_monthly_revenue", "A");
  if (rev) {
    const n = num(rev.value);
    if (n != null) items.push({ num: formatManwon(n), lbl: "공정위 월평균매출" });
  } else {
    const cRev = pickByKey(facts, "monthly_avg_sales", "C");
    const n = num(cRev?.value);
    if (n != null) items.push({ num: formatManwon(n), lbl: "본사 발표 월평균매출" });
  }

  const cost = pickByKey(facts, "docx_cost_total", "A");
  if (cost && items.length < 3) {
    const n = num(cost.value);
    if (n != null) items.push({ num: formatManwon(n), lbl: "창업비용 총액" });
  }

  if (items.length < 3) {
    const closeRate = pickByKey(facts, "docx_closure_rate", "A");
    if (closeRate) {
      const n = num(closeRate.value);
      if (n != null) items.push({ num: `${n}%`, lbl: "공시 폐점률" });
    }
  }

  return items.slice(0, 3);
}

export function buildConclusionBody(opts: {
  brand: string;
  facts: FactLite[];
  deriveds: DerivedMetric[];
}): string {
  const { brand, facts, deriveds } = opts;
  const sentences: string[] = [];

  // 일반 원리 1줄 (우열·권유 금지)
  const cost = num(pickByKey(facts, "docx_cost_total", "A")?.value);
  const rev = num(pickByKey(facts, "docx_avg_monthly_revenue", "A")?.value);
  const ratio = num(pickByKey(facts, "docx_industry_vs_brand_ratio", "A")?.value);
  if (cost != null && rev != null) {
    sentences.push(
      `프랜차이즈 창업비용은 총액보다 매출 대비 회수 가능성이 함께 보일 때 의미가 명확해집니다.`,
    );
  } else {
    sentences.push(
      `프랜차이즈 자료는 공시 시점과 본사 발표 시점이 다를 수 있어 두 자료를 함께 보는 것이 유효합니다.`,
    );
  }

  // 본 브랜드 정량 1줄
  const aStores = num(pickByKey(facts, "frcs_cnt", "A")?.value);
  const cStores = num(pickByKey(facts, "frcs_cnt", "C")?.value);
  if (aStores != null && cStores != null) {
    sentences.push(
      `${withJosa(brand, "은/는")} 공정위 자료 기준 ${aStores}개, 본사 발표 기준 ${cStores}호점이며, 월평균매출은 공정위 ${rev != null ? formatManwon(rev) : "—"}${ratio != null ? `로 업종 평균의 ${ratio}배 수준` : ""}입니다.`,
    );
  } else if (cost != null && rev != null) {
    sentences.push(
      `${withJosa(brand, "은/는")} 공정위 자료 기준 창업비용 ${formatManwon(cost)}, 월평균매출 ${formatManwon(rev)}으로 집계됩니다.`,
    );
  }

  // 시점·표본 한계 1줄
  const aPeriod = pickByKey(facts, "frcs_cnt", "A")?.period_month ?? null;
  const cPeriod = pickByKey(facts, "frcs_cnt", "C")?.period_month ?? null;
  if (aPeriod && cPeriod) {
    sentences.push(`공정위 자료는 ${aPeriod} 기준이며, 본사 발표는 ${cPeriod} 기준입니다.`);
  }

  // 직접 확인 안내
  sentences.push(`정확한 수치는 본사·공정위 정보공개서에서 직접 확인하실 수 있습니다.`);

  void deriveds;
  return sentences.join(" ");
}

/** PR046 — 본문에서 (frandoor 산출) 라벨이 반복되는 자체 산출 metric 들을 한 박스로 모아주는 항목 리스트. */
export function buildFormulaItems(opts: {
  facts: FactLite[];
  deriveds: DerivedMetric[];
}): FormulaItem[] {
  const { facts, deriveds } = opts;
  const items: FormulaItem[] = [];

  // 시계열 파생지표 (deriveTimeseries 결과)
  for (const d of deriveds) {
    if (d.key === "frcs_growth") {
      items.push({ metric: "가맹점 증가수 (A→C)", formula: d.formula ?? "C급[frcs_cnt] − A급[frcs_cnt]" });
    } else if (d.key === "frcs_multiplier") {
      items.push({ metric: "가맹점 확장배수 (A→C)", formula: d.formula ?? "C급[frcs_cnt] / A급[frcs_cnt]" });
    } else if (d.key === "annualized_pos_sales") {
      items.push({ metric: "C급 연환산 가맹점 평균매출", formula: d.formula ?? "C급[monthly_avg_sales] × 12" });
    } else if (d.key === "avg_sales_dilution") {
      items.push({ metric: "평균매출 희석률 (A→C)", formula: d.formula ?? "(A 연평균 − C 연환산) / A 연평균 × 100" });
    } else if (d.key === "real_closure_rate") {
      items.push({ metric: "실질폐점률", formula: "(계약종료 + 계약해지 + 명의변경) / 기초가맹점수 × 100" });
    } else if (d.key === "expansion_ratio") {
      items.push({ metric: "확장배수", formula: "신규개점 / 기초가맹점수" });
    }
  }

  // facts 안 자체 파생값
  if (pickByKey(facts, "docx_industry_vs_brand_ratio", "A")) {
    items.push({
      metric: "업종 평균 대비 배수",
      formula: "본 브랜드 월평균매출 / 동 업종 프랜차이즈 평균 월매출",
    });
  }
  // 중복 제거
  const seen = new Set<string>();
  return items.filter((it) => {
    if (seen.has(it.metric)) return false;
    seen.add(it.metric);
    return true;
  });
}
