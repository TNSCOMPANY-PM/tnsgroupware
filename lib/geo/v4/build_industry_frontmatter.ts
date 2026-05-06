/**
 * v4-17 — A only 업종 분석 모드 frontmatter + FAQ 코드 결정론.
 * brand_label 없음. industry + n_brands 단위.
 */
import type { Frontmatter } from "./build_frontmatter";
import type { FaqItem } from "./build_faq";
import type { IndustryAnalysisFacts } from "./types";

export type IndustryFrontmatterInput = {
  topic: string;
  industry: string;
  draft_id: string;
  today?: string;
  facts: IndustryAnalysisFacts;
};

export function buildIndustryFrontmatter(input: IndustryFrontmatterInput): Frontmatter {
  const today = input.today ?? new Date().toISOString().slice(0, 10);
  const title = input.topic.trim() || `${input.industry} 업종 분석`;
  const description = buildDescription(input);
  const slug = `industry-${slugifyIndustry(input.industry)}-${input.draft_id.slice(0, 6)}-${today.slice(0, 4)}`;
  const tags = uniq([input.industry, "외식", "업종 분석"].filter(Boolean) as string[]);

  return {
    title,
    description,
    slug,
    category: "업종 분석",
    date: today,
    dateModified: today,
    tags,
  };
}

function buildDescription(input: IndustryFrontmatterInput): string {
  const parts: string[] = [];
  parts.push(`${input.industry} ${input.facts.n_brands}개 브랜드 분포 분석`);

  // v4-19: 영문 "ranking + outlier" → 자연어 "상위 브랜드와 분포 차이". cleanLabel 로 metric label suffix 정리.
  const ranking = input.facts.ranking;
  if (ranking?.label && ranking.top10.length > 0) {
    parts.push(`${cleanLabel(ranking.label)} 상위 브랜드와 분포 차이 분석`);
  }

  parts.push("출처: 공정위 정보공개서(2024-12)");
  return (parts.join(". ") + ".").replace(/~/g, "～");
}

function slugifyIndustry(industry: string): string {
  // 한글 그대로 슬러그에 들어가도 next/url 동작 OK (encode 처리됨).
  // 공백/특수문자만 제거.
  return industry.replace(/[^a-zA-Z0-9가-힣]/g, "");
}

function uniq<T>(xs: T[]): T[] {
  return Array.from(new Set(xs));
}

/**
 * v4-18 — 업종 분석 FAQ 5문항 강제 (코드 결정론).
 * Q1~Q5 templated → fallback (남은 distributions) → final fallback (출처/시점 generic).
 *
 * v4-18 변경:
 *  · outlier 답변에 "σ" / "outlier" 표기 X — 자연어 ("평균과 두드러지게 차이 나는") 사용.
 *  · metric label 의 "(2024)" 괄호 제거 → "2024년 ..." 자연어로 변환.
 *  · 5건 강제 (final fallback 으로 generic 안내문 채움).
 */
