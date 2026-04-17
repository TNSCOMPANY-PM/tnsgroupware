/**
 * 한국관광공사 TourAPI 4.0 (국문 관광정보 서비스 - KorService2)
 * 호출 한도: 일 10,000건 (공공데이터포털 기준)
 * 기준문서: https://api.visitkorea.or.kr/#/useKoreaGuide
 */

import type { TourSpot, TourFestival } from "@/types/publicApi";

const BASE = "https://apis.data.go.kr/B551011/KorService2";
const MOBILE_OS = "ETC";
const MOBILE_APP = "frandoor";

type AreaCode =
  | "1" | "2" | "3" | "4" | "5" | "6" | "7" | "8"
  | "31" | "32" | "33" | "34" | "35" | "36" | "37" | "38" | "39";

const REGION_TO_AREA: Record<string, AreaCode> = {
  "서울특별시": "1", "서울": "1",
  "인천광역시": "2", "인천": "2",
  "대전광역시": "3", "대전": "3",
  "대구광역시": "4", "대구": "4",
  "광주광역시": "5", "광주": "5",
  "부산광역시": "6", "부산": "6",
  "울산광역시": "7", "울산": "7",
  "세종특별자치시": "8", "세종": "8",
  "경기도": "31", "경기": "31",
  "강원특별자치도": "32", "강원도": "32", "강원": "32",
  "충청북도": "33", "충북": "33",
  "충청남도": "34", "충남": "34",
  "경상북도": "35", "경북": "35",
  "경상남도": "36", "경남": "36",
  "전북특별자치도": "37", "전라북도": "37", "전북": "37",
  "전라남도": "38", "전남": "38",
  "제주특별자치도": "39", "제주도": "39", "제주": "39",
};

function getKey(): string | null {
  return process.env.TOUR_API_KEY ?? null;
}

function toAreaCode(region: string): AreaCode | null {
  return REGION_TO_AREA[region] ?? null;
}

type TourResponse<T> = {
  response?: {
    header?: { resultCode?: string; resultMsg?: string };
    body?: {
      items?: { item?: T[] | T } | string;
      numOfRows?: number;
      pageNo?: number;
      totalCount?: number;
    };
  };
};

async function fetchTour<T>(op: string, params: Record<string, string>): Promise<T[]> {
  const key = getKey();
  if (!key) {
    if (process.env.NODE_ENV !== "production") {
      console.warn(`[tourApi] TOUR_API_KEY 미설정 (${op})`);
    }
    return [];
  }
  try {
    const qs = new URLSearchParams({
      serviceKey: key,
      MobileOS: MOBILE_OS,
      MobileApp: MOBILE_APP,
      _type: "json",
      ...params,
    });
    const r = await fetch(`${BASE}/${op}?${qs.toString()}`, {
      cache: "no-store",
      headers: { "User-Agent": "Mozilla/5.0" },
    });
    if (!r.ok) return [];
    const data = (await r.json()) as TourResponse<T>;
    const items = data.response?.body?.items;
    if (!items || typeof items === "string") return [];
    const arr = items.item;
    if (!arr) return [];
    return Array.isArray(arr) ? arr : [arr];
  } catch {
    return [];
  }
}

export async function fetchAreaTourSpots(region: string, opts?: {
  contentTypeId?: string; numOfRows?: number;
}): Promise<TourSpot[]> {
  const areaCode = toAreaCode(region);
  if (!areaCode) return [];
  const raw = await fetchTour<Record<string, string>>("areaBasedList2", {
    areaCode,
    contentTypeId: opts?.contentTypeId ?? "12",
    numOfRows: String(opts?.numOfRows ?? 20),
    pageNo: "1",
    arrange: "P",
  });
  return raw.map(r => ({
    contentId: r.contentid ?? "",
    title: r.title ?? "",
    addr: (r.addr1 ?? "") + (r.addr2 ? " " + r.addr2 : ""),
    areaCode: r.areacode ?? "",
    sigunguCode: r.sigungucode ?? "",
    cat1: r.cat1 ?? "",
    cat2: r.cat2 ?? "",
    cat3: r.cat3 ?? "",
    firstImage: r.firstimage ?? "",
    mapX: r.mapx ?? "",
    mapY: r.mapy ?? "",
  }));
}

export async function fetchFestivals(region: string, opts: {
  startDate: string; endDate?: string; numOfRows?: number;
}): Promise<TourFestival[]> {
  const areaCode = toAreaCode(region);
  const params: Record<string, string> = {
    eventStartDate: opts.startDate,
    numOfRows: String(opts.numOfRows ?? 300),
    pageNo: "1",
    arrange: "A",
  };
  const raw = await fetchTour<Record<string, string>>("searchFestival2", params);
  const regionNeedle = region.replace(/특별시|광역시|특별자치시|특별자치도|도$/, "").slice(0, 2);
  const filtered = raw.filter(r => {
    if (opts.endDate && r.eventstartdate && r.eventstartdate > opts.endDate) return false;
    if (!regionNeedle || !areaCode) return true;
    const addr = (r.addr1 ?? "") + (r.addr2 ?? "");
    return addr.includes(regionNeedle) || r.lDongRegnCd === areaCode;
  });
  return filtered.map(r => ({
    contentId: r.contentid ?? "",
    title: r.title ?? "",
    addr: (r.addr1 ?? "") + (r.addr2 ? " " + r.addr2 : ""),
    eventStartDate: r.eventstartdate ?? "",
    eventEndDate: r.eventenddate ?? "",
    firstImage: r.firstimage ?? "",
    areaCode: r.lDongRegnCd ?? r.areacode ?? "",
  }));
}

export async function fetchLocationBasedTour(opts: {
  mapX: string; mapY: string; radius: string; contentTypeId?: string; numOfRows?: number;
}): Promise<TourSpot[]> {
  const raw = await fetchTour<Record<string, string>>("locationBasedList2", {
    mapX: opts.mapX,
    mapY: opts.mapY,
    radius: opts.radius,
    contentTypeId: opts.contentTypeId ?? "12",
    numOfRows: String(opts.numOfRows ?? 20),
    pageNo: "1",
    arrange: "E",
  });
  return raw.map(r => ({
    contentId: r.contentid ?? "",
    title: r.title ?? "",
    addr: (r.addr1 ?? "") + (r.addr2 ? " " + r.addr2 : ""),
    areaCode: r.areacode ?? "",
    sigunguCode: r.sigungucode ?? "",
    cat1: r.cat1 ?? "",
    cat2: r.cat2 ?? "",
    cat3: r.cat3 ?? "",
    firstImage: r.firstimage ?? "",
    mapX: r.mapx ?? "",
    mapY: r.mapy ?? "",
  }));
}
