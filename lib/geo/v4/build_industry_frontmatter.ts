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

  const ranking = input.facts.ranking;
  if (ranking?.label && ranking.top10.length > 0) {
    parts.push(`${ranking.label} ranking + outlier 검토`);
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
 * v4-17 — 업종 분석 FAQ 5문항 코드 결정론.
 * distributions / ranking / outliers 활용.
 */
export function buildIndustryFaq(input: {
  industry: string;
  facts: IndustryAnalysisFacts;
}): FaqItem[] {
  const { industry, facts } = input;
  const faqs: FaqItem[] = [];

  // Q1: 평균 매출
  const sales = facts.distributions["avg_sales_2024_total"];
  if (sales?.p50?.display && sales.p50.display !== "데이터 없음") {
    let answer = `정보공개서 기준 ${industry} ${facts.n_brands}개 브랜드 가맹점 평균 연매출의 중앙값은 ${sales.p50.display}입니다.`;
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
      q: `${industry} ${facts.ranking.label} 상위 brand 는?`,
      a: escapeMarkdownTilde(
        `정보공개서 기준 ${facts.ranking.label} 상위 brand 는 ${list} 순입니다.`,
      ),
    });
  }

  // Q3: 창업비용
  const cost = facts.distributions["startup_cost_total"];
  if (cost?.p50?.display && cost.p50.display !== "데이터 없음") {
    let answer = `정보공개서 기준 ${industry} 창업비용 총액의 중앙값은 ${cost.p50.display}입니다.`;
    if (cost.p25?.display && cost.p25.display !== "데이터 없음") {
      answer += ` 하위 25% 기준선은 ${cost.p25.display} 로, brand 별 차이가 있습니다.`;
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
        `정보공개서 본사 재무 항목 기준 ${industry} ${facts.n_brands}개 브랜드 본사 영업이익률 중앙값은 ${opMargin.p50.display}입니다.`,
      ),
    });
  } else if (fin?.p50?.display && fin.p50.display !== "데이터 없음") {
    faqs.push({
      q: `${industry} 본사 매출 분포는 어떻게 되나요?`,
      a: escapeMarkdownTilde(
        `정보공개서 본사 재무 항목 기준 ${industry} ${facts.n_brands}개 브랜드 본사 매출 중앙값은 ${fin.p50.display}입니다.`,
      ),
    });
  }

  // Q5: outlier
  if (facts.outliers?.length > 0) {
    const top = facts.outliers.slice(0, 3);
    const list = top
      .map((o) => `${o.brand_label} (${o.value.display}, ${o.deviation} ${o.sigma}σ)`)
      .join(", ");
    faqs.push({
      q: `${industry} ${facts.ranking.label} 평균 대비 큰 차이를 보이는 brand 는?`,
      a: escapeMarkdownTilde(
        `정보공개서 기준 평균 ±2σ 를 벗어난 outlier 는 ${list} 등 ${facts.outliers.length}개 brand 입니다.`,
      ),
    });
  }

  // 5건 미만이면 가맹점수 / 가맹비 분포 fallback
  if (faqs.length < 5) {
    const stores = facts.distributions["frcs_cnt_2024_total"];
    if (stores?.p50?.display && stores.p50.display !== "데이터 없음") {
      faqs.push({
        q: `${industry} 가맹점 수 분포는?`,
        a: escapeMarkdownTilde(
          `정보공개서 기준 ${industry} ${facts.n_brands}개 브랜드 전체 가맹점수 중앙값은 ${stores.p50.display}입니다.`,
        ),
      });
    }
  }
  if (faqs.length < 5) {
    const fee = facts.distributions["startup_fee"];
    if (fee?.p50?.display && fee.p50.display !== "데이터 없음") {
      faqs.push({
        q: `${industry} 가맹비 분포는?`,
        a: escapeMarkdownTilde(
          `정보공개서 기준 ${industry} ${facts.n_brands}개 브랜드 가맹비 중앙값은 ${fee.p50.display}입니다.`,
        ),
      });
    }
  }

  return faqs.slice(0, 5);
}

function escapeMarkdownTilde(s: string): string {
  return s.replace(/~/g, "～");
}
