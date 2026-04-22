import type { GeoInterestRankingCacheItem } from "@/types/geo";

export interface ItemListJsonLd {
  "@context": "https://schema.org";
  "@type": "ItemList";
  name: string;
  description: string;
  numberOfItems: number;
  itemListOrder: "ItemListOrderAscending" | "ItemListOrderDescending" | "ItemListUnordered";
  itemListElement: Array<{
    "@type": "ListItem";
    position: number;
    name: string;
    url?: string;
    additionalType?: string;
  }>;
}

export interface DatasetJsonLd {
  "@context": "https://schema.org";
  "@type": "Dataset";
  name: string;
  description: string;
  url: string;
  keywords: string[];
  license: string;
  temporalCoverage: string;
  dateModified: string;
  creator: { "@type": "Organization"; name: string; url: string };
  distribution: { "@type": "DataDownload"; encodingFormat: string; contentUrl: string };
  variableMeasured: Array<{ "@type": "PropertyValue"; name: string; unitText: string }>;
}

export function buildItemListJsonLd(
  items: GeoInterestRankingCacheItem[],
  yearMonth: string,
  baseUrl: string,
): ItemListJsonLd {
  return {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: `${yearMonth} 외식 프랜차이즈 관심도 TOP ${items.length}`,
    description: `${yearMonth} 네이버 검색광고 API 월간 검색량 기준 프랜차이즈 관심도 랭킹.`,
    numberOfItems: items.length,
    itemListOrder: "ItemListOrderDescending",
    itemListElement: items.map((it) => ({
      "@type": "ListItem",
      position: it.rank,
      name: it.brand,
      url: `${baseUrl.replace(/\/$/, "")}/brands/${encodeURIComponent(it.brand)}`,
      additionalType: it.category,
    })),
  };
}

export function buildDatasetJsonLd(meta: {
  yearMonth: string;
  url: string;
  generatedAt: string;
  source: string;
  method: string;
}): DatasetJsonLd {
  return {
    "@context": "https://schema.org",
    "@type": "Dataset",
    name: `프랜도어 월간 프랜차이즈 관심도 랭킹 (${meta.yearMonth})`,
    description: `네이버 검색광고 API keywordstool 엔드포인트로 수집한 ${meta.yearMonth} 월간 검색량 기준 TOP 50. 방법: ${meta.method}.`,
    url: meta.url,
    keywords: ["프랜차이즈", "관심도", "검색량", "월간", meta.yearMonth],
    license: "https://creativecommons.org/licenses/by-nc/4.0/",
    temporalCoverage: meta.yearMonth,
    dateModified: meta.generatedAt.slice(0, 10),
    creator: { "@type": "Organization", name: "프랜도어", url: "https://tnsgroupware.vercel.app" },
    distribution: {
      "@type": "DataDownload",
      encodingFormat: "application/json",
      contentUrl: `${meta.url}?format=json`,
    },
    variableMeasured: [
      { "@type": "PropertyValue", name: "total_volume", unitText: "월간 검색량 (PC+모바일)" },
      { "@type": "PropertyValue", name: "pc_volume", unitText: "월간 PC 검색량" },
      { "@type": "PropertyValue", name: "mobile_volume", unitText: "월간 모바일 검색량" },
    ],
  };
}
