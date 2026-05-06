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
 *
 * v4-23: photorealism 강화 — DSLR + 50mm f/2.8 + 8K + ★ "not illustration / not 3D render".
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
    // 1. 핵심 — hyperrealistic + 카메라 spec
    `Hyperrealistic top-down food photography of ${foodHint}, beautifully arranged on a rustic wooden dining table.`,
    // 2. 카메라 / 렌즈 / 라이팅
    "Shot with a professional DSLR (Canon EOS R5, 50mm f/2.8 lens), shallow depth of field, soft natural window light from the side.",
    // 3. 텍스처 / 디테일
    "Warm color tones, realistic food textures, steam rising from hot dishes, condensation on cold drinks, oil sheen and surface details.",
    // 4. 분위기
    "Korean restaurant interior atmosphere, cozy authentic dining setting, no text or labels visible in the image.",
    // 5. 해상도 / 품질
    "8K resolution, magazine-quality food photography, sharp focus on details, vibrant natural colors.",
    // 6. ★ 실사 강제
    "Photorealistic real photograph — not illustration, not 3D render, not painting, not AI-generated look.",
  ].join(" ");
}

export const SUPPORTED_INDUSTRIES = Object.keys(INDUSTRY_FOOD_HINTS) as readonly string[];
