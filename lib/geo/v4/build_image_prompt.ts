/**
 * v4-22 — industry 기반 음식 사진 prompt 자동 생성 (gpt-image-1 / DALL-E 류 용).
 * 영어 prompt — 이미지 모델 quality 가 영어에서 더 안정적.
 *
 * LLM 호출 X — 코드 templated.
 */

const INDUSTRY_FOOD_HINTS: Record<string, string> = {
  한식: "Korean traditional dishes including bulgogi, kimchi, bibimbap, jeon, and various banchan side dishes",
  분식: "Korean street food: tteokbokki, kimbap, ramen, fried mandu, sundae, eomuk on a tray",
  중식: "Korean-Chinese cuisine: jjajangmyeon, jjamppong, tangsuyuk, fried rice, and stir-fried dishes",
  일식: "Japanese-Korean cuisine: sushi rolls, ramen, donburi, tempura, sashimi platter",
  서양식: "Western-style Korean restaurant fare: pasta, steak, salad, soup, plated together",
  기타외국식: "International cuisine: variety of foreign dishes plated on a wooden table",
  패스트푸드: "Fast food spread: burgers, fries, fried chicken, soft drinks, packaging visible",
  치킨: "Korean fried chicken: crispy chicken pieces, soy garlic glazed chicken, beer, pickled radish",
  피자: "Pizza varieties: pepperoni, cheese, gourmet toppings, freshly baked",
  제과제빵: "Korean bakery items: pastries, breads, cakes, croissants displayed on a wooden table",
  아이스크림빙수: "Korean shaved ice (bingsu) and ice cream desserts: red bean, mango, strawberry, milk",
  커피: "Specialty coffee shop: espresso, latte, americano, with pastry on a wooden cafe table",
  "음료(커피외)":
    "Beverages: smoothies, fresh juice, bubble tea, lemonade in cafe glasses",
  주점: "Korean pub (pojangmacha) food: anju, soju, beer, fried snacks, grilled fish",
  기타외식: "Korean fusion dishes: variety of restaurant food on a wooden table",
};

/**
 * gpt-image-1 / DALL-E 3 류 용 prompt 빌드.
 * topic / key_angle 은 prompt 길이 제한 + 모델 혼동 방지 위해 최소 hint 만 (지금은 사용 X).
 */
export function buildIndustryImagePrompt(input: {
  industry: string;
  topic?: string;
  key_angle?: string;
}): string {
  const foodHint =
    INDUSTRY_FOOD_HINTS[input.industry] ??
    `${input.industry} dishes representative of Korean ${input.industry} cuisine`;

  return [
    `Top-down food photography of ${foodHint}, beautifully arranged on a rustic wooden table.`,
    "Warm natural lighting, appetizing presentation, high resolution, restaurant-quality.",
    "Korean restaurant aesthetic, cozy atmosphere, no text or labels visible in the image.",
    "Professional food magazine style, sharp focus, vibrant colors.",
  ].join(" ");
}

export const SUPPORTED_INDUSTRIES = Object.keys(INDUSTRY_FOOD_HINTS) as readonly string[];
