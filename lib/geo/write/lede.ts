/**
 * PR047 — D3 본문 진입 / 결론 / 산식 정의를 마크다운(평문/표/인용)으로 직접 출력.
 * PR045/PR046 의 HTML 박스 인프라는 폐기됐으나, 데이터 추출 로직 (buildOneLineAnswer · pickHeadlineStats · buildConclusionBody · buildFormulaItems) 은 그대로 살림.
 */

import { formatManwon } from "@/lib/format/manwon";
import { withJosa } from "@/lib/format/josa";
import type { Fact, DerivedMetric } from "@/lib/geo/types";

export type StatItem = { num: string; lbl: string };
export type FormulaItem = {
  metric: string;
  /** PR049 — 결과값 (예: "9.5%", "0.81배", "+34개"). */
  result: string;
  /** PR049 — 사람 친화 풀어쓴 산식 (코드 표현 금지). */
  expression: string;
  /** PR049 — 산식 ID (real_closure_rate / expansion_ratio / frcs_growth / industry_vs_brand_ratio 등). */
  formula_id: string;
  /** PR049 — 본문 inline 인용 여부. detectUsedFormulas 가 결정. */
  used_in_body?: boolean;
};

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

/** PR057 — topic 에 비교 키워드 (vs|비교|평균|대비|차이) 매칭 시 true. */
function isCompareTopic(topic: string | undefined): boolean {
  if (!topic) return false;
  return /\bvs\b|비교|평균|대비|차이/i.test(topic);
}

/** PR057 — ftc 업종 평균 fact 추출 (compare lede 용). */
function pickFtcIndustryAvgRev(
  facts: FactLite[],
): { industry: string; n: number; avg: number } | null {
  const f = facts.find((x) => x.fact_key === "ftc2024_industry_avg_revenue");
  if (!f) return null;
  const claim = (f as unknown as { claim?: string }).claim;
  if (!claim) return null;
  const m = claim.match(/^(\S+?)\s*프랜차이즈\s*(\d+)\s*개\s*평균\s*월매출\s*([\d,]+)/);
  if (!m) return null;
  const avgVal = Number(m[3].replace(/,/g, ""));
  if (!Number.isFinite(avgVal)) return null;
  return { industry: m[1], n: parseInt(m[2], 10), avg: avgVal };
}

