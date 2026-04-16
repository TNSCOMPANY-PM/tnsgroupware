/**
 * 공공데이터포털 apis.data.go.kr 경유 공정위 가맹정보 API 래퍼.
 * 인증키: FTC_DATAPORTAL_KEY (64자 hex).
 *
 * 커버리지:
 *   - 브랜드별 가맹점 현황       (11,167건 / 年, 전체 브랜드 커버)
 *   - 업종별 창업비용 (음식료/소매/서비스 3업종)
 *   - 지역별 업종별 평균매출 (음식료/소매/서비스)
 *   - 지역별 업종별 가맹점수
 *   - 통신판매사업자 등록현황
 */

const BASE = "https://apis.data.go.kr/1130000";

function getKey(): string {
  const k = process.env.FTC_DATAPORTAL_KEY;
  if (!k) throw new Error("[ftcDataPortal] FTC_DATAPORTAL_KEY 미설정");
  return k;
}

async function fetchXml(url: string): Promise<string> {
  const r = await fetch(url, { cache: "no-store", headers: { "User-Agent": "Mozilla/5.0" } });
  if (!r.ok) throw new Error(`[ftcDataPortal] HTTP ${r.status} ${url}`);
  const text = await r.text();
  if (text.includes("<errorCn>") || text.includes("<resultCode>11<") || text.includes("<resultCode>10<")) {
    const err = text.match(/<(?:errorCn|resultMsg)>([^<]+)<\/(?:errorCn|resultMsg)>/)?.[1] ?? text.slice(0, 200);
    throw new Error(`[ftcDataPortal] API Error: ${err}`);
  }
  return text;
}

function parseItems(xml: string): Record<string, string>[] {
  const items: Record<string, string>[] = [];
  const blockRe = /<item>([\s\S]*?)<\/item>/g;
  let m: RegExpExecArray | null;
  while ((m = blockRe.exec(xml)) !== null) {
    const rec: Record<string, string> = {};
    const fieldRe = /<([a-zA-Z0-9_]+)>([\s\S]*?)<\/\1>/g;
    let f: RegExpExecArray | null;
    while ((f = fieldRe.exec(m[1])) !== null) {
      rec[f[1]] = f[2].replace(/<!\[CDATA\[|\]\]>/g, "").trim();
    }
    items.push(rec);
  }
  return items;
}

async function fetchAllPages(
  baseUrl: string,
  params: Record<string, string>,
  numOfRows = 1000,
): Promise<Record<string, string>[]> {
  const all: Record<string, string>[] = [];
  for (let pageNo = 1; pageNo <= 50; pageNo++) {
    const qs = new URLSearchParams({
      serviceKey: getKey(),
      pageNo: String(pageNo),
      numOfRows: String(numOfRows),
      resultType: "xml",
      ...params,
    });
    const xml = await fetchXml(`${baseUrl}?${qs.toString()}`);
    const items = parseItems(xml);
    all.push(...items);
    if (items.length < numOfRows) break;
  }
  return all;
}

// ───────────────────────────────────────────────
// 1. 브랜드별 가맹점 현황
//    필드: yr, indutyLclasNm, indutyMlsfcNm, corpNm, brandNm,
//          frcsCnt(가맹점수), newFrcsRgsCnt(신규등록), ctrtEndCnt(계약종료),
//          ctrtCncltnCnt(계약해지), nmChgCnt(명의변경),
//          avrgSlsAmt(평균매출, 천원), arUnitAvrgSlsAmt(면적단위평균매출, 천원)
// ───────────────────────────────────────────────
export type BrandFrcsStat = {
  yr: string;
  indutyLclasNm: string;
  indutyMlsfcNm: string;
  corpNm: string;
  brandNm: string;
  frcsCnt: number;
  newFrcsRgsCnt: number;
  ctrtEndCnt: number;
  ctrtCncltnCnt: number;
  nmChgCnt: number;
  avrgSlsAmt: number;      // 천원 단위
  arUnitAvrgSlsAmt: number; // 천원/㎡
};

function toNum(s: string | undefined): number {
  if (!s) return 0;
  const n = Number(s.replace(/,/g, ""));
  return isNaN(n) ? 0 : n;
}

