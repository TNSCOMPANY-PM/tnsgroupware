/**
 * 소상공인시장진흥공단_상가(상권)정보
 * 호출 한도: 일 10,000건 (공공데이터포털 기준)
 * 기준문서: https://www.data.go.kr/data/15083033
 */

import type { SbizStore } from "@/types/publicApi";

const BASE = "https://apis.data.go.kr/B553077/api/open/sdsc2";

function getKey(): string | null {
  return process.env.SBIZ_API_KEY ?? process.env.FTC_DATAPORTAL_KEY ?? null;
}

type SbizResponse = {
  header?: { resultCode?: string; resultMsg?: string };
  body?: {
    items?: Record<string, string | number>[];
    totalCount?: number;
    numOfRows?: number;
    pageNo?: number;
  };
};

async function fetchSbizJson(op: string, params: Record<string, string>): Promise<Record<string, string | number>[]> {
  const key = getKey();
  if (!key) {
    if (process.env.NODE_ENV !== "production") {
      console.warn(`[sbizApi] SBIZ_API_KEY 미설정 (${op})`);
    }
    return [];
  }
  try {
    const qs = new URLSearchParams({
      serviceKey: key,
      type: "json",
      ...params,
    });
    const r = await fetch(`${BASE}/${op}?${qs.toString()}`, {
      cache: "no-store",
      headers: { "User-Agent": "Mozilla/5.0" },
    });
    if (!r.ok) return [];
    const data = (await r.json()) as SbizResponse;
    const code = data.header?.resultCode;
    if (code && code !== "00") return [];
    const items = data.body?.items;
    return Array.isArray(items) ? items : [];
  } catch {
    return [];
  }
}

function toStoreFromSbiz(r: Record<string, string | number>): SbizStore {
  const s = (v: string | number | undefined) => (v === undefined || v === null ? "" : String(v));
  return {
    storeId: s(r.bizesId),
    storeName: s(r.bizesNm),
    branchName: s(r.brchNm),
    indutyLclasNm: s(r.indsLclsNm),
    indutyMlsfcNm: s(r.indsMclsNm),
    indutySclasNm: s(r.indsSclsNm),
    standardIndustryCode: s(r.ksicCd),
    ctprvnNm: s(r.ctprvnNm),
    signguNm: s(r.signguNm),
    adongNm: s(r.adongNm),
    lnoAddr: s(r.lnoAdr),
    rdnmAddr: s(r.rdnmAdr),
    lon: s(r.lon),
    lat: s(r.lat),
    bizesNo: undefined,
  };
}

const CTPRVN_CD: Record<string, string> = {
  "서울특별시": "11", "서울": "11",
  "부산광역시": "21", "부산": "21",
  "대구광역시": "22", "대구": "22",
  "인천광역시": "23", "인천": "23",
  "광주광역시": "24", "광주": "24",
  "대전광역시": "25", "대전": "25",
  "울산광역시": "26", "울산": "26",
  "세종특별자치시": "29", "세종": "29",
  "경기도": "31", "경기": "31",
  "강원특별자치도": "32", "강원도": "32", "강원": "32",
  "충청북도": "33", "충북": "33",
  "충청남도": "34", "충남": "34",
  "전북특별자치도": "35", "전라북도": "35", "전북": "35",
  "전라남도": "36", "전남": "36",
  "경상북도": "37", "경북": "37",
  "경상남도": "38", "경남": "38",
  "제주특별자치도": "39", "제주": "39",
};

const REGION_SIGNGU_CODES: Record<string, string[]> = {
  "11": ["11110", "11140", "11170", "11200", "11215", "11230", "11260", "11290", "11305", "11320", "11350", "11380", "11410", "11440", "11470", "11500", "11530", "11545", "11560", "11590", "11620", "11650", "11680", "11710", "11740"],
  "21": ["21110", "21140", "21170", "21200", "21230", "21260", "21290", "21305", "21320", "21350", "21380", "21410", "21440", "21470", "21500", "21530"],
  "22": ["22110", "22140", "22170", "22200", "22230", "22260", "22290", "22320", "22710"],
  "23": ["23110", "23140", "23170", "23200", "23230", "23260", "23290", "23320", "23710", "23720"],
  "24": ["24110", "24140", "24170", "24200", "24230"],
  "25": ["25110", "25140", "25170", "25200", "25230"],
  "26": ["26110", "26140", "26170", "26200", "26230"],
  "29": ["29010"],
};

export function regionToCtprvnCd(region: string): string | null {
  return CTPRVN_CD[region] ?? null;
}

const INDUSTRY_TO_SBIZ_CODE: Record<string, string[]> = {
  "치킨": ["I2"],
  "카페": ["I2"],
  "피자": ["I2"],
  "한식": ["I2"],
  "분식": ["I2"],
  "주점": ["I2"],
  "편의점": ["G2"],
};

const INDUSTRY_TO_SBIZ_SCLS: Record<string, string[]> = {
  "치킨": ["치킨"],
  "카페": ["카페"],
  "피자": ["피자"],
  "한식": ["백반", "한정식", "국수", "찌개", "갈비", "구이", "고기"],
  "분식": ["분식", "김밥", "만두", "국수", "칼국수"],
  "주점": ["주점", "호프", "맥주", "소주"],
  "편의점": ["편의점"],
};

export function industryToSbizLclsCd(industry: string): string | null {
  const list = INDUSTRY_TO_SBIZ_CODE[industry];
  return list ? list[0] : null;
}

export async function fetchStoresByRegion(opts: {
  ctprvnCd?: string;
  signguCd?: string;
  indsLclsCd?: string;
  indsMclsCd?: string;
  numOfRows?: number;
  industryName?: string;
  maxSigngu?: number;
}): Promise<SbizStore[]> {
  const results: SbizStore[] = [];
  const numOfRows = opts.numOfRows ?? 1000;
  const signguList = opts.signguCd
    ? [opts.signguCd]
    : (opts.ctprvnCd ? REGION_SIGNGU_CODES[opts.ctprvnCd] ?? [] : []);
  const limit = opts.maxSigngu ?? signguList.length;

  const sclsKeywords = opts.industryName ? INDUSTRY_TO_SBIZ_SCLS[opts.industryName] ?? [] : [];

  for (const signgu of signguList.slice(0, limit)) {
    for (let pageNo = 1; pageNo <= 3; pageNo++) {
      const items = await fetchSbizJson("storeListInDong", {
        divId: "signguCd",
        key: signgu,
        pageNo: String(pageNo),
        numOfRows: String(numOfRows),
        ...(opts.indsLclsCd ? { indsLclsCd: opts.indsLclsCd } : {}),
        ...(opts.indsMclsCd ? { indsMclsCd: opts.indsMclsCd } : {}),
      });
      if (items.length === 0) break;
      for (const r of items) {
        const scls = String(r.indsSclsNm ?? "");
        if (sclsKeywords.length > 0 && !sclsKeywords.some(k => scls.includes(k))) continue;
        results.push(toStoreFromSbiz(r));
      }
      if (items.length < numOfRows) break;
    }
  }
  return results;
}

export async function aggregateByDong(stores: SbizStore[]): Promise<Map<string, SbizStore[]>> {
  const map = new Map<string, SbizStore[]>();
  for (const s of stores) {
    const key = s.adongNm || s.signguNm || "기타";
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(s);
  }
  return map;
}
