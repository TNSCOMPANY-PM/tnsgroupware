export type Industry = {
  slug: string;
  name: string;
};

export const INDUSTRIES: Industry[] = [
  { slug: "chicken", name: "치킨" },
  { slug: "pizza", name: "피자" },
  { slug: "korean", name: "한식" },
  { slug: "bunsik", name: "분식" },
  { slug: "gimbab", name: "김밥" },
  { slug: "coffee", name: "커피" },
  { slug: "dessert", name: "디저트" },
  { slug: "burger", name: "햄버거" },
  { slug: "japanese", name: "일식" },
  { slug: "chinese", name: "중식" },
  { slug: "western", name: "양식" },
  { slug: "pork", name: "삼겹살" },
  { slug: "jokbal", name: "족발보쌈" },
  { slug: "pub", name: "주점" },
  { slug: "icecream", name: "아이스크림" },
];

export function getIndustryBySlug(slug: string): Industry | undefined {
  return INDUSTRIES.find((i) => i.slug === slug);
}
