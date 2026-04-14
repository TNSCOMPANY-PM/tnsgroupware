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