export function buildIndustryFaq(input: {
  industry: string;
  facts: IndustryAnalysisFacts;
}): FaqItem[] {
  const { industry, facts } = input;
  const n_brands = facts.n_brands;
  const faqs: FaqItem[] = [];

  // Q1: 평균 매출
  const sales = facts.distributions["avg_sales_2024_total"];
  if (sales?.p50?.display && sales.p50.display !== "데이터 없음") {
    let answer = `정보공개서 기준 ${industry} ${n_brands}개 브랜드 가맹점 평균 연매출의 중앙값은 ${sales.p50.display}입니다.`;
    if (sales.p90?.display && sales.p90.display !== "데이터 없음") {
      answer += ` 상위 10% 기준선은 ${sales.p90.display}로, 중앙값과 격차가 큽니다.`;
    }
    faqs.push({
      q: `${industry} 가맹점 평균 연매출은 얼마인가요?`,
      a: escapeMarkdownTilde(answer),
    });
  }

  // Q2: ranking top 3
  if (facts.ranking?.top10?.length > 0) {
    const top3 = facts.ranking.top10.slice(0, 3);
    const list = top3
      .map((r, i) => `${i + 1}위 ${r.brand_label} (${r.value.display})`)
      .join(", ");
    faqs.push({
      q: `${industry} ${cleanLabel(facts.ranking.label)} 상위 브랜드는 어디인가요?`,
      a: escapeMarkdownTilde(
        `정보공개서 기준 ${cleanLabel(facts.ranking.label)} 상위 브랜드는 ${list} 순입니다.`,
      ),
    });
  }

  // Q3: 창업비용
  const cost = facts.distributions["startup_cost_total"];
  if (cost?.p50?.display && cost.p50.display !== "데이터 없음") {
    let answer = `정보공개서 기준 ${industry} 창업비용 총액의 중앙값은 ${cost.p50.display}입니다.`;
    if (cost.p25?.display && cost.p25.display !== "데이터 없음") {
      answer += ` 하위 25% 기준선은 ${cost.p25.display}로, 브랜드별 차이가 있습니다.`;
    }
    faqs.push({
      q: `${industry} 창업비용 총액 분포는 어떻게 되나요?`,
      a: escapeMarkdownTilde(answer),
    });
  }

  // Q4: 본사 영업이익률 또는 본사 매출
  const opMargin = facts.distributions["hq_op_margin_pct"];
  const fin = facts.distributions["fin_2024_revenue"];
  if (opMargin?.p50?.display && opMargin.p50.display !== "데이터 없음") {
    faqs.push({
      q: `${industry} 본사 영업이익률 분포는?`,
      a: escapeMarkdownTilde(
        `정보공개서 본사 재무 항목 기준 ${industry} ${n_brands}개 브랜드 본사 영업이익률 중앙값은 ${opMargin.p50.display}입니다.`,
      ),
    });
  } else if (fin?.p50?.display && fin.p50.display !== "데이터 없음") {
    faqs.push({
      q: `${industry} 본사 매출 분포는 어떻게 되나요?`,
      a: escapeMarkdownTilde(
        `정보공개서 본사 재무 항목 기준 ${industry} ${n_brands}개 브랜드 본사 매출 중앙값은 ${fin.p50.display}입니다.`,
      ),
    });
  }

  // Q5: outlier — 자연어 ("평균과 두드러지게 차이 나는 브랜드"). σ 표기 X.
  if (facts.outliers?.length > 0) {
    const top = facts.outliers.slice(0, 3);
    const list = top.map((o) => `${o.brand_label} (${o.value.display})`).join(", ");
    faqs.push({
      q: `${industry} 업종 안에서 평균과 두드러지게 차이 나는 브랜드는?`,
      a: escapeMarkdownTilde(
        `정보공개서 기준 ${industry} 분포 안에서 평균과 가장 큰 차이를 보이는 브랜드는 ${list} 등 ${facts.outliers.length}개입니다.`,
      ),
    });
  }

  // ★ Fallback — 5건 미달 시 가용한 distributions 로 추가 (이미 사용된 metric 제외).
  const usedMetrics = new Set<string>([
    "avg_sales_2024_total",
    "startup_cost_total",
    "hq_op_margin_pct",
    "fin_2024_revenue",
  ]);
  for (const [mid, dist] of Object.entries(facts.distributions ?? {})) {
    if (faqs.length >= 5) break;
    if (usedMetrics.has(mid)) continue;
    if (!dist?.p50?.raw || dist.p50.display === "데이터 없음") continue;
    const label = cleanLabel(dist.label);
    const parts = [`정보공개서 기준 ${industry} ${label} 분포에서 중앙값은 ${dist.p50.display}입니다.`];
    if (dist.p90?.display && dist.p90.display !== "데이터 없음") {
      parts.push(`상위 10% 기준선은 ${dist.p90.display}입니다.`);
    }
    faqs.push({
      q: `${industry} ${label} 분포는 어떻게 되나요?`,
      a: escapeMarkdownTilde(parts.join(" ")),
    });
  }

  // ★ Final fallback — 그래도 5 미만이면 generic 출처/시점/방식 안내문으로 채움.
  const finalFallback: FaqItem[] = [
    {
      q: `${industry} 업종 데이터의 출처는 어디인가요?`,
      a: `공정거래위원회 정보공개서(2024-12) 기준이며, ${industry} 업종 등록 ${n_brands}개 브랜드 분포를 모집단으로 합니다.`,
    },
    {
      q: `${industry} 업종 분석의 기준 시점은 언제인가요?`,
      a: `정보공개서(2024-12) 기준 데이터입니다. 본사 자체 발표 자료(POS·브로셔)는 별도 분석 모드(A+C)에서 다룹니다.`,
    },
    {
      q: `${industry} 분포 비교는 어떤 방식으로 이뤄지나요?`,
      a: `정보공개서 기준 ${industry} 업종 ${n_brands}개 브랜드의 항목별 분포 — 하위 25%, 중앙값, 상위 25%, 상위 10% 그리고 평균 — 으로 비교합니다.`,
    },
    {
      q: `${industry} 업종에 본사 발표 자료(브로셔/POS)는 포함되어 있나요?`,
      a: `이 분석은 정보공개서(A) 기반 업종 단위 분석입니다. 개별 브랜드의 본사 발표 자료(브로셔·POS·본사 카카오톡 확인 등)는 A+C 모드에서 별도로 다룹니다.`,
    },
    {
      q: `${industry} 평균과 두드러지게 차이 나는 브랜드는 어떤 기준으로 추출되나요?`,
      a: `정보공개서 기준 ${industry} 업종 분포에서 항목별 평균과 차이가 두드러지게 큰 브랜드를 추출합니다. 분포 안에서 가장 멀리 떨어진 브랜드를 우선 안내드립니다.`,
    },
  ];
  for (const fb of finalFallback) {
    if (faqs.length >= 5) break;
    if (faqs.some((f) => f.q === fb.q)) continue;
    faqs.push({ q: fb.q, a: escapeMarkdownTilde(fb.a) });
  }

  return faqs.slice(0, 5);
}

/**
 * v4-18~19 — metric label 의 영문/괄호/suffix 정리.
 *  · " (2024)" / " (2024-12)" 등 연도 괄호 제거
 *  · " (만원)" / " (원)" / " (%)" 단위 괄호 제거
 *  · " — 전체" / " — 평균" suffix 정리
 *  · trailing " 분포" 제거 (FAQ 답변 안에서 다시 풀어줌)
 */
function cleanLabel(label: string): string {
  return label
    .replace(/\s*\(\s*20\d{2}(?:[-/.]?\d{0,2})?\s*\)/g, "") // " (2024)" / " (2024-12)"
    .replace(/\s*\(\s*만원\s*\)/g, "") // " (만원)"
    .replace(/\s*\(\s*원\s*\)/g, "") // " (원)"
    .replace(/\s*\(\s*%\s*\)/g, "") // " (%)"
    .replace(/\s*[—–-]\s*전체\s*$/g, "") // " — 전체"
    .replace(/\s*[—–-]\s*평균\s*$/g, " 평균") // " — 평균" → " 평균"
    .replace(/\s*분포\s*$/g, "") // trailing " 분포"
    .trim();
}

function escapeMarkdownTilde(s: string): string {
  return s.replace(/~/g, "～");
}
