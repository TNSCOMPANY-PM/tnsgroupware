/**
 * KOSIS (통계청) 공유서비스 OpenAPI 래퍼.
 * 인증키: KOSIS_API_KEY.
 *
 * 엔드포인트:
 *   - statisticsList.do                     : 통계목록 검색
 *   - Param/statisticsParameterData.do      : 통계자료 조회 (파라미터 기반)
 *   - statisticsData.do                     : userStatsId 기반 조회 (사전 등록된 사용자 통계)
 *   - Param/statisticsParameterList.do      : 통계표 파라미터(분류 코드) 조회
 *
 * 공통 파라미터: method=getList, apiKey, format=json, jsonVD=Y.
 */

const BASE = "https://kosis.kr/openapi";

function getKey(): string {
  const k = process.env.KOSIS_API_KEY;
  if (!k) throw new Error("[kosis] KOSIS_API_KEY 미설정");
  return k;
}

type KosisError = { err?: string; errMsg?: string };

export type KosisListItem = {
  LIST_ID?: string;
  LIST_NM?: string;
  VW_CD?: string;
  PARENT_LIST_ID?: string;
  TBL_ID?: string;
  TBL_NM?: string;
  ORG_ID?: string;
  STAT_NAME?: string;
  PRD_SE?: string;
  START_PRD_DE?: string;
  END_PRD_DE?: string;
};

export type KosisStatItem = {
  TBL_ID: string;
  STAT_NAME: string;
  TBL_NM?: string;
  C1?: string;
  C1_NM?: string;
  C2?: string;
  C2_NM?: string;
  C3?: string;
  C3_NM?: string;
  ITM_ID?: string;
  ITM_NM?: string;
  UNIT_NM?: string;
  DT: string;
  PRD_DE: string;
  PRD_SE?: string;
};

export type KosisParameterItem = {
  TBL_ID: string;
  OBJ_ID?: string;
  OBJ_NM?: string;
  OBJ_TY_CD?: string;
  ITM_ID?: string;
  ITM_NM?: string;
  PRD_SE?: string;
  LV?: string;
  UP_OBJ_ID?: string;
};

async function callJson<T>(path: string, params: Record<string, string>): Promise<T[]> {
  const qs = new URLSearchParams({
    method: "getList",
    apiKey: getKey(),
    format: "json",
    jsonVD: "Y",
    ...params,
  });
  const url = `${BASE}/${path}?${qs.toString()}`;
  const res = await fetch(url, {
    cache: "no-store",
    headers: { "User-Agent": "Mozilla/5.0" },
  });
  if (!res.ok) throw new Error(`[kosis] HTTP ${res.status} ${path}`);

  const text = await res.text();
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error(`[kosis] JSON 파싱 실패 ${path}: ${text.slice(0, 200)}`);
  }

  if (!Array.isArray(parsed)) {
    const obj = parsed as KosisError;
    if (obj?.err) throw new Error(`[kosis] API Error ${obj.err}: ${obj.errMsg ?? "unknown"}`);
    return [];
  }

  if (parsed.length > 0) {
    const first = parsed[0] as KosisError;
    if (first?.err) throw new Error(`[kosis] API Error ${first.err}: ${first.errMsg ?? "unknown"}`);
  }

  return parsed as T[];
}

export type StatisticsListParams = {
  vwCd?: string;         // 화면분류코드 (MT_ZTITLE=통계표, MT_OTITLE=주제별 등)
  parentListId?: string; // 상위 목록 ID
  listId?: string;       // 특정 목록 ID 직접 지정
};

export async function fetchStatisticsList(params: StatisticsListParams): Promise<KosisListItem[]> {
  const p: Record<string, string> = {};
  if (params.vwCd) p.vwCd = params.vwCd;
  if (params.parentListId) p.parentListId = params.parentListId;
  if (params.listId) p.listId = params.listId;
  return callJson<KosisListItem>("statisticsList.do", p);
}

export type StatisticsDataParams = {
  orgId: string;         // 기관코드 (통계청=101)
  tblId: string;         // 통계표 ID
  prdSe?: string;        // 주기 (M/Q/Y/IY)
  startPrdDe?: string;   // 시작 시점 (YYYYMM 또는 YYYY)
  endPrdDe?: string;     // 종료 시점
  newEstPrdCnt?: number; // 최신 N개 주기 조회
  objL1?: string;
  objL2?: string;
  objL3?: string;
  objL4?: string;
  objL5?: string;
  objL6?: string;
  objL7?: string;
  objL8?: string;
  itmId?: string;
  userStatsId?: string;  // 사용자 통계자료 ID 로 직접 호출
};

export async function fetchStatisticsData(params: StatisticsDataParams): Promise<KosisStatItem[]> {
  // userStatsId 경로는 statisticsData.do, 파라미터 기반은 Param/statisticsParameterData.do
  if (params.userStatsId) {
    return callJson<KosisStatItem>("statisticsData.do", { userStatsId: params.userStatsId });
  }
  const p: Record<string, string> = {
    orgId: params.orgId,
    tblId: params.tblId,
  };
  if (params.prdSe) p.prdSe = params.prdSe;
  if (params.startPrdDe) p.startPrdDe = params.startPrdDe;
  if (params.endPrdDe) p.endPrdDe = params.endPrdDe;
  if (params.newEstPrdCnt) p.newEstPrdCnt = String(params.newEstPrdCnt);
  for (const k of ["objL1","objL2","objL3","objL4","objL5","objL6","objL7","objL8"] as const) {
    p[k] = params[k] ?? "";
  }
  p.itmId = params.itmId ?? "";
  return callJson<KosisStatItem>("Param/statisticsParameterData.do", p);
}