export async function fetchBrandFrcsStats(yr: string): Promise<BrandFrcsStat[]> {
  const raw = await fetchAllPages(
    `${BASE}/FftcBrandFrcsStatsService/getBrandFrcsStats`,
    { yr },
  );
  return raw.map(r => ({
    yr: r.yr ?? yr,
    indutyLclasNm: r.indutyLclasNm ?? "",
    indutyMlsfcNm: r.indutyMlsfcNm ?? "",
    corpNm: r.corpNm ?? "",
    brandNm: r.brandNm ?? "",
    frcsCnt: toNum(r.frcsCnt),
    newFrcsRgsCnt: toNum(r.newFrcsRgsCnt),
    ctrtEndCnt: toNum(r.ctrtEndCnt),
    ctrtCncltnCnt: toNum(r.ctrtCncltnCnt),
    nmChgCnt: toNum(r.nmChgCnt),
    avrgSlsAmt: toNum(r.avrgSlsAmt),
    arUnitAvrgSlsAmt: toNum(r.arUnitAvrgSlsAmt),
  }));
}

/** 브랜드명 또는 법인명으로 매칭. 최신 연도 우선. */
export async function findBrandFrcsStat(opts: {
  brandName?: string;
  corpName?: string;
}): Promise<BrandFrcsStat | null> {
  const norm = (s: string) =>
    s.replace(/\s+/g, "").replace(/[()（）㈜]/g, "").replace(/^주식회사|^\(주\)/, "").toLowerCase();
  const bTarget = opts.brandName ? norm(opts.brandName) : null;
  const cTarget = opts.corpName ? norm(opts.corpName) : null;

  for (const yr of ["2024", "2023", "2022"]) {
    const all = await fetchBrandFrcsStats(yr);
    const match = all.find(x => {
      const b = norm(x.brandNm);
      const c = norm(x.corpNm);
      if (bTarget && (b === bTarget || b.includes(bTarget) || bTarget.includes(b))) return true;
      if (cTarget && (c === cTarget || c.includes(cTarget))) return true;
      return false;
    });
    if (match && (match.frcsCnt > 0 || match.avrgSlsAmt > 0)) return match;
    // 수치 0이어도 마지막 fallback 용으로 저장
    if (match && !opts.brandName) return match;
  }
  // 마지막 시도: 수치 0 이어도 매칭되면 반환
  for (const yr of ["2024", "2023"]) {
    const all = await fetchBrandFrcsStats(yr);
    const match = all.find(x => {
      const b = norm(x.brandNm);
      const c = norm(x.corpNm);
      return (bTarget && b.includes(bTarget)) || (cTarget && c.includes(cTarget));
    });
    if (match) return match;
  }
  return null;
}

// ───────────────────────────────────────────────
// 2. 업종별 창업비용 현황 (3개 업종 op 별도)
//    필드: yr, indutyMlsfcNm, 가맹금(jnggmAmt), 교육비(edcCostAmt),
//          보증금(grntyAmt), 기타비용(etcCostAmt), 인테리어비(intrCostAmt) 등
// ───────────────────────────────────────────────
export type IndutyLclas = "외식" | "도소매" | "서비스";

const INDUTY_OP_MAP: Record<IndutyLclas, string> = {
  "외식": "getSclaIndutyFntnOutStats",
  "도소매": "getSclaIndutyFntnWhrtStats",
  "서비스": "getSclaIndutyFntnSrvcStats",
};

export async function fetchIndutyStrtupCost(
  yr: string,
  lclas: IndutyLclas,
): Promise<Record<string, string>[]> {
  return fetchAllPages(
    `${BASE}/FftcSclasIndutyFntnStatsService/${INDUTY_OP_MAP[lclas]}`,
    { yr },
  );
}

// ───────────────────────────────────────────────
// 3. 지역별 업종별 평균매출
// ───────────────────────────────────────────────
const AREA_AVRG_OP_MAP: Record<IndutyLclas, string> = {
  "외식": "getAreaIndutyAvrOutStats",
  "도소매": "getAreaIndutyAvrWhrtStats",
  "서비스": "getAreaIndutyAvrSrvcStats",
};

