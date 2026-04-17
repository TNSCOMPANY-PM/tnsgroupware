/**
 * 통계청 KOSIS 공유서비스 (시장규모·인구 등 거시 지표)
 * 호출 한도: 일 10,000건 (KOSIS 공식 기준)
 * 기준문서: https://kosis.kr/openapi/index/index.jsp
 */

import type { KosisMarketSize } from "@/types/publicApi";
import { fetchStatisticsData } from "./kosis";

const REGION_POPULATION_FALLBACK: Record<string, number> = {
  "서울특별시": 9386034, "부산광역시": 3293362, "대구광역시": 2374960, "인천광역시": 2997410,
  "광주광역시": 1419237, "대전광역시": 1442216, "울산광역시": 1103661, "세종특별자치시": 387193,
  "경기도": 13630821, "강원특별자치도": 1525921, "충청북도": 1589347, "충청남도": 2123037,
  "전북특별자치도": 1751318, "전라남도": 1804217, "경상북도": 2554324, "경상남도": 3248716,
  "제주특별자치도": 675296,
};

import { mapIndustryCode } from "./kosis";

const SERVICE_INDEX_ORG = "101";
const SERVICE_INDEX_TBL = "DT_1KI1009";

export async function fetchIndustryMarketSize(industry: string, opts?: {
  months?: number;
}): Promise<KosisMarketSize[]> {
  const code = mapIndustryCode(industry);
  if (!code) return [];
  const months = opts?.months ?? 24;
  const now = new Date();
  const end = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}`;
  const startDate = new Date(now.getFullYear(), now.getMonth() - months, 1);
  const start = `${startDate.getFullYear()}${String(startDate.getMonth() + 1).padStart(2, "0")}`;

  try {
    const rows = await fetchStatisticsData({
      orgId: SERVICE_INDEX_ORG,
      tblId: SERVICE_INDEX_TBL,
      prdSe: "M",
      startPrdDe: start,
      endPrdDe: end,
    });
    const byPeriod = new Map<string, { value: number; industry: string; unit: string }>();
    for (const r of rows) {
      const c1 = r.C1_NM ?? "";
      const c1Code = r.C1 ?? "";
      if (!c1.includes(code.name) && !c1Code.includes(code.code)) continue;
      const value = Number(String(r.DT ?? "0").replace(/,/g, ""));
      if (isNaN(value) || value === 0) continue;
      byPeriod.set(r.PRD_DE ?? "", {
        value,
        industry: c1 || code.name,
        unit: r.UNIT_NM ?? "지수",
      });
    }
    return Array.from(byPeriod, ([period, v]) => ({
      period,
      industry: v.industry,
      value: v.value,
      unit: v.unit,
    }));
  } catch {
    return [];
  }
}

export async function fetchRegionPopulation(region: string): Promise<number> {
  const table: Record<string, string> = {
    "서울특별시": "11", "부산광역시": "21", "대구광역시": "22", "인천광역시": "23",
    "광주광역시": "24", "대전광역시": "25", "울산광역시": "26", "세종특별자치시": "29",
    "경기도": "31", "강원특별자치도": "32", "충청북도": "33", "충청남도": "34",
    "전북특별자치도": "35", "전라남도": "36", "경상북도": "37", "경상남도": "38",
    "제주특별자치도": "39",
  };
  const code = table[region];
  const fallback = REGION_POPULATION_FALLBACK[region] ?? 0;
  if (!code) return fallback;
  try {
    const rows = await fetchStatisticsData({
      orgId: "101",
      tblId: "DT_1B040A3",
      itmId: "T20",
      objL1: code,
      prdSe: "Y",
      endPrdDe: String(new Date().getFullYear() - 1),
      startPrdDe: String(new Date().getFullYear() - 1),
    });
    if (rows.length === 0) return fallback;
    const n = Number((rows[0].DT ?? "0").replace(/,/g, ""));
    return isNaN(n) || n === 0 ? fallback : n;
  } catch {
    return fallback;
  }
}

export { fetchKosisMonthly, fetchKosisIndustryAvg, mapIndustryCode } from "./kosis";