export type ParameterListParams = {
  orgId: string;
  tblId: string;
};

export async function fetchParameterList(params: ParameterListParams): Promise<KosisParameterItem[]> {
  return callJson<KosisParameterItem>("Param/statisticsParameterList.do", {
    orgId: params.orgId,
    tblId: params.tblId,
  });
}

export type KosisIndustryAvg = {
  industry_code: string;
  industry_name: string;
  avg_revenue_monthly?: number;
  growth_rate_yoy?: number;
  source_period: string;
};

// 통계청 서비스업동향조사 — 대분류 서비스업 지수·성장률 (orgId=101, tblId 예시).
// 브랜드의 업종 코드(KSIC 대분류)에 따라 objL1 을 매핑한다.
// 참고: KSIC 음식점업(I56) → 서비스업조사 C1=A (서비스업 전체) 또는 특정 업종코드.
const INDUSTRY_TBL = "DT_1KI1009";   // 서비스업생산지수(불변지수) 월별
const INDUSTRY_ORG = "101";

/**
 * 간이 버전: 업종분류 키워드 → KOSIS 서비스업 코드 매핑.
 * 더 정밀한 매핑은 parameterList.do 로 대분류 계층을 조회해 확장.
 */
const KSIC_MAP: Record<string, { code: string; name: string }> = {
  "음식점업": { code: "I56", name: "음식점 및 주점업" },
  "음식점": { code: "I56", name: "음식점 및 주점업" },
  "프랜차이즈": { code: "I56", name: "음식점 및 주점업" },
  "김밥": { code: "I56", name: "음식점 및 주점업" },
  "분식": { code: "I56", name: "음식점 및 주점업" },
  "카페": { code: "I56", name: "음식점 및 주점업" },
  "치킨": { code: "I56", name: "음식점 및 주점업" },
  "주점": { code: "I56", name: "음식점 및 주점업" },
  "소매": { code: "G47", name: "소매업; 자동차 제외" },
  "편의점": { code: "G47", name: "소매업; 자동차 제외" },
};

export function mapIndustryCode(industryText: string | null | undefined): { code: string; name: string } | null {
  if (!industryText) return null;
  const t = industryText.trim();
  for (const key of Object.keys(KSIC_MAP)) {
    if (t.includes(key)) return KSIC_MAP[key];
  }
  return null;
}

/**
 * 월별 지표 조회. 트렌드 리포트용. 실패 시 graceful fallback.
 */
export async function fetchKosisMonthly(input: {
  orgId: string;
  tblId: string;
  ym: string;
}): Promise<{ raw: unknown; summary: string }> {
  const ymCompact = input.ym.replace("-", "");
  try {
    const rows = await fetchStatisticsData({
      orgId: input.orgId,
      tblId: input.tblId,
      prdSe: "M",
      startPrdDe: ymCompact,
      endPrdDe: ymCompact,
    });
    if (!rows.length) return { raw: null, summary: "KOSIS 데이터 없음" };

    const lines = rows.slice(0, 5).map(r => {
      const label = [r.C1_NM, r.C2_NM, r.ITM_NM].filter(Boolean).join(" / ");
      const unit = r.UNIT_NM ? ` ${r.UNIT_NM}` : "";
      return `- ${label}: ${r.DT}${unit} (${r.PRD_DE})`;
    });
    return { raw: rows, summary: lines.join("\n") };
  } catch (e) {
    console.warn("[kosis] fetchKosisMonthly 실패:", e instanceof Error ? e.message : e);
    return { raw: null, summary: "KOSIS 데이터 없음" };
  }
}

export async function fetchKosisIndustryAvg(
  industryText: string,
): Promise<KosisIndustryAvg | null> {
  const mapped = mapIndustryCode(industryText);
  if (!mapped) return null;

  try {
    const rows = await fetchStatisticsData({
      orgId: INDUSTRY_ORG,
      tblId: INDUSTRY_TBL,
      prdSe: "M",
      newEstPrdCnt: 13,
    });
    if (rows.length === 0) return null;

    const sorted = [...rows].sort((a, b) => b.PRD_DE.localeCompare(a.PRD_DE));
    const latest = sorted[0];
    const yearAgo = sorted.find(r => {
      const y = parseInt(latest.PRD_DE.slice(0, 4), 10) - 1;
      return r.PRD_DE === `${y}${latest.PRD_DE.slice(4)}`;
    });

    const latestVal = parseFloat(latest.DT);
    const prevVal = yearAgo ? parseFloat(yearAgo.DT) : NaN;
    const growth = !isNaN(latestVal) && !isNaN(prevVal) && prevVal > 0
      ? Math.round(((latestVal - prevVal) / prevVal) * 1000) / 10
      : undefined;

    const period = `${latest.PRD_DE.slice(0, 4)}-${latest.PRD_DE.slice(4, 6)}`;

    return {
      industry_code: mapped.code,
      industry_name: mapped.name,
      growth_rate_yoy: growth,
      source_period: period,
    };
  } catch (e) {
    console.warn(`[kosis] fetchKosisIndustryAvg 실패 (${industryText}):`, e instanceof Error ? e.message : e);
    return null;
  }
}