export function buildOneLineAnswer(opts: {
  brand: string;
  facts: FactLite[];
  deriveds: DerivedMetric[];
  /** PR057 — topic 비교 키워드 시 첫 문장 비교 중심으로 전환. */
  topic?: string;
}): { answer: string; detail: string | null } {
  const { brand, facts, deriveds, topic } = opts;

  // PR057 — topic 비교 우선: ftc 업종 평균 + 브랜드 월매출 가용 시 비교 lede
  if (isCompareTopic(topic)) {
    const ind = pickFtcIndustryAvgRev(facts);
    const brandRev = num(pickByKey(facts, "docx_avg_monthly_revenue", "A")?.value);
    if (ind && brandRev != null && ind.avg > 0) {
      const ratio = Math.round((brandRev / ind.avg) * 100) / 100;
      const ratioLabel = ratio >= 1 ? `${ratio}배 수준` : `약 ${Math.round(ratio * 100)}% 수준`;
      const answer = `${withJosa(`${brand} 월평균매출 ${formatManwon(brandRev)}`, "은/는")} ${ind.industry} 프랜차이즈 ${ind.n}개 평균 ${formatManwon(ind.avg)}의 ${ratioLabel}입니다.`;
      const aN = num(pickByKey(facts, "frcs_cnt", "A")?.value);
      const cN = num(pickByKey(facts, "frcs_cnt", "C")?.value);
      const detail =
        aN != null && cN != null
          ? `공정위 정보공개서 가맹점은 ${aN}개, 본사 발표 기준 ${cN}호점입니다.`
          : null;
      return { answer, detail };
    }
  }

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

export type MetaPattern = "A" | "B";
export type MetaPatternSelection = {
  pattern: MetaPattern;
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

export function buildConclusionBody(opts: {
  brand: string;
  facts: FactLite[];
  deriveds: DerivedMetric[];
}): string {
  const { brand, facts, deriveds } = opts;
  const sentences: string[] = [];

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

  const aPeriod = pickByKey(facts, "frcs_cnt", "A")?.period_month ?? null;
  const cPeriod = pickByKey(facts, "frcs_cnt", "C")?.period_month ?? null;
  if (aPeriod && cPeriod) {
    sentences.push(`공정위 자료는 ${aPeriod} 기준이며, 본사 발표는 ${cPeriod} 기준입니다.`);
  }

  sentences.push(`정확한 수치는 본사·공정위 정보공개서에서 직접 확인하실 수 있습니다.`);

  void deriveds;
  return sentences.join(" ");
}

function fmtSigned(n: number, unit: string): string {
  const r = Math.round(n * 10) / 10;
  const sign = r > 0 ? "+" : "";
  return `${sign}${r}${unit}`;
}

function fmtRatio(n: number): string {
  return `${(Math.round(n * 100) / 100).toFixed(2)}배`;
}

function fmtPercent(n: number, digits = 1): string {
  const r = Math.round(n * Math.pow(10, digits)) / Math.pow(10, digits);
  return `${r}%`;
}

export function buildFormulaItems(opts: {
  facts: FactLite[];
  deriveds: DerivedMetric[];
}): FormulaItem[] {
  const { facts, deriveds } = opts;
  const items: FormulaItem[] = [];

  // 시계열 파생 (frcs_growth / frcs_multiplier / annualized_pos_sales / avg_sales_dilution)
  // — A·C 시점·출처 라벨 풀어 쓰기 위해 facts 에서 raw 값 lookup.
  const aStores = pickByKey(facts, "frcs_cnt", "A");
  const cStores = pickByKey(facts, "frcs_cnt", "C");
  const aN = num(aStores?.value);
  const cN = num(cStores?.value);

  for (const d of deriveds) {
    if (d.key === "frcs_growth" && aN != null && cN != null) {
      items.push({
        metric: "가맹점 증가수",
        result: fmtSigned(d.value, "개"),
        expression: `본사 발표 ${cN}호점 − 공정위 ${aN}개`,
        formula_id: "frcs_growth",
      });
    } else if (d.key === "frcs_multiplier" && aN != null && cN != null) {
      items.push({
        metric: "가맹점 확장배수",
        result: fmtRatio(d.value),
        expression: `본사 발표 ${cN}호점 / 공정위 ${aN}개`,
        formula_id: "frcs_multiplier",
      });
    } else if (d.key === "annualized_pos_sales") {
      const cMonthly = num(pickByKey(facts, "monthly_avg_sales", "C")?.value);
      items.push({
        metric: "연환산 가맹점 평균매출",
        result: `${Math.round(d.value).toLocaleString("ko-KR")}만원`,
        expression: cMonthly != null ? `본사 발표 월매출 ${cMonthly.toLocaleString("ko-KR")}만원 × 12` : "본사 발표 월평균매출 × 12",
        formula_id: "annualized_pos_sales",
      });
    } else if (d.key === "avg_sales_dilution") {
      const aRev = num(pickByKey(facts, "docx_avg_monthly_revenue", "A")?.value);
      const cMonthly = num(pickByKey(facts, "monthly_avg_sales", "C")?.value);
      const aAnnual = aRev != null ? aRev * 12 : null;
      const cAnnual = cMonthly != null ? cMonthly * 12 : null;
      items.push({
        metric: "매출 희석률",
        result: fmtPercent(d.value, 1),
        expression:
          aAnnual != null && cAnnual != null
            ? `(공정위 연평균 ${aAnnual.toLocaleString("ko-KR")}만원 − 본사 연환산 ${cAnnual.toLocaleString("ko-KR")}만원) / 공정위 ${aAnnual.toLocaleString("ko-KR")}만원 × 100`
            : "(공정위 연평균 − 본사 연환산) / 공정위 연평균 × 100",
        formula_id: "avg_sales_dilution",
      });
    } else if (d.key === "real_closure_rate") {
      // PR050: 실질폐점률 폐기. 명의변경은 폐점 아님 — 산식 박스에서 제외.
      continue;
    } else if (d.key === "expansion_ratio") {
      const inputs = (d.inputs ?? {}) as Record<string, number | string>;
      const newCnt = Number(inputs["신규등록"] ?? 0);
      const base = Number(inputs["기초가맹점수"] ?? 0);
      items.push({
        metric: "확장배수",
        result: fmtRatio(d.value),
        expression: `신규개점 ${newCnt} / 기초가맹점수 ${base}`,
        formula_id: "expansion_ratio",
      });
    }
  }

  // 업종 평균 대비 배수 (facts 풀에서 직접 산출)
  const ratioFact = pickByKey(facts, "docx_industry_vs_brand_ratio", "A");
  if (ratioFact) {
    const ratioVal = num(ratioFact.value);
    const brandRev = num(pickByKey(facts, "docx_avg_monthly_revenue", "A")?.value);
    const indRev = num(pickByKey(facts, "docx_industry_avg_revenue")?.value);
    if (ratioVal != null) {
      items.push({
        metric: "업종 평균 대비 배수",
        result: fmtRatio(ratioVal),
        expression:
          brandRev != null && indRev != null
            ? `브랜드 월평균매출 ${brandRev.toLocaleString("ko-KR")}만원 / 업종 평균 ${indRev.toLocaleString("ko-KR")}만원`
            : "브랜드 월평균매출 / 동 업종 프랜차이즈 평균 월매출",
        formula_id: "industry_vs_brand_ratio",
      });
    }
  }

  // 중복 제거 (formula_id 기준)
  const seen = new Set<string>();
  return items.filter((it) => {
    if (seen.has(it.formula_id)) return false;
    seen.add(it.formula_id);
    return true;
  });
}

/** PR049 — 본문 inline 인용 검사 후 used_in_body 마킹. */
export function detectUsedFormulas(bodyMd: string, items: FormulaItem[]): FormulaItem[] {
  // 산식 H2 섹션 본문 제거 (그 안 result/metric 등장은 무시).
  // /m 사용 안 하고 \n## 명시 + 끝까지 매치는 [\s\S]*?(?=\n##|\Z) 대신 두 단계로 split.
  const startIdx = bodyMd.search(/##\s*이\s*글에서\s*계산한\s*값들/);
  let stripped = bodyMd;
  if (startIdx >= 0) {
    const after = bodyMd.slice(startIdx);
    const nextH2 = after.search(/\n##\s/);
    const sliceLen = nextH2 >= 0 ? nextH2 : after.length;
    stripped = bodyMd.slice(0, startIdx) + bodyMd.slice(startIdx + sliceLen);
  }
  return items.map((item) => {
    const hasResult = stripped.includes(item.result);
    const hasMetric = stripped.includes(item.metric);
    return { ...item, used_in_body: hasResult || hasMetric };
  });
}

/** ───────── 마크다운 출력 ───────── */

export function buildLedeMarkdown(opts: {
  brand: string;
  facts: FactLite[];
  deriveds: DerivedMetric[];
  metaPattern: MetaPattern;
  metaPeriodGapMonths: number | null;
  sectionTitle?: string;
  transitionLine?: string;
  /** PR057 — topic 비교 키워드 시 첫 문장 비교 중심으로 전환. */
  topic?: string;
}): string {
  const { brand, facts, deriveds, metaPattern, metaPeriodGapMonths } = opts;
  const lede = buildOneLineAnswer({ brand, facts, deriveds, topic: opts.topic });
  const stats = pickHeadlineStats({ facts, deriveds });
  const sectionTitle = opts.sectionTitle ?? `${brand} 핵심 수치, 한눈에 보면`;

  const parts: string[] = [];
  parts.push(`## ${sectionTitle}`);
  parts.push("");
  parts.push(lede.answer);
  if (lede.detail) {
    parts.push("");
    parts.push(lede.detail);
  }
  if (stats.length > 0) {
    parts.push("");
    parts.push("| 지표 | 수치 |");
    parts.push("|------|------|");
    for (const it of stats) {
      parts.push(`| ${it.lbl} | ${it.num} |`);
    }
  }
  parts.push("");
  if (metaPattern === "B" && metaPeriodGapMonths != null) {
    parts.push(`공정위 자료와 본사 발표 사이에 약 ${metaPeriodGapMonths}개월의 시차가 있습니다. 두 자료를 어떻게 읽어야 하는지 아래에서 정리했습니다.`);
  } else {
    parts.push("여기서 끝내도 됩니다. 숫자가 필요했던 분이라면 이미 답을 얻으셨으니까요.");
  }
  parts.push("");
  parts.push("이 숫자가 어떻게 나왔는지, 다른 자료와 어떻게 비교되는지 궁금하신 분은 계속 읽으시면 됩니다.");
  parts.push("");
  parts.push(opts.transitionLine ?? "→ 창업비용이 어떤 항목으로 구성되는지부터 봅니다.");
  return parts.join("\n");
}

/** PR051 — 결론 박스 5번째 share-line ("이타적 프레이밍"). */
export function buildShareLine(opts: { industry?: string | null }): string {
  const industry = (opts.industry ?? "").trim() || "프랜차이즈";
  const phrase = /프랜차이즈$/.test(industry) ? industry : `${industry} 프랜차이즈`;
  return `${phrase} 창업을 검토하는 지인이 있다면 이 글을 함께 보세요.`;
}

export function buildConclusionMarkdown(opts: {
  brand: string;
  facts: FactLite[];
  deriveds: DerivedMetric[];
  cta?: { label: string; href?: string; phone?: string } | null;
  industry?: string | null;
}): string {
  const body = buildConclusionBody({ brand: opts.brand, facts: opts.facts, deriveds: opts.deriveds });
  const shareLine = buildShareLine({ industry: opts.industry });
  const parts: string[] = ["## 결론", "", body, "", shareLine];
  if (opts.cta) {
    const linkPart = opts.cta.href ? `[${opts.cta.label}](${opts.cta.href})` : opts.cta.label;
    const phonePart = opts.cta.phone ? ` · ☎ ${opts.cta.phone}` : "";
    parts.push("");
    parts.push(`→ ${linkPart}${phonePart}`);
  }
  return parts.join("\n");
}

export function buildFormulaMarkdown(items: FormulaItem[]): string {
  if (items.length === 0) return "";
  // PR049 — markdown 표 형식 ("| 지표 | 결과 | 산식 |"). result 굵게.
  const parts: string[] = ["## 이 글에서 계산한 값들 (frandoor 산출)", ""];
  parts.push("| 지표 | 결과 | 산식 |");
  parts.push("|------|------|------|");
  for (const it of items) {
    parts.push(`| ${it.metric} | **${it.result}** | ${it.expression} |`);
  }
  return parts.join("\n");
}