export async function fetchAreaIndutyAvr(
  yr: string,
  lclas: IndutyLclas,
): Promise<Record<string, string>[]> {
  return fetchAllPages(
    `${BASE}/FftcAreaIndutyAvrStatsService/${AREA_AVRG_OP_MAP[lclas]}`,
    { yr },
  );
}

// ───────────────────────────────────────────────
// 4. 지역별 업종별 가맹점수
// ───────────────────────────────────────────────
export async function fetchAreaIndutyFrcsCount(
  jngBizCrtraYr: string,
): Promise<Record<string, string>[]> {
  return fetchAllPages(
    `${BASE}/FftcindutyfrcscntstatService/getindutyfrcscntstats`,
    { jngBizCrtraYr },
  );
}

// ───────────────────────────────────────────────
// 공통: graceful fetch 래퍼 (실패 시 빈 배열)
// ───────────────────────────────────────────────
async function fetchPortal(
  servicePath: string,
  params: Record<string, string>,
): Promise<Record<string, string>[]> {
  try {
    return await fetchAllPages(`${BASE}/${servicePath}`, params);
  } catch (e) {
    console.warn(`[ftcDataPortal] ${servicePath} 실패:`, e instanceof Error ? e.message : e);
    return [];
  }
}

// ───────────────────────────────────────────────
// 5. 업종별 개폐업률
//    FftcIndutyFrcsOpclStatsService
// ───────────────────────────────────────────────
export type IndutyOpenCloseRate = {
  industry: string;
  totalStores: number;
  openRate: number;
  closeRate: number;
};

const OPCL_OP_MAP: Record<IndutyLclas, string> = {
  "외식": "getIndutyFrcsOpclOutStats",
  "도소매": "getIndutyFrcsOpclWhrtStats",
  "서비스": "getIndutyFrcsOpclSrvcStats",
};

export async function fetchIndutyOpenCloseRate(
  yr: string,
  lclas: IndutyLclas,
): Promise<IndutyOpenCloseRate[]> {
  const raw = await fetchPortal(
    `FftcIndutyFrcsOpclStatsService/${OPCL_OP_MAP[lclas]}`,
    { yr },
  );
  return raw.map(r => ({
    industry: r.indutyLclasNm ?? r.indutyMlsfcNm ?? "",
    totalStores: toNum(r.frcsCnt),
    openRate: toNum(r.opnRate),
    closeRate: toNum(r.clsRate),
  }));
}

// ───────────────────────────────────────────────
// 6. 업종별 가맹점 증감 현황
//    FftcindutyfrcsflctnstatService
// ───────────────────────────────────────────────
export type IndutyFrcsFluctuation = {
  industry: string;
  stores: number;
  avgNew: number;
  avgEnd: number;
};

export async function fetchIndutyFrcsFluctuation(
  yr: string,
): Promise<IndutyFrcsFluctuation[]> {
  const raw = await fetchPortal(
    "FftcindutyfrcsflctnstatService/getindutyfrcsflctnstats",
    { yr },
  );
  return raw.map(r => ({
    industry: r.indutyLclasNm ?? "",
    stores: toNum(r.frcsCnt),
    avgNew: toNum(r.avrgNewOpbizCnt),
    avgEnd: toNum(r.avrgCtrtEndCnt),
  }));
}

// ───────────────────────────────────────────────
// 7. 브랜드별 직영/가맹 비율
//    FftcBrandIndutyDropFrcsStatsService
// ───────────────────────────────────────────────
export type BrandDirectFrcsRatio = {
  brand: string;
  industry: string;
  franchiseCount: number;
  directCount: number;
  directRatio: number;
};

export async function fetchBrandDirectFrcsRatio(
  yr: string,
): Promise<BrandDirectFrcsRatio[]> {
  const raw = await fetchPortal(
    "FftcBrandIndutyDropFrcsStatsService/getBrandIndutyFrcsStats",
    { yr },
  );
  return raw.map(r => ({
    brand: r.brandNm ?? "",
    industry: r.indutyLclasNm ?? "",
    franchiseCount: toNum(r.frcsSeBrandCnt),
    directCount: toNum(r.droperSeBrandCnt),
    directRatio: toNum(r.brandRt),
  }));
}

