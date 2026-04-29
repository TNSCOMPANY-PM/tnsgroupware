/**
 * v2-18 — 외식 15 업종. industry-only 모드 select dropdown 용.
 *
 * 공정거래위원회 정보공개서 induty_mlsfc 카테고리 기준.
 */

export const INDUSTRIES_15 = [
  "한식",
  "분식",
  "중식",
  "일식",
  "서양식",
  "기타 외국식",
  "패스트푸드",
  "치킨",
  "피자",
  "제과제빵",
  "아이스크림/빙수",
  "커피",
  "음료 (커피 외)",
  "주점",
  "기타 외식",
] as const;

export type Industry = (typeof INDUSTRIES_15)[number];

export function isValidIndustry(s: string): s is Industry {
  return (INDUSTRIES_15 as readonly string[]).includes(s);
}
