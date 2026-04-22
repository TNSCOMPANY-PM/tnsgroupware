import type { FaqItem, Depth } from "@/lib/geo/types";

const SITE_ORIGIN = "https://frandoor.co.kr";

export function buildFaqPage(faqs: FaqItem[]): Record<string, unknown> {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: faqs.map((f) => ({
      "@type": "Question",
      name: f.q,
      acceptedAnswer: { "@type": "Answer", text: f.a },
    })),
  };
}

export function buildBreadcrumb(segments: Array<{ name: string; url: string }>): Record<string, unknown> {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: segments.map((s, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: s.name,
      item: s.url.startsWith("http") ? s.url : `${SITE_ORIGIN}${s.url}`,
    })),
  };
}

export function buildFoodEstablishment(params: {
  brand: string;
  canonicalUrl: string;
  description?: string;
  category?: string;
}): Record<string, unknown> {
  return {
    "@context": "https://schema.org",
    "@type": "FoodEstablishment",
    name: params.brand,
    url: `${SITE_ORIGIN}${params.canonicalUrl}`,
    description: params.description ?? `${params.brand} 프랜차이즈 정보`,
    servesCuisine: params.category ?? "프랜차이즈",
  };
}

export function defaultBreadcrumbs(depth: Depth, canonicalUrl: string, label: string): Array<{ name: string; url: string }> {
  const root = { name: "프랜도어", url: "/" };
  if (depth === "D3") {
    return [root, { name: "브랜드", url: "/franchise" }, { name: label, url: canonicalUrl }];
  }
  if (depth === "D2") {
    return [root, { name: "업종", url: "/industry" }, { name: label, url: canonicalUrl }];
  }
  return [root, { name: "블로그", url: "/blog" }, { name: label, url: canonicalUrl }];
}