// ───────────────────────────────────────────────
// 8. 업종별 현황 개요
//    FftcIndutyStusStatsService
// ───────────────────────────────────────────────
export type IndutyOverview = {
  industry: string;
  stores: number;
  brands: number;
  terminated: number;
  cancelled: number;
};

export async function fetchIndutyOverview(
  yr: string,
): Promise<IndutyOverview[]> {
  const raw = await fetchPortal(
    "FftcIndutyStusStatsService/getIndutyStus",
    { yr },
  );
  return raw.map(r => ({
    industry: r.indutyLclasNm ?? "",
    stores: toNum(r.frcsCnt),
    brands: toNum(r.brandCnt),
    terminated: toNum(r.ctrtEndCnt),
    cancelled: toNum(r.ctrtCncltnCnt),
  }));
}

// ───────────────────────────────────────────────
// 9. 업종별 창업비용 랭킹
//    FftcIndutyAvrRankStatsService
// ───────────────────────────────────────────────
export type IndutyStartupCostRank = {
  brand: string;
  franchiseFee: number;
  eduFee: number;
  etcFee: number;
  totalCost: number;
};

const RANK_OP_MAP: Record<IndutyLclas, string> = {
  "외식": "getIndutyAvrOutRankStats",
  "도소매": "getIndutyAvrWhrtRankStats",
  "서비스": "getIndutyAvrSrvcRankStats",
};

export async function fetchIndutyStartupCostRank(
  yr: string,
  lclas: IndutyLclas,
): Promise<IndutyStartupCostRank[]> {
  const raw = await fetchPortal(
    `FftcIndutyAvrRankStatsService/${RANK_OP_MAP[lclas]}`,
    { yr },
  );
  return raw.map(r => ({
    brand: r.brandNm ?? "",
    franchiseFee: toNum(r.jngAmt),
    eduFee: toNum(r.eduAmt),
    etcFee: toNum(r.etcAmt),
    totalCost: toNum(r.smtnAmt),
  }));
}

// ───────────────────────────────────────────────
// 10. 브랜드별 경영 개요 (가맹본부 경영컨설팅 정보)
//     FftcbrandmngmtcnsutinfoService
// ───────────────────────────────────────────────
export type BrandOverviewStat = {
  yr: string;
  brandNm: string;
  corpNm: string;
  indutyLclasNm: string;
  frcsCnt: number;
  avrgSlsAmt: number;
};

export async function fetchBrandOverviewStats(
  yr: string,
): Promise<BrandOverviewStat[]> {
  const raw = await fetchPortal(
    "FftcbrandmngmtcnsutinfoService/getbrandMngmtCnsutinfo",
    { yr },
  );
  return raw.map(r => ({
    yr: r.yr ?? yr,
    brandNm: r.brandNm ?? "",
    corpNm: r.corpNm ?? "",
    indutyLclasNm: r.indutyLclasNm ?? "",
    frcsCnt: toNum(r.frcsCnt),
    avrgSlsAmt: toNum(r.avrgSlsAmt),
  }));
}

// ───────────────────────────────────────────────
// 11. 신규등록 브랜드 목록
//     FftcnewbrandinfoService (data.go.kr 15109808 계열)
// ───────────────────────────────────────────────
export type NewBrandEntry = {
  brand: string;
  corp: string;
  startDate: string;
};

export async function fetchNewBrandList(
  yr: string,
): Promise<NewBrandEntry[]> {
  const raw = await fetchPortal(
    "FftcnewbrandinfoService/getnewbrandinfo",
    { yr },
  );
  return raw.map(r => ({
    brand: r.brandNm ?? "",
    corp: r.corpNm ?? "",
    startDate: r.jngBizStrtDate ?? r.jngBizStrtDe ?? "",
  }));
}

// ───────────────────────────────────────────────
// 12. 가맹본부 법인·개인 비율
//     FftcjnghdqrtrsCorpStatsService (data.go.kr 가맹본부 법인형태 통계)
// ───────────────────────────────────────────────
export type CorpTypeRatio = {
  corpCount: number;
  personalCount: number;
  corpRatio: number;
};

