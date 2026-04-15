/**
 * 식약처 식품안전나라 OpenAPI 래퍼.
 * 인증키: FOODSAFETY_API_KEY.
 *
 * URL 포맷: {BASE}/{KEY}/{SERVICE_ID}/json/{START}/{END}/{k1=v1/k2=v2}
 * 응답: { [SERVICE_ID]: { total_count, RESULT:{CODE,MSG}, row:[...] } }
 */

import type {
  HygieneRow,
  RecallRow,
  NutritionRow,
  RecipeRow,
  HealthFuncRow,
} from "@/types/foodSafety";

export const FOODSAFETY_BASE = "https://openapi.foodsafetykorea.go.kr/api";

export const FOODSAFETY_SERVICE = {
  HYGIENE_GRADE: "I0490",
  RECALL: "I2570",
  NUTRITION: "I2790",
  RECIPE: "COOKRCP01",
  HEALTH_FUNC: "I1250",
} as const;

export type FoodSafetyServiceId = typeof FOODSAFETY_SERVICE[keyof typeof FOODSAFETY_SERVICE];

function getKey(): string {
  const k = process.env.FOODSAFETY_API_KEY;
  if (!k) throw new Error("[foodSafety] FOODSAFETY_API_KEY 미설정");
  return k;
}

type ApiResponse<T> = {
  [k: string]: {
    total_count?: string | number;
    RESULT?: { CODE?: string; MSG?: string };
    row?: T[];
  };
};

export type FetchOpts = {
  start?: number;
  end?: number;
  conditions?: Record<string, string>;
};

export async function fetchFoodSafety<T>(
  serviceId: FoodSafetyServiceId,
  opts: FetchOpts = {},
): Promise<{ total: number; rows: T[] }> {
  const start = opts.start ?? 1;
  const end = opts.end ?? 100;
  const condSegments = Object.entries(opts.conditions ?? {})
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join("/");
  const tail = condSegments ? `/${condSegments}` : "";
  const url = `${FOODSAFETY_BASE}/${getKey()}/${serviceId}/json/${start}/${end}${tail}`;

  const res = await fetch(url, {
    cache: "no-store",
    headers: { "User-Agent": "Mozilla/5.0" },
  });
  if (!res.ok) throw new Error(`[foodSafety] HTTP ${res.status} ${serviceId}`);

  const text = await res.text();
  if (text.trimStart().startsWith("<")) {
    // 키 미승인 시 HTML alert 반환
    const m = text.match(/alert\('([^']+)'/);
    throw new Error(`[foodSafety] ${serviceId} 키 승인 필요: ${m?.[1] ?? "HTML 응답"}`);
  }
  let json: ApiResponse<T>;
  try {
    json = JSON.parse(text) as ApiResponse<T>;
  } catch {
    throw new Error(`[foodSafety] ${serviceId} JSON 파싱 실패: ${text.slice(0, 120)}`);
  }
  const body = json[serviceId];
  if (!body) throw new Error(`[foodSafety] ${serviceId} 응답에 서비스 노드 없음`);

  const code = body.RESULT?.CODE ?? "";
  if (code && code !== "INFO-000") {
    throw new Error(`[foodSafety] ${serviceId} ${code} ${body.RESULT?.MSG ?? ""}`);
  }

  const total = typeof body.total_count === "string"
    ? parseInt(body.total_count, 10) || 0
    : body.total_count ?? 0;
  return { total, rows: body.row ?? [] };
}

// ── 편의 함수 ──
// 현재 키는 I0490 만 승인됨. 나머지 서비스는 승인되면 그 때 필터 키 확인 후 사용.

/** 업소명(BSSH_NM) 으로 I0490 조회. 실제 응답은 부적합 회수 제품 데이터. */
export function searchHygieneByBizName(name: string, end = 10) {
  return fetchFoodSafety<HygieneRow>(FOODSAFETY_SERVICE.HYGIENE_GRADE, {
    end,
    conditions: { BSSH_NM: name },
  });
}

/** 제품명(PRDTNM) 으로 I0490 조회. 부적합 회수 목록. */
export function searchRecallByProduct(name: string, end = 10) {
  return fetchFoodSafety<RecallRow>(FOODSAFETY_SERVICE.HYGIENE_GRADE, {
    end,
    conditions: { PRDTNM: name },
  });
}

/** I2790 (키 승인 필요). */
export function searchNutritionByFood(name: string, end = 10) {
  return fetchFoodSafety<NutritionRow>(FOODSAFETY_SERVICE.NUTRITION, {
    end,
    conditions: { DESC_KOR: name },
  });
}

/** COOKRCP01 (키 승인 필요). */
export function searchRecipeByName(name: string, end = 10) {
  return fetchFoodSafety<RecipeRow>(FOODSAFETY_SERVICE.RECIPE, {
    end,
    conditions: { RCP_NM: name },
  });
}

/** I1250 (키 승인 필요). */
export function searchHealthFuncByName(name: string, end = 10) {
  return fetchFoodSafety<HealthFuncRow>(FOODSAFETY_SERVICE.HEALTH_FUNC, {
    end,
    conditions: { PRDUCT_NM: name },
  });
}
