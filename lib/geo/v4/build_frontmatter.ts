/**
 * v4-13 — frontmatter (title/description/slug/category/date/tags) 코드 결정론.
 * a_facts + c_facts 에서 자동 생성. writer 는 본문만 출력.
 */
import type { AFactsResult, CFactsResult } from "./types";

export type Frontmatter = {
  title: string;
  description: string;
  slug: string;
  category: string;
  date: string;
  dateModified: string;
  tags: string[];
  // v4-22~25 — Step 4 (썸네일) 가 채움. frandoor.co.kr frontmatter 표준 키.
  thumbnail?: string;
};

export type FrontmatterInput = {
  topic: string;
  brand_label: string;
  industry: string;
  brand_id: string;
  today?: string; // ISO yyyy-mm-dd, 미지정 시 today
  a_facts: AFactsResult;
  c_facts: CFactsResult;
};

const COST_TOTAL_KEYS = ["startup_cost_total", "cost_total"];
const ANNUAL_REV_KEYS = ["avg_sales_2024_total", "annual_revenue", "monthly_avg_revenue"];

export function buildFrontmatter(input: FrontmatterInput): Frontmatter {
  const today = input.today ?? new Date().toISOString().slice(0, 10);
  const title = input.topic.trim() || `${input.brand_label} 분석`;
  const description = buildDescription(input);
  const slug = `${slugFromBrandId(input.brand_id)}-${today.slice(0, 4)}`;
  const tags = uniq([input.brand_label, input.industry, "외식"].filter(Boolean) as string[]);

  return {
    title,
    description,
    slug,
    category: "브랜드 분석",
    date: today,
    dateModified: today,
    tags,
  };
}

function buildDescription(input: FrontmatterInput): string {
  const parts: string[] = [];
  const costTotal = pickFactGroup(input.a_facts, COST_TOTAL_KEYS);
  if (costTotal?.A) parts.push(`${input.brand_label} 창업비용 총액 ${costTotal.A.display}`);

  const annualRev = pickFactGroup(input.a_facts, ANNUAL_REV_KEYS);
  if (annualRev?.A) parts.push(`가맹점 평균 연매출 ${annualRev.A.display}`);

  const nPop = annualRev?.distribution?.n_population;
  if (typeof nPop === "number" && nPop > 0) {
    parts.push(`${input.industry} ${nPop}개 브랜드 비교`);
  }

  parts.push("출처: 공정위 정보공개서(2024-12)");
  // v4-14: markdown ~ strikethrough 회피 — 범위 표기는 전각 "～" 로.
  return (parts.join(". ") + ".").replace(/~/g, "～");
}

function pickFactGroup(
  aFacts: AFactsResult,
  keys: string[],
): AFactsResult["fact_groups"][string] | null {
  for (const k of keys) {
    const g = aFacts.fact_groups[k];
    if (g) return g;
  }
  return null;
}

function slugFromBrandId(brandId: string): string {
  const trimmed = brandId.replace(/[^a-zA-Z0-9]/g, "");
  return trimmed.slice(0, 8) || "brand";
}

function uniq<T>(xs: T[]): T[] {
  return Array.from(new Set(xs));
}