export async function fetchCorpTypeRatio(
  yr: string,
): Promise<CorpTypeRatio> {
  const raw = await fetchPortal(
    "FftcjnghdqrtrsCorpStatsService/getjnghdqrtrsCorpStats",
    { yr },
  );
  let corpCount = 0;
  let personalCount = 0;
  for (const r of raw) {
    const type = (r.corpSeNm ?? r.corpSe ?? "").trim();
    const cnt = toNum(r.cnt ?? r.jnghdqrtrsCnt);
    if (/법인/.test(type)) corpCount += cnt;
    else if (/개인/.test(type)) personalCount += cnt;
  }
  const total = corpCount + personalCount;
  return {
    corpCount,
    personalCount,
    corpRatio: total > 0 ? Math.round((corpCount / total) * 1000) / 10 : 0,
  };
}

// ───────────────────────────────────────────────
// 13. 외국인 가맹본부 현황
//     FftcjnghdqrtrsfrntngnlinfoService
// ───────────────────────────────────────────────
export type ForeignFranchisor = {
  name: string;
  address: string;
  brandCount: number;
};

export async function fetchForeignFranchisor(
  yr: string,
): Promise<ForeignFranchisor[]> {
  const raw = await fetchPortal(
    "FftcjnghdqrtrsfrntngnlinfoService/getjnghdqrtrsFrntnGnlinfo",
    { yr },
  );
  return raw.map(r => ({
    name: r.jngInstNm ?? r.jnghdqrtrsNm ?? "",
    address: r.lctnAddr ?? r.addr ?? "",
    brandCount: toNum(r.brandCnt),
  }));
}

// ───────────────────────────────────────────────
// 14. 대규모기업집단 소속 가맹본부
//     typeOfBusinessCompSttusListApi (data.go.kr 대규모기업집단)
// ───────────────────────────────────────────────
export type ConglomerateEntry = {
  groupName: string;
  companyName: string;
  industry: string;
};

export async function fetchConglomerateList(
  yr: string,
): Promise<ConglomerateEntry[]> {
  const raw = await fetchPortal(
    "typeOfBusinessCompSttusListApi/typeOfBusinessCompSttusList",
    { yr },
  );
  return raw.map(r => ({
    groupName: r.unityGrupNm ?? "",
    companyName: r.entrprsNm ?? "",
    industry: r.indutyNm ?? "",
  }));
}

// ───────────────────────────────────────────────
// 15. 대규모기업집단 소속회사 재무현황
//     TODO: data.go.kr 정확한 서비스 ID/엔드포인트 확인 필요.
//     현재 FftcCompFinncStatsService/getCompFinncStats 로 시도.
// ───────────────────────────────────────────────
export type ConglomerateFinancial = {
  company: string;
  assets: number;
  revenue: number;
  netIncome: number;
};

export async function fetchConglomerateFinancials(
  yr: string,
): Promise<ConglomerateFinancial[]> {
  const raw = await fetchPortal(
    "FftcCompFinncStatsService/getCompFinncStats",
    { yr },
  );
  return raw.map(r => ({
    company: r.entrprsNm ?? r.corpNm ?? "",
    assets: toNum(r.assetAmt ?? r.totalAsset),
    revenue: toNum(r.slsAmt ?? r.totalRevenue),
    netIncome: toNum(r.thstrfpAmt ?? r.netIncome),
  }));
}

// ───────────────────────────────────────────────
// 16. 통신판매사업자 등록현황
//     MllBs_2Service
// ───────────────────────────────────────────────
export type TelecomSeller = {
  name: string;
  bizNo: string;
  status: string;
};

export async function fetchTelecomSellerList(): Promise<TelecomSeller[]> {
  const raw = await fetchPortal(
    "MllBs_2Service/getMllBs",
    {},
  );
  return raw.map(r => ({
    name: r.bzmnNm ?? "",
    bizNo: r.brno ?? "",
    status: r.operSttusCdNm ?? "",
  }));
}
