/**
 * PR051 — 외식 업종 한글명 → URL slug 매핑.
 * 매핑된 업종만 회유 링크 활성. 부재 업종은 silent skip.
 */

const CATEGORY_SLUG: Record<string, string> = {
  분식: "snack-food",
  치킨: "chicken",
  커피: "coffee",
  피자: "pizza",
};

/** industryKor: 한국어 업종 명. 매핑 부재 시 null. */
export function categorySlugForIndustry(industryKor: string | null | undefined): string | null {
  if (!industryKor) return null;
  const trimmed = industryKor.trim();
  for (const key of Object.keys(CATEGORY_SLUG)) {
    if (trimmed.includes(key)) return CATEGORY_SLUG[key];
  }
  return null;
}

/** 회유 링크 마크다운 — 매핑 부재 시 빈 문자열. */
export function buildCategoryFunnelMarkdown(industryKor: string | null | undefined): string {
  const slug = categorySlugForIndustry(industryKor);
  if (!slug) return "";
  const label = `${(industryKor ?? "").trim()} 카테고리에서 다른 브랜드 비교`;
  return `→ [${label}](/category/${slug})`;
}
