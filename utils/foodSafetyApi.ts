/**
 * 식품안전나라 리콜·위반이력 도메인 래퍼 (식약처)
 * 호출 한도: 일 1,000건 (식품안전나라 포털 기준)
 * 기준문서: https://www.foodsafetykorea.go.kr/api/openApiInfo.do
 */

import type { FoodSafetyIncident } from "@/types/publicApi";
import type { RecallRow } from "@/types/foodSafety";
import { fetchFoodSafety, FOODSAFETY_SERVICE } from "./foodSafety";

const INDUSTRY_KEYWORDS: Record<string, string[]> = {
  "치킨": ["치킨", "닭"],
  "카페": ["커피", "음료", "디저트"],
  "편의점": ["편의", "즉석"],
  "피자": ["피자"],
  "한식": ["김치", "반찬", "밑반찬"],
  "분식": ["떡볶이", "분식", "만두"],
  "주점": ["주류", "안주"],
};

export async function fetchIndustryIncidents(industry: string, opts?: {
  months?: number;
}): Promise<FoodSafetyIncident[]> {
  const months = opts?.months ?? 12;
  const keywords = INDUSTRY_KEYWORDS[industry] ?? [industry];
  const cutoff = new Date();
  cutoff.setMonth(cutoff.getMonth() - months);
  const cutoffStr = cutoff.toISOString().slice(0, 10).replace(/-/g, "");

  const all: FoodSafetyIncident[] = [];
  for (const kw of keywords) {
    try {
      const res = await fetchFoodSafety<RecallRow>(FOODSAFETY_SERVICE.HYGIENE_GRADE, {
        start: 1,
        end: 100,
        conditions: { PRDTNM: kw },
      });
      for (const r of res.rows) {
        const date = (r.CRET_DTM ?? r.MNFDT ?? "").replace(/[^0-9]/g, "").slice(0, 8);
        if (date && date < cutoffStr) continue;
        all.push({
          type: "recall",
          bizName: r.ADDR ? r.ADDR.split(/\s+/).slice(-1)[0] ?? "" : "",
          productName: r.PRDTNM ?? "",
          reason: r.RTRVLPRVNS ?? "",
          occurredAt: r.CRET_DTM ?? "",
          grade: r.PRDLST_TYPE ?? "",
          raw: r as Record<string, string>,
        });
      }
    } catch {
      continue;
    }
  }
  return all;
}

export function aggregateViolations(incidents: FoodSafetyIncident[]): Array<{ reason: string; count: number }> {
  const map = new Map<string, number>();
  for (const i of incidents) {
    const key = (i.reason || "사유 미상").slice(0, 40);
    map.set(key, (map.get(key) ?? 0) + 1);
  }
  return Array.from(map, ([reason, count]) => ({ reason, count }))
    .sort((a, b) => b.count - a.count);
}

export { fetchFoodSafety, FOODSAFETY_SERVICE, searchHygieneByBizName, searchRecallByProduct } from "./foodSafety";
