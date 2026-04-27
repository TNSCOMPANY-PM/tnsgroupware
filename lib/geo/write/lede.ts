/**
 * PR045 — D3 본문 진입 / 결론 박스 생성에 쓰일 facts 휴리스틱.
 */

import { formatManwon } from "@/lib/format/manwon";
import type { Fact, DerivedMetric } from "@/lib/geo/types";
import type { StatItem } from "./blocks";

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
    const answer = `${brand} 가맹점은 공정위 ${periodLabel(aStores)} 기준 ${aN}개에서 본사 발표 기준 ${cN}호점으로 ${sign}${frcsGrowth}개 확장됐습니다.`;
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
    const answer = `${brand} 창업비용은 ${formatManwon(cost)}, 가맹점당 월평균매출은 ${formatManwon(rev)}으로 집계됩니다.`;
    const aN = num(aStores?.value);
    const detail = aN != null ? `공정위 정보공개서 ${periodLabel(aStores)} 기준 가맹점은 ${aN}개입니다.` : null;
    return { answer, detail };
  }

  const aN = num(aStores?.value) ?? num(cStores?.value);
  const fallback = aN != null
    ? `${brand}의 공시 가맹점은 ${aN}개로 집계됩니다.`
    : `${brand} 공개 자료를 정리합니다.`;
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
      `${brand}는 공정위 자료 기준 ${aStores}개, 본사 발표 기준 ${cStores}호점이며, 월평균매출은 공정위 ${rev != null ? formatManwon(rev) : "—"}${ratio != null ? `로 업종 평균의 ${ratio}배 수준` : ""}입니다.`,
    );
  } else if (cost != null && rev != null) {
    sentences.push(
      `${brand}는 공정위 자료 기준 창업비용 ${formatManwon(cost)}, 월평균매출 ${formatManwon(rev)}으로 집계됩니다.`,
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
