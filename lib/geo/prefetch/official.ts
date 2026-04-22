import "server-only";
import { fetchFtcFactByBrandName } from "@/utils/ftcFranchise";
import { fetchKosisIndustryAvg } from "@/utils/kosis";
import { getCachedOrFetch as getKosisCached } from "@/utils/kosisCache";
import { searchHygieneByBizName, FOODSAFETY_SERVICE } from "@/utils/foodSafety";
import {
  getCachedOrFetch as getFoodCached,
  buildCacheKey as buildFoodKey,
} from "@/utils/foodSafetyCache";
import type { HygieneRow } from "@/types/foodSafety";

export type FtcFact = Awaited<ReturnType<typeof fetchFtcFactByBrandName>>;
export type KosisFact = Awaited<ReturnType<typeof fetchKosisIndustryAvg>>;
export type HygieneFact = { total: number; rows: HygieneRow[] };

export type PrefetchRaw = {
  ftc?: FtcFact;
  kosis?: KosisFact;
  hygiene?: HygieneFact;
};

export type PrefetchResult = {
  block: string;
  sources: string[];
  raw: PrefetchRaw;
};

const FOOD_HINT =
  /음식|외식|식품|프랜차이즈|김밥|분식|카페|치킨|주점|배달|피자|빵|제과|패스트푸드|커피|베이커리/;

export async function prefetchOfficial(input: {
  brand?: string;
  industry?: string;
  category?: string;
}): Promise<PrefetchResult> {
  const sections: string[] = [];
  const sources: string[] = [];
  const raw: PrefetchRaw = {};
  const today = new Date();
  const prdKey = `${today.getUTCFullYear()}${String(today.getUTCMonth() + 1).padStart(2, "0")}`;

  // FTC — 브랜드 단위 (브랜드 있을 때만)
  if (input.brand) {
    try {
      const ftc = await fetchFtcFactByBrandName(input.brand);
      if (ftc.ok) {
        raw.ftc = ftc;
        sections.push(`[FTC_FRANCHISE]\n${ftc.factBlock}`);
        sources.push("https://franchise.ftc.go.kr/");
      }
    } catch (e) {
      console.warn(`[prefetch.official.ftc] ${input.brand}:`, e instanceof Error ? e.message : e);
    }
  }

  // KOSIS — industry + brand 힌트
  const industryHint = [input.industry, input.category, input.brand].filter(Boolean).join(" ") || "외식";
  try {
    const kosis = await getKosisCached(
      `KOSIS_INDUSTRY:${industryHint}`,
      prdKey,
      () => fetchKosisIndustryAvg(industryHint),
    );
    if (kosis) {
      raw.kosis = kosis;
      sections.push(`[KOSIS_INDUSTRY_AVG]\n${JSON.stringify(kosis, null, 2)}`);
      sources.push("https://kosis.kr/");
    }
  } catch (e) {
    console.warn(`[prefetch.official.kosis]`, e instanceof Error ? e.message : e);
  }

  // 식약처 — 외식 관련일 때만
  const isFood = FOOD_HINT.test(`${input.industry ?? ""} ${input.category ?? ""} ${input.brand ?? ""}`);
  if (isFood && input.brand) {
    try {
      const hygiene = await getFoodCached(
        buildFoodKey(FOODSAFETY_SERVICE.HYGIENE_GRADE, { BSSH_NM: input.brand }),
        () =>
          searchHygieneByBizName(input.brand!, 5).catch(() => ({
            total: 0,
            rows: [] as HygieneRow[],
          })),
      );
      if (hygiene.total > 0) {
        raw.hygiene = hygiene;
        const rowsShort = hygiene.rows.slice(0, 5).map((h) => ({
          biz_name: h.PRDTNM,
          address: h.ADDR,
          grade: h.PRDLST_TYPE,
          designated_at: h.CRET_DTM,
        }));
        sections.push(
          `[FOOD_SAFETY_HYGIENE]\n${JSON.stringify(
            {
              total: hygiene.total,
              rows: rowsShort,
              source_period: `${prdKey.slice(0, 4)}-${prdKey.slice(4)}`,
            },
            null,
            2,
          )}`,
        );
        sources.push("https://www.foodsafetykorea.go.kr/");
      }
    } catch (e) {
      console.warn(`[prefetch.official.foodsafety]`, e instanceof Error ? e.message : e);
    }
  }

  const block = sections.length > 0
    ? `[OFFICIAL_DATA]\n${sections.join("\n\n")}\n[/OFFICIAL_DATA]`
    : `[OFFICIAL_DATA]\n(pre-fetch 결과 없음 — 공식 API 자체 검색 필요)\n[/OFFICIAL_DATA]`;

  return { block, sources, raw };
}
