/**
 * PR045 — D3 제목 SEO 친화 패턴 5종 + 휴리스틱 선택기.
 * 패턴: cost-hook / revenue-hook / expansion-hook / closure-hook / compare-hook
 * 결과 길이: 28~45자 우선.
 *
 * PR057 — topic 우선 라우터. topic 에 명확한 키워드 (vs|비교|평균|창업비용|확장|폐점) 존재 시
 * 해당 패턴 강제 채택 (facts 보조). topic 미지정 또는 모호 시 기존 facts-priority fallback.
 */

import { formatManwon } from "@/lib/format/manwon";
import type { Fact, DerivedMetric } from "@/lib/geo/types";

export type TitleCandidate = {
  pattern: "cost-hook" | "revenue-hook" | "expansion-hook" | "closure-hook" | "compare-hook";
  title: string;
  score: number;
};

type FactLite = Pick<Fact, "fact_key" | "value" | "unit" | "source_tier">;

function num(v: string | number | null | undefined): number | null {
  if (v == null) return null;
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  const n = Number(String(v).replace(/[,\s만원%개건배호점]/g, ""));
  return Number.isFinite(n) ? n : null;
}

function pickByKey(facts: FactLite[], key: string, tier?: "A" | "B" | "C"): FactLite | null {
  return facts.find((f) => f.fact_key === key && (!tier || f.source_tier === tier)) ?? null;
}

function lengthFitness(s: string): number {
  const len = s.length;
  if (len >= 28 && len <= 45) return 1.0;
  if (len >= 22 && len <= 50) return 0.7;
  return 0.3;
}

function topicMatches(topic: string | undefined, keywords: string[]): boolean {
  if (!topic) return false;
  return keywords.some((kw) => topic.includes(kw));
}

export function buildTitleCandidates(opts: {
  brand: string;
  facts: FactLite[];
  deriveds: DerivedMetric[];
  topic?: string;
  year?: string;
}): TitleCandidate[] {
  const { brand, facts, deriveds, topic, year } = opts;
  const candidates: TitleCandidate[] = [];
  const yr = year ?? "2024";

  // cost-hook
  const cost = num(pickByKey(facts, "docx_cost_total", "A")?.value);
  const realInvest = num(pickByKey(facts, "docx_hp_real_investment", "C")?.value);
  if (cost != null) {
    const costLabel = formatManwon(cost);
    const tail = realInvest != null
      ? `실투자금 ${formatManwon(realInvest)} 가능 구조`
      : `공정위 자료로 본 실투자 구조`;
    const title = `${brand} 창업비용 ${costLabel} ${yr} — ${tail}`;
    candidates.push({
      pattern: "cost-hook",
      title,
      score: lengthFitness(title) * (topicMatches(topic, ["창업비용", "투자금", "비용"]) ? 1.5 : 1.0),
    });
  }

  // revenue-hook
  const rev = num(pickByKey(facts, "docx_avg_monthly_revenue", "A")?.value);
  const ratio = num(pickByKey(facts, "docx_industry_vs_brand_ratio", "A")?.value);
  if (rev != null) {
    const revLabel = formatManwon(rev);
    const tail = ratio != null ? `업종 평균의 ${ratio}배` : `${yr} 공정위 자료 기준`;
    const title = `${brand} 월매출 ${revLabel} — ${tail}`;
    candidates.push({
      pattern: "revenue-hook",
      title,
      score: lengthFitness(title) * (topicMatches(topic, ["매출", "수익"]) ? 1.5 : 1.0),
    });
  }

  // expansion-hook
  const aStores = num(pickByKey(facts, "frcs_cnt", "A")?.value);
  const cStores = num(pickByKey(facts, "frcs_cnt", "C")?.value);
  const frcsGrowth = deriveds.find((d) => d.key === "frcs_growth")?.value ?? null;
  if (aStores != null && cStores != null && frcsGrowth != null) {
    const sign = frcsGrowth > 0 ? "+" : "";
    const tail = frcsGrowth > 0
      ? `공정위 집계 이후 ${sign}${frcsGrowth}개 확장`
      : `공정위 집계 이후 ${frcsGrowth}개`;
    const title = `${brand} 가맹점 ${aStores}→${cStores}개 — ${tail}`;
    candidates.push({
      pattern: "expansion-hook",
      title,
      score: lengthFitness(title) * (topicMatches(topic, ["확장", "추세", "가맹점", "성장"]) ? 1.5 : 1.0) * (frcsGrowth > 0 ? 1.1 : 1.0),
    });
  }

  // closure-hook
  const closeRate = num(pickByKey(facts, "docx_closure_rate", "A")?.value);
  const newOpen = num(pickByKey(facts, "ftc_ts_new_opens", "A")?.value);
  const ctEnd = num(pickByKey(facts, "ftc_ts_contract_end", "A")?.value);
  if (closeRate != null) {
    const tail =
      newOpen != null && ctEnd != null
        ? `신규 ${newOpen}개 vs 종료 ${ctEnd}개`
        : `${yr} 공정위 자료 기준`;
    const title = `${brand} 폐점률 ${closeRate}% ${yr} — ${tail}`;
    candidates.push({
      pattern: "closure-hook",
      title,
      score: lengthFitness(title) * (topicMatches(topic, ["폐점", "종료", "리스크"]) ? 1.5 : 1.0),
    });
  }

  // compare-hook
  if (aStores != null && cStores != null) {
    const title = `${brand} ${yr} — 공정위 자료와 본사 발표, 어떻게 다를까?`;
    candidates.push({
      pattern: "compare-hook",
      title,
      score: lengthFitness(title) * (topicMatches(topic, ["비교", "차이", "어떻게"]) ? 1.5 : 0.9),
    });
  }

  return candidates;
}

const PATTERN_PRIORITY: Record<TitleCandidate["pattern"], number> = {
  "cost-hook": 5,
  "expansion-hook": 4,
  "revenue-hook": 3,
  "compare-hook": 2,
  "closure-hook": 1,
};

/** PR057 — facts 풀에서 ftc 업종 N(개수) + 업종명 추출 (compare-hook 용). */
function pickIndustryFromFacts(facts: FactLite[]): { industry: string | null; n: number | null } {
  // ftc2024_industry_avg_revenue 의 claim 패턴: "${industry} 프랜차이즈 ${N}개 평균 월매출 ..."
  const f = facts.find((x) => x.fact_key === "ftc2024_industry_avg_revenue") as
    | (FactLite & { claim?: string })
    | undefined;
  const claim = (f as unknown as { claim?: string } | undefined)?.claim;
  if (claim) {
    const m = claim.match(/^(\S+?)\s*프랜차이즈\s*(\d+)\s*개/);
    if (m) return { industry: m[1], n: parseInt(m[2], 10) };
  }
  return { industry: null, n: null };
}

/** PR057 — 상위 N% 추출 (compare-hook tail 용). */
function pickPercentileTail(facts: FactLite[]): string | null {
  const f = facts.find((x) => x.fact_key === "ftc2024_industry_percentile");
  if (!f) return null;
  const claim = (f as unknown as { claim?: string }).claim;
  if (!claim) return null;
  const m = claim.match(/상위\s*([\d.]+)\s*%/);
  return m ? `상위 ${m[1]}%` : null;
}

/** PR057 — topic 키워드 → 강제 패턴 매핑. */
function topicForcedPattern(topic: string | undefined): TitleCandidate["pattern"] | null {
  if (!topic) return null;
  const t = topic.trim();
  if (!t) return null;
  if (/\bvs\b|비교|평균|차이|대비/i.test(t)) return "compare-hook";
  if (/창업\s*비용|투자금|실투자|인테리어/.test(t)) return "cost-hook";
  if (/확장|추세|점포\s*수|가맹점\s*수|성장/.test(t)) return "expansion-hook";
  if (/매출|월수익|연수익|수익/.test(t)) return "revenue-hook";
  if (/폐점|리스크|위험|종료/.test(t)) return "closure-hook";
  return null;
}

/** PR057 — 강제 패턴별 title builder. ftc/facts 가용 시 강화, 미가용 시 minimal. */
function buildForcedTitle(
  pattern: TitleCandidate["pattern"],
  opts: { brand: string; facts: FactLite[]; deriveds: DerivedMetric[]; topic?: string; year?: string },
): string | null {
  const { brand, facts, year } = opts;
  const yr = year ?? "2024";

  if (pattern === "compare-hook") {
    const { industry, n } = pickIndustryFromFacts(facts);
    const pctTail = pickPercentileTail(facts);
    if (industry && n) {
      const tail = pctTail ? ` — ${pctTail} 차이` : ` — ${yr} 비교`;
      return `${brand} vs ${industry} 프랜차이즈 ${n}개 평균${tail}`;
    }
    if (industry) {
      return `${brand} vs ${industry} 프랜차이즈 평균 — 공정위 ${yr} 비교`;
    }
    // ftc 미가동 — facts 기반 candidates 중 compare-hook 시도
    const cands = buildTitleCandidates(opts).filter((c) => c.pattern === "compare-hook");
    if (cands.length > 0) return cands[0].title;
    return null;
  }

  if (pattern === "cost-hook") {
    const cands = buildTitleCandidates(opts).filter((c) => c.pattern === "cost-hook");
    if (cands.length > 0) return cands[0].title;
    return null;
  }
  if (pattern === "expansion-hook") {
    const cands = buildTitleCandidates(opts).filter((c) => c.pattern === "expansion-hook");
    if (cands.length > 0) return cands[0].title;
    return null;
  }
  if (pattern === "revenue-hook") {
    const cands = buildTitleCandidates(opts).filter((c) => c.pattern === "revenue-hook");
    if (cands.length > 0) return cands[0].title;
    return null;
  }
  if (pattern === "closure-hook") {
    const cands = buildTitleCandidates(opts).filter((c) => c.pattern === "closure-hook");
    if (cands.length > 0) return cands[0].title;
    return null;
  }
  return null;
}

export function chooseTitle(opts: {
  brand: string;
  facts: FactLite[];
  deriveds: DerivedMetric[];
  topic?: string;
  year?: string;
}): { title: string; pattern: TitleCandidate["pattern"] } | null {
  // PR057 — 1단계: topic 우선 강제 패턴
  const forced = topicForcedPattern(opts.topic);
  if (forced) {
    const title = buildForcedTitle(forced, opts);
    if (title) return { title, pattern: forced };
    // forced 패턴에 필요한 facts 부재 — facts-priority 로 graceful fallback
  }

  // 2단계: facts-priority (기존 PR045 로직)
  const candidates = buildTitleCandidates(opts);
  if (candidates.length === 0) return null;
  candidates.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return PATTERN_PRIORITY[b.pattern] - PATTERN_PRIORITY[a.pattern];
  });
  const top = candidates[0];
  return { title: top.title, pattern: top.pattern };
}
