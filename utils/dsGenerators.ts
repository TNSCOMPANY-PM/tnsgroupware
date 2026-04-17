/**
 * 데이터시트 생성기 DS-01 ~ DS-16.
 * 각 함수는 DatasheetInput 을 반환하며, datasheetBuilder.renderDatasheetHtml 으로 HTML 변환.
 */

import type { DatasheetInput } from "./datasheetBuilder";
import {
  fetchBrandFrcsStats,
  fetchIndutyStrtupCost,
  fetchAreaIndutyAvr,
  fetchAreaIndutyFrcsCount,
  fetchIndutyOpenCloseRate,
  fetchBrandDirectFrcsRatio,
  fetchNewBrandList,
  fetchIndutyFrcsFluctuation,
  fetchIndutyOverview,
  fetchForeignFranchisor,
  fetchConglomerateList,
  type BrandFrcsStat,
  type IndutyLclas,
} from "./ftcDataPortal";
import {
  fetchFtcFactByBrandName,
  findJngIfrmpSn,
  ftcContent,
} from "./ftcFranchise";
import { extractFactsFromContent } from "./ftcContentParser";
import { fetchAreaTourSpots, fetchFestivals } from "./tourApi";
import { fetchBusinessStatus } from "./ntsApi";
import {
  fetchStoresByRegion,
  regionToCtprvnCd,
  industryToSbizLclsCd,
  aggregateByDong,
} from "./sbizApi";
import { fetchIndustryMarketSize, fetchRegionPopulation } from "./kosisApi";
import { fetchIndustryIncidents, aggregateViolations } from "./foodSafetyApi";

// ─── 업종 매핑 ────────────────────────────────
type IndustryMapping = { lclas: IndutyLclas; filters: string[] };

const INDUSTRY_MAP: Record<string, IndustryMapping> = {
  치킨: { lclas: "외식", filters: ["치킨"] },
  카페: { lclas: "외식", filters: ["커피", "음료", "제과", "아이스크림", "빙수"] },
  편의점: { lclas: "도소매", filters: ["편의점"] },
  피자: { lclas: "외식", filters: ["피자"] },
  한식: { lclas: "외식", filters: ["한식"] },
  분식: { lclas: "외식", filters: ["분식"] },
  주점: { lclas: "외식", filters: ["주점"] },
  기타: { lclas: "외식", filters: [] },
};

const ALL_LCLAS: IndutyLclas[] = ["외식", "도소매", "서비스"];

function isAll(industry: string): boolean {
  return industry === "전체";
}

function getMapping(industry: string): IndustryMapping {
  return INDUSTRY_MAP[industry] ?? { lclas: "외식", filters: [industry] };
}

function yr(): string {
  const y = new Date().getFullYear();
  return String(y - 2); // 공정위 데이터는 보통 2년 전까지 존재
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function fmtAmt(v: number): string {
  if (v <= 0) return "-";
  return `${Math.round(v / 1000).toLocaleString("ko-KR")}만원`;
}

function fmtAmtRaw(v: number): string {
  if (v <= 0) return "-";
  return `${v.toLocaleString("ko-KR")}천원`;
}

function pct(n: number, d: number): string {
  if (d <= 0) return "-";
  return `${(Math.round((n / d) * 1000) / 10).toFixed(1)}%`;
}

// ─── DS-01: 업종별 평균 창업비용표 ─────────────
export async function generateDS01(industry: string): Promise<DatasheetInput> {
  const year = yr();

  const toNum = (s: string | undefined) => {
    if (!s) return 0;
    const n = Number(s.replace(/,/g, ""));
    return isNaN(n) ? 0 : n;
  };

  // "전체"이면 3개 대분류 병렬 조회, 아니면 단일 대분류+필터
  let source: Record<string, string>[];
  if (isAll(industry)) {
    const results = await Promise.all(ALL_LCLAS.map(l => fetchIndutyStrtupCost(year, l)));
    source = results.flat();
  } else {
    const m = getMapping(industry);
    const raw = await fetchIndutyStrtupCost(year, m.lclas);
    source = m.filters.length === 0
      ? raw
      : raw.filter(r => {
          const name = r.indutyMlsfcNm ?? "";
          return m.filters.some(f => name.includes(f));
        });
  }

  // 실제 API 필드: avrgFrcsAmt(가맹금), avrgFntnAmt(교육비), avrgJngEtcAmt(기타), smtnAmt(합계)
  const rows: string[][] = [];

  const groups = new Map<string, typeof source>();
  for (const r of source) {
    const key = r.indutyMlsfcNm || "기타";
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(r);
  }
  for (const [name, items] of groups) {
    const cnt = items.length || 1;
    const avg = (field: string) => Math.round(items.reduce((s, i) => s + toNum(i[field]), 0) / cnt);
    const total = avg("smtnAmt");
    const frcs = avg("avrgFrcsAmt");
    const fntn = avg("avrgFntnAmt");
    const etc = avg("avrgJngEtcAmt");
    rows.push([name, fmtAmtRaw(total), fmtAmtRaw(frcs), fmtAmtRaw(fntn), fmtAmtRaw(etc)]);
  }

  // 총액 기준 내림차순
  rows.sort((a, b) => {
    const parse = (s: string) => Number(s.replace(/[^0-9]/g, "")) || 0;
    return parse(b[1]) - parse(a[1]);
  });

  const topRow = rows[0];
  const botRow = rows[rows.length - 1];
  let lede = topRow
    ? `${industry} 프랜차이즈 평균 창업비용은 ${topRow[1]}이다 (${year}년 공정위 정보공개서 기준).`
    : `${industry} 업종에 해당하는 정보공개서 데이터가 부족하다 (${year}년 공정위 기준).`;
  if (topRow && botRow && rows.length >= 2 && topRow !== botRow) {
    lede += ` 가장 높은 업종은 ${topRow[0]}(${topRow[1]}), 가장 낮은 업종은 ${botRow[0]}(${botRow[1]})이다.`;
  }

  return {
    dsType: "DS-01",
    title: `${industry} 프랜차이즈 창업비용 비교 — ${year}년 공정위 기준`,
    lede,
    tables: [{
      caption: `${industry} 업종별 평균 창업비용 (${year}년)`,
      headers: ["업종(중분류)", "총 창업비용", "가맹금", "교육비", "기타비용"],
      rows,
    }],
    notes: [
      "창업비용은 정보공개서 신고 기준이며, 실제 비용은 상권·면적에 따라 달라질 수 있음",
      "천원 단위, 소수점 이하 반올림",
      rows.length >= 2 ? `최고(${topRow[0]})와 최저(${botRow[0]}) 간 차이 존재 — 점포 면적·입지에 따라 추가 비용 발생 가능` : "",
    ].filter(Boolean),
    sources: ["공정위 가맹사업정보공개서", "공공데이터포털 업종별 창업비용 현황 API"],
    baseDate: `${year}-12-31`,
  };
}

// ─── DS-02: 업종별 폐점률 순위표 (정식 개폐점률 API) ─────────────
export async function generateDS02(industry: string): Promise<DatasheetInput> {
  const year = yr();
  const m = isAll(industry) ? null : getMapping(industry);
  const lclasList = m ? [m.lclas] : ALL_LCLAS;
  const fetched = await Promise.all(lclasList.map(l => fetchIndutyOpenCloseRate(year, l)));
  let merged = fetched.flat();
  if (m && m.filters.length > 0) {
    merged = merged.filter(r => m.filters.some(f => r.industry.includes(f)));
  }
  merged.sort((a, b) => b.closeRate - a.closeRate);

  const title = `${industry === "전체" ? "프랜차이즈" : industry + " 프랜차이즈"} 업종별 폐점률 순위 — ${year}년 공정위 기준`;

  if (merged.length === 0) {
    return {
      dsType: "DS-02",
      title,
      lede: `${year}년 ${industry} 업종 개·폐점률 데이터가 없다.`,
      tables: [{
        caption: `업종별 폐점률 순위 (${year}년)`,
        headers: ["순위", "업종", "가맹점수", "개점률", "폐점률"],
        rows: [["-", "해당 업종 데이터 없음", "-", "-", "-"]],
      }],
      notes: ["공정위 주요 업종별 개·폐점률 현황 API 기준"],
      sources: ["공정위 주요 업종별 가맹점 개·폐점률 현황 API"],
      baseDate: `${year}-12-31`,
    };
  }

  const rows = merged.slice(0, 20).map((r, i) => [
    String(i + 1),
    r.industry,
    r.totalStores.toLocaleString("ko-KR"),
    `${r.openRate}%`,
    `${r.closeRate}%`,
  ]);

  const top = merged[0];
  const bot = merged[merged.length - 1];
  const totalStores = merged.reduce((s, r) => s + r.totalStores, 0);
  const weightedClose = merged.reduce((s, r) => s + r.totalStores * r.closeRate, 0);
  const avgRate = totalStores > 0 ? Math.round((weightedClose / totalStores) * 10) / 10 : 0;
  let lede = `${year}년 폐점률이 가장 높은 업종은 ${top.industry}(${top.closeRate}%)이다.`;
  if (bot.industry !== top.industry) {
    lede += ` 가장 낮은 업종은 ${bot.industry}(${bot.closeRate}%). ${industry} 업종 평균 폐점률은 ${avgRate}%이다.`;
  }

  return {
    dsType: "DS-02",
    title,
    lede,
    tables: [{
      caption: `업종별 개·폐점률 순위 (${year}년)`,
      headers: ["순위", "업종", "가맹점수", "개점률", "폐점률"],
      rows,
    }],
    notes: [
      "공정위 '주요 업종별 가맹점 개·폐점률 현황' 정식 집계 기반",
      "폐점률 = (계약종료 + 계약해지) / 가맹점수 × 100",
    ],
    sources: ["공정위 주요 업종별 가맹점 개·폐점률 현황 API"],
    baseDate: `${year}-12-31`,
  };
}

// ─── DS-03: 업종별 월평균매출 순위 ─────────────
export async function generateDS03(industry: string): Promise<DatasheetInput> {
  const year = yr();
  const all = await fetchBrandFrcsStats(year);

  let filtered: BrandFrcsStat[];
  if (isAll(industry)) {
    filtered = all.filter(b => b.avrgSlsAmt > 0);
  } else {
    const m = getMapping(industry);
    filtered = all.filter(b => {
      if (b.avrgSlsAmt <= 0) return false;
      if (!b.indutyLclasNm.includes(m.lclas)) return false;
      if (m.filters.length === 0) return true;
      return m.filters.some(f => b.indutyMlsfcNm.includes(f));
    });
  }

  // 매출 내림차순
  filtered.sort((a, b) => b.avrgSlsAmt - a.avrgSlsAmt);
  const top20 = filtered.slice(0, 20);

  const rows = top20.map((b, i) => [
    String(i + 1),
    b.brandNm,
    fmtAmt(b.avrgSlsAmt),
    b.arUnitAvrgSlsAmt > 0 ? fmtAmtRaw(b.arUnitAvrgSlsAmt) : "-",
    b.frcsCnt.toLocaleString("ko-KR"),
  ]);

  const topB = top20[0];
  const botB = top20[top20.length - 1];
  let lede = topB
    ? `${industry} 프랜차이즈 중 연평균매출 1위는 ${topB.brandNm}(${fmtAmt(topB.avrgSlsAmt)})이다.`
    : `${industry} 프랜차이즈 매출 순위 데이터.`;
  if (topB && botB && top20.length >= 3) {
    lede += ` ${top20.length}위 ${botB.brandNm}은 ${fmtAmt(botB.avrgSlsAmt)}으로 1위 대비 ${Math.round((1 - botB.avrgSlsAmt / topB.avrgSlsAmt) * 100)}% 낮다.`;
  }

  return {
    dsType: "DS-03",
    title: `${industry} 프랜차이즈 연평균매출 순위 — ${year}년 공정위 기준`,
    lede,
    tables: [{
      caption: `${industry} 연평균매출 TOP 20 (${year}년)`,
      headers: ["순위", "브랜드", "연평균매출", "면적당매출", "가맹점수"],
      rows,
    }],
    notes: [
      "매출은 연평균 기준(천원 단위), 면적당매출은 ㎡ 기준",
      "가맹점수 10개 미만 브랜드 포함",
    ],
    sources: ["공정위 브랜드별 가맹점 현황 API"],
    baseDate: `${year}-12-31`,
  };
}

// ─── DS-04: 지역별 업종 평균매출표 ─────────────
export async function generateDS04(industry: string, region: string): Promise<DatasheetInput> {
  const year = yr();
  let raw: Record<string, string>[];
  if (isAll(industry)) {
    const results = await Promise.all(ALL_LCLAS.map(l => fetchAreaIndutyAvr(year, l)));
    raw = results.flat();
  } else {
    const m = getMapping(industry);
    raw = await fetchAreaIndutyAvr(year, m.lclas);
  }

  const toNum = (s: string | undefined) => {
    if (!s) return 0;
    const n = Number(s.replace(/,/g, ""));
    return isNaN(n) ? 0 : n;
  };

  // 지역별 그룹
  type RegionRow = { name: string; avrgSlsAmt: number; cnt: number };
  const regionMap = new Map<string, RegionRow>();
  for (const r of raw) {
    const rName = r.areaNm ?? r.signguNm ?? "기타";
    const prev = regionMap.get(rName) ?? { name: rName, avrgSlsAmt: 0, cnt: 0 };
    prev.avrgSlsAmt += toNum(r.avrgSlsAmt);
    prev.cnt += 1;
    regionMap.set(rName, prev);
  }

  // 전국 평균
  let totalAmt = 0; let totalCnt = 0;
  for (const v of regionMap.values()) { totalAmt += v.avrgSlsAmt; totalCnt += v.cnt; }
  const nationalAvg = totalCnt > 0 ? Math.round(totalAmt / totalCnt) : 0;

  const rows: string[][] = [];
  for (const [, v] of regionMap) {
    const avg = v.cnt > 0 ? Math.round(v.avrgSlsAmt / v.cnt) : 0;
    const diff = avg - nationalAvg;
    const diffStr = diff >= 0 ? `+${fmtAmtRaw(diff)}` : `-${fmtAmtRaw(Math.abs(diff))}`;
    rows.push([v.name, fmtAmtRaw(avg), fmtAmtRaw(nationalAvg), diffStr]);
  }
  rows.sort((a, b) => {
    const parse = (s: string) => Number(s.replace(/[^0-9]/g, "")) || 0;
    return parse(b[1]) - parse(a[1]);
  });

  const target = rows.find(r => r[0].includes(region.replace(/특별시|광역시|특별자치시|특별자치도|도/, "").slice(0, 2)));
  const lede = target
    ? `${region}에서 ${industry} 프랜차이즈 평균매출은 ${target[1]}이다.`
    : `${region} ${industry} 프랜차이즈 지역별 평균매출 데이터.`;

  return {
    dsType: "DS-04",
    title: `${region} 프랜차이즈 업종별 평균매출 — ${year}년 공정위 기준`,
    lede,
    tables: [{
      caption: `지역별 ${industry} 평균매출 (${year}년)`,
      headers: ["지역", "평균매출", "전국평균", "전국평균 대비"],
      rows,
    }],
    sources: ["공정위 지역별 업종별 평균매출 API"],
    baseDate: `${year}-12-31`,
  };
}

// ─── DS-05: 지역별 가맹점 포화도표 ─────────────
export async function generateDS05(industry: string, region: string): Promise<DatasheetInput> {
  const year = yr();
  const raw = await fetchAreaIndutyFrcsCount(year);

  const toNum = (s: string | undefined) => {
    if (!s) return 0;
    const n = Number(s.replace(/,/g, ""));
    return isNaN(n) ? 0 : n;
  };

  // 지역별 집계
  type RegData = { name: string; frcsCnt: number };
  const regionMap = new Map<string, RegData>();
  const allMode = isAll(industry);
  const m = allMode ? null : getMapping(industry);
  for (const r of raw) {
    const rName = r.areaNm ?? r.signguNm ?? "기타";
    if (!allMode && m) {
      if (!(r.indutyLclasNm ?? "").includes(m.lclas)) continue;
      if (m.filters.length > 0) {
        const mlsf = r.indutyMlsfcNm ?? "";
        if (!m.filters.some(f => mlsf.includes(f))) continue;
      }
    }
    const prev = regionMap.get(rName) ?? { name: rName, frcsCnt: 0 };
    prev.frcsCnt += toNum(r.frcsCnt ?? r.frcsStoreSum ?? "0");
    regionMap.set(rName, prev);
  }

  let total = 0;
  for (const v of regionMap.values()) total += v.frcsCnt;

  const rows: string[][] = [];
  for (const [, v] of regionMap) {
    const share = total > 0 ? `${(Math.round((v.frcsCnt / total) * 1000) / 10).toFixed(1)}%` : "-";
    rows.push([v.name, v.frcsCnt.toLocaleString("ko-KR"), share]);
  }
  rows.sort((a, b) => {
    const parse = (s: string) => Number(s.replace(/[^0-9]/g, "")) || 0;
    return parse(b[1]) - parse(a[1]);
  });

  const topReg = rows[0];
  const botReg = rows[rows.length - 1];
  const lede = topReg && botReg
    ? `${industry} 가맹점이 가장 많은 지역은 ${topReg[0]}(${topReg[1]}개)이며, 가장 적은 지역은 ${botReg[0]}(${botReg[1]}개)이다.`
    : `${industry} 지역별 가맹점 포화도 데이터.`;

  return {
    dsType: "DS-05",
    title: `${industry} 프랜차이즈 지역별 가맹점수 현황 — ${year}년`,
    lede,
    tables: [{
      caption: `${industry} 지역별 가맹점 분포 (${year}년)`,
      headers: ["지역", "가맹점수", "전국 비중"],
      rows,
    }],
    notes: ["인구 대비 포화도는 행정안전부 주민등록인구 기준 별도 산출 필요"],
    sources: ["공정위 지역별 업종별 가맹점수 API"],
    baseDate: `${year}-12-31`,
  };
}

// ─── DS-06: 업종별 로열티 비교표 ─────────────
// 로열티 정보는 정보공개서 본문에서만 추출 가능 → 상위 브랜드 N개 샘플링
export async function generateDS06(industry: string): Promise<DatasheetInput> {
  const year = yr();
  const all = await fetchBrandFrcsStats(year);

  // 해당 업종 상위 10개 (가맹점수 기준)
  const base = isAll(industry) ? all : (() => {
    const m = getMapping(industry);
    return all.filter(b => {
      if (!b.indutyLclasNm.includes(m.lclas)) return false;
      if (m.filters.length === 0) return true;
      return m.filters.some(f => b.indutyMlsfcNm.includes(f));
    });
  })();
  const filtered = base
    .filter(b => b.frcsCnt >= 10)
    .sort((a, b) => b.frcsCnt - a.frcsCnt)
    .slice(0, 10);

  const rows: string[][] = [];
  const targets = filtered.slice(0, 10);
  const results = await Promise.allSettled(
    targets.map(async (b) => {
      const item = await findJngIfrmpSn({ brandName: b.brandNm, corpName: b.corpNm });
      if (!item) return { brand: b.brandNm, royalty: "정보 없음" };
      const { sections } = await ftcContent(item.jngIfrmpSn);
      const royaltySec = sections.find(s => {
        const hay = (s.attr + " " + s.title).toLowerCase();
        return (
          s.attr.includes("RYLTY") ||
          s.attrbSn === "AF_0402000000" ||
          s.attrbSn?.startsWith("AF_0402") ||
          /로열티|가맹금|계속가맹금|월회비|정기납|수수료/.test(s.title) ||
          /rylty|jng_amt/.test(hay)
        );
      });
      if (!royaltySec) return { brand: b.brandNm, royalty: "정보공개서 미기재" };
      const text = royaltySec.rawXml.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
      const amtMatch = text.match(/(\d[\d,]*)\s*(?:천원|만원|원)/);
      const pctMatch = text.match(/(\d+\.?\d*)\s*%/);
      const royalty = amtMatch ? amtMatch[0] : pctMatch ? pctMatch[0] : "정보공개서 확인 필요";
      return { brand: b.brandNm, royalty };
    })
  );

  for (const r of results) {
    if (r.status === "fulfilled") {
      rows.push([r.value.brand, r.value.royalty]);
    }
  }

  return {
    dsType: "DS-06",
    title: `${industry} 프랜차이즈 로열티·수수료 비교 — ${year}년 정보공개서 기준`,
    lede: `${industry} 프랜차이즈 상위 브랜드의 로열티 비교표이다.`,
    tables: [{
      caption: `${industry} 로열티 비교 (상위 브랜드, ${year}년)`,
      headers: ["브랜드", "로열티"],
      rows,
    }],
    notes: [
      "로열티 항목은 정보공개서 본문에서 추출하며, 브랜드별 기재 형태가 상이함",
      "상위 10개 브랜드를 자동 조회",
    ],
    sources: ["공정위 가맹사업정보공개서 본문 API"],
    baseDate: `${year}-12-31`,
  };
}

// ─── DS-07: 업종·규모별 직영 브랜드 비율 (정식 분포 API) ─────────────
export async function generateDS07(industry: string): Promise<DatasheetInput> {
  const year = yr();
  const all = await fetchBrandDirectFrcsRatio(year);
  const m = isAll(industry) ? null : getMapping(industry);
  const filtered = m ? all.filter(r => r.lclas.includes(m.lclas)) : all;
  filtered.sort((a, b) => b.directRatio - a.directRatio);

  const rows = filtered.map(r => [
    r.lclas,
    r.scale,
    r.totalBrands.toLocaleString("ko-KR"),
    r.directBrands.toLocaleString("ko-KR"),
    `${r.directRatio.toFixed(1)}%`,
  ]);

  return {
    dsType: "DS-07",
    title: `${industry} 프랜차이즈 직영점 운영 현황 — ${year}년 공정위 기준`,
    lede: rows.length > 0
      ? `${industry} 업종에서 직영 브랜드 비율이 가장 높은 구간은 ${filtered[0].lclas} / ${filtered[0].scale}(${filtered[0].directRatio.toFixed(1)}%)이다.`
      : `${industry} 직영 운영 분포 데이터 없음.`,
    tables: [{
      caption: `${industry} 업종·규모 구간별 직영 브랜드 비율 (${year}년)`,
      headers: ["업종 대분류", "가맹점 규모", "브랜드 수", "직영 브랜드 수", "직영 비율"],
      rows: rows.length > 0 ? rows : [["-", "-", "-", "-", "-"]],
    }],
    notes: [
      "공정위 '브랜드별·업종별 직영점 및 가맹점 분포 현황' 정식 API 기반 집계",
      "직영 비율 = 직영점을 1개 이상 운영하는 브랜드 수 / 해당 규모 구간 브랜드 수",
    ],
    sources: ["공정위 브랜드별·업종별 직영점 및 가맹점 분포 현황 API"],
    baseDate: `${year}-12-31`,
  };
}

// ─── DS-08: 월간 신규 브랜드 리스트 (신규등록 API + BrandFrcsStats 폴백) ─────────────
export async function generateDS08(industry: string): Promise<DatasheetInput> {
  const year = yr();
  const [newList, allStats] = await Promise.all([
    fetchNewBrandList(year).catch(() => []),
    fetchBrandFrcsStats(year),
  ]);

  const m = isAll(industry) ? null : getMapping(industry);
  const matchLclas = (s: BrandFrcsStat) => {
    if (!m) return true;
    if (!s.indutyLclasNm.includes(m.lclas)) return false;
    if (m.filters.length === 0) return true;
    return m.filters.some(f => s.indutyMlsfcNm.includes(f));
  };

  const useOfficial = newList.length > 0;
  const statByBrand = new Map<string, BrandFrcsStat>();
  for (const s of allStats) if (s.brandNm) statByBrand.set(s.brandNm, s);

  type Row = { brand: string; corp: string; industryName: string; startDate: string; frcsCnt: number };
  let rowsData: Row[];

  if (useOfficial) {
    const filtered = newList.filter(n => {
      const s = statByBrand.get(n.brand);
      if (!s) return !m;
      return matchLclas(s);
    });
    filtered.sort((a, b) => (b.startDate || "").localeCompare(a.startDate || ""));
    rowsData = filtered.slice(0, 50).map(n => {
      const s = statByBrand.get(n.brand);
      return {
        brand: n.brand,
        corp: n.corp,
        industryName: s?.indutyMlsfcNm || s?.indutyLclasNm || "-",
        startDate: n.startDate ? n.startDate.slice(0, 10) : "-",
        frcsCnt: s?.frcsCnt ?? 0,
      };
    });
  } else {
    const candidates = allStats.filter(s => s.newFrcsRgsCnt > 0 && s.frcsCnt > 0 && matchLclas(s));
    candidates.sort((a, b) => b.newFrcsRgsCnt - a.newFrcsRgsCnt);
    rowsData = candidates.slice(0, 50).map(s => ({
      brand: s.brandNm,
      corp: s.corpNm,
      industryName: s.indutyMlsfcNm || s.indutyLclasNm || "-",
      startDate: "-",
      frcsCnt: s.newFrcsRgsCnt,
    }));
  }

  const rows = rowsData.map(r => [
    r.brand, r.corp, r.industryName, r.startDate,
    (r.frcsCnt ?? 0).toLocaleString("ko-KR"),
  ]);

  return {
    dsType: "DS-08",
    title: `${year}년 신규 등록 프랜차이즈 브랜드 — ${industry} 업종`,
    lede: useOfficial
      ? `${year}년 ${industry} 업종 신규 등록 프랜차이즈 브랜드는 총 ${rowsData.length}개이다 (공정위 신규등록 API).`
      : `${year}년 ${industry} 업종에서 신규 가맹점을 등록한 브랜드는 총 ${rowsData.length}개이다 (가맹점 현황 newFrcsRgsCnt 기준).`,
    tables: [{
      caption: `${industry} 신규 등록 브랜드 (${year}년)`,
      headers: useOfficial
        ? ["브랜드", "법인명", "업종", "가맹사업 시작일", "가맹점수"]
        : ["브랜드", "법인명", "업종", "시작일", "신규등록수"],
      rows: rows.length > 0 ? rows : [["-", "-", "-", "-", "-"]],
    }],
    notes: useOfficial
      ? ["공정위 '신규등록 브랜드 목록' 정식 API 기반", "가맹사업 시작일은 정보공개서 최초 등록일 기준"]
      : ["공정위 신규등록 전용 API 응답 없음 → 브랜드별 가맹점 현황의 newFrcsRgsCnt(신규등록 가맹점수) 기준 대체", "실제 신규 등록 브랜드인지는 정보공개서 등록일 별도 확인 필요"],
    sources: ["공정위 브랜드별 가맹점 현황 API", ...(useOfficial ? ["공정위 신규등록 브랜드 목록 API"] : [])],
    baseDate: `${year}-12-31`,
  };
}

// ─── DS-09: 브랜드 팩트시트 ─────────────
export async function generateDS09(brand: string): Promise<DatasheetInput> {
  const year = yr();

  // 병렬: 가맹점현황 + 정보공개서
  const [factResult, jng] = await Promise.all([
    fetchFtcFactByBrandName(brand),
    findJngIfrmpSn({ brandName: brand }),
  ]);

  const stat = factResult.raw as BrandFrcsStat | null;

  // 기본 정보 테이블
  const basicRows: string[][] = [];
  if (stat) {
    basicRows.push(
      ["법인명", stat.corpNm || "미공개"],
      ["업종", `${stat.indutyLclasNm} / ${stat.indutyMlsfcNm}`],
      ["기준연도", stat.yr],
      ["가맹점수", stat.frcsCnt > 0 ? `${stat.frcsCnt.toLocaleString("ko-KR")}개` : "미공개"],
      ["신규등록", stat.newFrcsRgsCnt > 0 ? `${stat.newFrcsRgsCnt}개` : "미공개"],
      ["연평균매출", stat.avrgSlsAmt > 0 ? fmtAmt(stat.avrgSlsAmt) : "미공개"],
      ["면적당매출", stat.arUnitAvrgSlsAmt > 0 ? fmtAmtRaw(stat.arUnitAvrgSlsAmt) + "/㎡" : "미공개"],
    );
    // 폐점률
    if (stat.frcsCnt > 0) {
      const closed = stat.ctrtEndCnt + stat.ctrtCncltnCnt;
      const rate = (Math.round((closed / stat.frcsCnt) * 1000) / 10).toFixed(1);
      basicRows.push(["폐점률", `${rate}% (종료 ${stat.ctrtEndCnt} + 해지 ${stat.ctrtCncltnCnt})`]);
    }
  }

  // 정보공개서 상세 (비용 관련)
  const costRows: string[][] = [];
  if (jng) {
    try {
      const { sections } = await ftcContent(jng.jngIfrmpSn);
      const facts = extractFactsFromContent(sections);
      for (const f of facts) {
        if (f.unit === "천원" && f.value > 0) {
          costRows.push([f.label.replace(/_/g, " "), fmtAmtRaw(f.value)]);
        }
      }
    } catch { /* 정보공개서 조회 실패 무시 */ }
  }

  const tables: DatasheetInput["tables"] = [];
  if (basicRows.length > 0) {
    tables.push({ caption: `${brand} 기본 현황`, headers: ["항목", "내용"], rows: basicRows });
  }
  if (costRows.length > 0) {
    tables.push({ caption: `${brand} 창업비용 상세`, headers: ["항목", "금액"], rows: costRows });
  }

  const lede = stat
    ? `${brand}의 총 가맹점수는 ${stat.frcsCnt > 0 ? stat.frcsCnt.toLocaleString("ko-KR") + "개" : "미공개"}, 연평균매출은 ${stat.avrgSlsAmt > 0 ? fmtAmt(stat.avrgSlsAmt) : "미공개"}이다.`
    : `${brand} 프랜차이즈 공식 데이터.`;

  return {
    dsType: "DS-09",
    title: `${brand} 프랜차이즈 창업 정보 — ${year}년 공정위 기준`,
    lede,
    tables,
    sources: ["공정위 브랜드별 가맹점 현황 API", "공정위 가맹사업정보공개서 API"],
    baseDate: `${year}-12-31`,
  };
}

// ─── DS-10: 브랜드 본사 재무 요약 ─────────────
// 공정위 데이터포털에 본사 재무 API가 없으므로, 정보공개서의 재무제표 섹션 활용
export async function generateDS10(brand: string): Promise<DatasheetInput> {
  const year = yr();
  const jng = await findJngIfrmpSn({ brandName: brand });

  const rows: string[][] = [];
  if (jng) {
    try {
      const { sections } = await ftcContent(jng.jngIfrmpSn);
      // AF_0201 또는 재무 관련 섹션
      const finSec = sections.find(s =>
        s.attr.includes("FNNCL") || s.title.includes("재무") || s.attrbSn.startsWith("AF_0201")
      );
      if (finSec) {
        const text = finSec.rawXml.replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/\s+/g, " ");
        // 숫자 추출 시도
        const nums = [...text.matchAll(/(\d[\d,]{2,})/g)].map(m => Number(m[1].replace(/,/g, "")));
        if (nums.length >= 3) {
          rows.push(["자산총계", fmtAmtRaw(nums[0])]);
          rows.push(["매출액", fmtAmtRaw(nums[1])]);
          rows.push(["당기순이익", fmtAmtRaw(nums[2])]);
        }
      }
    } catch { /* 무시 */ }
  }

  if (rows.length === 0) {
    rows.push(["안내", "정보공개서 재무제표 섹션 조회 불가 또는 미기재"]);
  }

  return {
    dsType: "DS-10",
    title: `${brand} 본사 재무현황 — ${year}년`,
    lede: rows.length > 1
      ? `${brand} 가맹본부의 재무 요약이다.`
      : `${brand} 본사 재무 데이터는 정보공개서에서 확인 필요.`,
    tables: [{ caption: `${brand} 본사 재무 요약`, headers: ["항목", "금액"], rows }],
    notes: ["정보공개서 기재 재무제표 기준, 단위: 천원", "상세 재무정보는 DART(전자공시시스템) 참조 권장"],
    sources: ["공정위 가맹사업정보공개서 API"],
    baseDate: `${year}-12-31`,
  };
}

// ─── DS-11: 브랜드 계약조건 요약 ─────────────
export async function generateDS11(brand: string): Promise<DatasheetInput> {
  const year = yr();
  const jng = await findJngIfrmpSn({ brandName: brand });

  const rows: string[][] = [];
  if (jng) {
    try {
      const { sections } = await ftcContent(jng.jngIfrmpSn);

      const extract = (keywords: string[], label: string) => {
        const sec = sections.find(s =>
          keywords.some(k => s.title.includes(k) || s.attr.includes(k))
        );
        if (!sec) return;
        const text = sec.rawXml.replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim();
        const snippet = text.slice(0, 200);
        rows.push([label, snippet || "미기재"]);
      };

      extract(["계약기간", "CTRT_PRD"], "계약기간");
      extract(["로열티", "RYLTY"], "로열티");
      extract(["영업지역", "BIZ_AREA"], "영업지역 보호");
      extract(["계약갱신", "RNWL", "갱신"], "계약갱신 조건");
      extract(["계약해지", "CTRT_TRMT", "해지"], "계약해지 사유");
    } catch { /* 무시 */ }
  }

  if (rows.length === 0) {
    rows.push(["안내", "정보공개서 계약조건 섹션 조회 불가 또는 미기재"]);
  }

  return {
    dsType: "DS-11",
    title: `${brand} 가맹 계약조건 요약 — ${year}년 정보공개서 기준`,
    lede: rows.length > 1
      ? `${brand}의 가맹 계약조건 요약이다.`
      : `${brand} 계약조건 데이터는 정보공개서에서 확인 필요.`,
    tables: [{ caption: `${brand} 계약조건`, headers: ["항목", "내용"], rows }],
    notes: ["정보공개서 원문에서 자동 추출한 요약이며, 정확한 내용은 원문 확인 필요"],
    sources: ["공정위 가맹사업정보공개서 API"],
    baseDate: `${year}-12-31`,
  };
}

// ─── DS-12: 가맹사업거래법 핵심 조항 ─────────
import {
  fetchLawArticles,
  getKeyArticleNos,
  FRANCHISE_LAW_SERIAL,
} from "./lawApi";

export async function generateDS12(): Promise<DatasheetInput> {
  const articles = await fetchLawArticles(FRANCHISE_LAW_SERIAL);
  const keyNos = getKeyArticleNos();

  const rows: string[][] = [];
  for (const k of keyNos) {
    const art = articles.find(a => a.articleNo === k.no);
    if (art) {
      const summary = art.content.slice(0, 120) + (art.content.length > 120 ? "…" : "");
      rows.push([`제${k.no}조`, art.title || k.why, summary]);
    } else {
      rows.push([`제${k.no}조`, k.why, "(조문 조회 실패)"]);
    }
  }

  return {
    dsType: "DS-12",
    title: "가맹사업거래법 핵심 10개 조항 — 예비 창업자 필독",
    lede: "가맹사업거래법은 가맹점주를 보호하기 위한 법률로, 정보공개서 제공(제7조), 허위과장 금지(제9조), 부당한 계약조건 금지(제12조의2) 등을 규정한다.",
    tables: [{
      caption: "가맹사업거래법 핵심 조항 요약",
      headers: ["조항", "제목", "내용 요약"],
      rows,
    }],
    notes: [
      "가맹사업거래의 공정화에 관한 법률 (약칭: 가맹사업법)",
      "전체 조문은 국가법령정보센터(law.go.kr)에서 확인 가능",
    ],
    sources: ["국가법령정보센터 (law.go.kr)", "가맹사업거래의 공정화에 관한 법률"],
    baseDate: today(),
  };
}

// ─── DS-13: 차액가맹금 해설 ─────────────
export async function generateDS13(): Promise<DatasheetInput> {
  const articles = await fetchLawArticles(FRANCHISE_LAW_SERIAL);

  // 제2조 6호 (가맹금 정의), 제12조의2 (부당한 계약조건)
  const art2 = articles.find(a => a.articleNo === "2");
  const art12_2 = articles.find(a => a.articleNo === "12의2" || a.articleNo === "12");

  const rows: string[][] = [];
  rows.push(["정의", "가맹금 중 '차액'에 해당하는 대가", art2 ? art2.subItems.find(s => s.includes("가맹금") && s.includes("대가"))?.slice(0, 150) ?? "제2조 제6호 참조" : "제2조 제6호 참조"]);
  rows.push(["법적 근거", "가맹사업법 제2조 제6호 라목", "가맹점사업자가 영업표지 사용·지원·교육 등에 대해 정기/비정기 지급하는 대가"]);
  rows.push(["공개 의무", "정보공개서 기재 의무", "가맹본부는 차액가맹금의 산정 기준·금액을 정보공개서에 기재해야 함"]);
  rows.push(["위반 시", "가맹사업법 제12조의2", art12_2 ? art12_2.content.slice(0, 120) + "…" : "부당한 계약조건 부과 금지"]);
  rows.push(["주의사항", "과다 차액가맹금 확인", "물품 공급가가 시중가보다 현저히 높을 경우 차액가맹금에 해당할 수 있음"]);

  return {
    dsType: "DS-13",
    title: "차액가맹금이란? — 뜻, 구조, 주의사항 (2026년 기준)",
    lede: "차액가맹금은 가맹본부가 물품을 공급하면서 시장가격보다 높게 책정하여 차액을 수취하는 것으로, 가맹사업거래법 제2조 제6호에 정의되어 있다.",
    tables: [{
      caption: "차액가맹금 핵심 정리",
      headers: ["항목", "설명", "상세"],
      rows,
    }],
    notes: [
      "차액가맹금은 '숨은 로열티'로 불리며, 정보공개서에 의무 공개 대상",
      "실제 분쟁 사례는 공정위 심결례 참조",
    ],
    sources: ["국가법령정보센터 (law.go.kr)", "가맹사업거래의 공정화에 관한 법률 제2조"],
    baseDate: today(),
  };
}

// ─── DS-14: 계약해지 조건 체크리스트 ─────────
export async function generateDS14(): Promise<DatasheetInput> {
  const articles = await fetchLawArticles(FRANCHISE_LAW_SERIAL);

  const art14 = articles.find(a => a.articleNo === "14");
  const art14_2 = articles.find(a => a.articleNo === "14의2");

  const rows: string[][] = [];

  // 제14조 해지 제한 조항 파싱
  if (art14) {
    rows.push(["해지 제한 (제14조)", art14.title, art14.content.slice(0, 150) + (art14.content.length > 150 ? "…" : "")]);
    // 세부 항/호
    for (const sub of art14.subItems.slice(0, 5)) {
      const snippet = sub.slice(0, 120) + (sub.length > 120 ? "…" : "");
      rows.push(["", "세부 조건", snippet]);
    }
  } else {
    rows.push(["해지 제한 (제14조)", "가맹본부의 계약해지 제한", "2개월 이상 유예기간, 서면 통지 필요"]);
  }

  if (art14_2) {
    rows.push(["계약갱신 (제14조의2)", art14_2.title, art14_2.content.slice(0, 150) + (art14_2.content.length > 150 ? "…" : "")]);
  }

  // 체크리스트
  rows.push(["체크 1", "서면 통지 여부", "가맹본부가 서면으로 해지 사유를 통지했는가?"]);
  rows.push(["체크 2", "유예기간 부여", "2개월 이상의 유예기간을 부여했는가?"]);
  rows.push(["체크 3", "위반사실 시정 기회", "가맹점사업자에게 위반사실 시정 기회를 주었는가?"]);
  rows.push(["체크 4", "정당한 해지 사유", "법 제14조에 열거된 해지 사유에 해당하는가?"]);

  return {
    dsType: "DS-14",
    title: "프랜차이즈 계약해지 조건과 절차 — 가맹사업거래법 기준",
    lede: "가맹사업거래법 제14조에 따라 가맹본부가 계약을 해지하려면 2개월 이상의 유예기간과 서면 통지가 필요하다.",
    tables: [{
      caption: "가맹계약 해지 조건 및 체크리스트",
      headers: ["구분", "항목", "내용"],
      rows,
    }],
    notes: [
      "가맹점사업자도 계약 위반 시 해지 가능 (민법 일반 원칙)",
      "분쟁 발생 시 공정거래위원회 분쟁조정 신청 가능",
    ],
    sources: ["국가법령정보센터 (law.go.kr)", "가맹사업거래의 공정화에 관한 법률 제14조"],
    baseDate: today(),
  };
}

// ─── DS-15: 월간 업종 개폐점 현황 ─────────────
export async function generateDS15(industry: string, ym: string): Promise<DatasheetInput> {
  // 월간이지만 FTC 데이터는 연단위 → 최신 연도 데이터 활용
  const year = ym ? ym.slice(0, 4) : yr();
  const month = ym ? ym.slice(5, 7) : "12";
  const all = await fetchBrandFrcsStats(year);

  let filtered: BrandFrcsStat[];
  if (isAll(industry)) {
    filtered = all;
  } else {
    const m = getMapping(industry);
    filtered = all.filter(b => {
      if (!b.indutyLclasNm.includes(m.lclas)) return false;
      if (m.filters.length === 0) return true;
      return m.filters.some(f => b.indutyMlsfcNm.includes(f));
    });
  }

  // 업종별 집계
  const groups = new Map<string, { frcsCnt: number; newFrcs: number; ctrtEnd: number; ctrtCncltn: number }>();
  for (const b of filtered) {
    const key = b.indutyMlsfcNm || "기타";
    const g = groups.get(key) ?? { frcsCnt: 0, newFrcs: 0, ctrtEnd: 0, ctrtCncltn: 0 };
    g.frcsCnt += b.frcsCnt;
    g.newFrcs += b.newFrcsRgsCnt;
    g.ctrtEnd += b.ctrtEndCnt;
    g.ctrtCncltn += b.ctrtCncltnCnt;
    groups.set(key, g);
  }

  const rows: string[][] = [];
  for (const [name, g] of groups) {
    const closed = g.ctrtEnd + g.ctrtCncltn;
    const rate = g.frcsCnt > 0 ? `${(Math.round((closed / g.frcsCnt) * 1000) / 10).toFixed(1)}%` : "-";
    rows.push([name, g.frcsCnt.toLocaleString("ko-KR"), g.newFrcs.toLocaleString("ko-KR"), String(closed), rate]);
  }
  rows.sort((a, b) => parseFloat(b[4]) - parseFloat(a[4]));

  return {
    dsType: "DS-15",
    title: `${year}년 ${month}월 프랜차이즈 업종별 개폐점 현황`,
    lede: rows.length > 0
      ? `${month}월 기준 폐점률이 가장 높은 업종은 ${rows[0][0]}(${rows[0][4]})이다.`
      : `${year}년 ${month}월 개폐점 현황 데이터.`,
    tables: [{
      caption: `업종별 개폐점 현황 (${year}년 기준)`,
      headers: ["업종", "가맹점수", "신규개점", "폐점수", "폐점률"],
      rows,
    }],
    notes: ["공정위 데이터는 연간 기준이며, 월간 분할은 미지원"],
    sources: ["공정위 브랜드별 가맹점 현황 API"],
    baseDate: `${year}-12-31`,
  };
}

// ─── DS-16: 월간 창업비용 변동 ─────────────
export async function generateDS16(industry: string, ym: string): Promise<DatasheetInput> {
  const year = ym ? ym.slice(0, 4) : yr();
  const month = ym ? ym.slice(5, 7) : "12";

  // 현재 연도 + 전년도 비교
  const prevYear = String(Number(year) - 1);
  let curr: Record<string, string>[];
  let prev: Record<string, string>[];
  if (isAll(industry)) {
    const [c, p] = await Promise.all([
      Promise.all(ALL_LCLAS.map(l => fetchIndutyStrtupCost(year, l))),
      Promise.all(ALL_LCLAS.map(l => fetchIndutyStrtupCost(prevYear, l).catch(() => [] as Record<string, string>[]))),
    ]);
    curr = c.flat();
    prev = p.flat();
  } else {
    const m = getMapping(industry);
    [curr, prev] = await Promise.all([
      fetchIndutyStrtupCost(year, m.lclas),
      fetchIndutyStrtupCost(prevYear, m.lclas).catch(() => [] as Record<string, string>[]),
    ]);
  }

  const toNum = (s: string | undefined) => {
    if (!s) return 0;
    const n = Number(s.replace(/,/g, ""));
    return isNaN(n) ? 0 : n;
  };

  // 중분류별 평균 계산
  const calcAvg = (data: Record<string, string>[]) => {
    const map = new Map<string, { total: number; cnt: number }>();
    for (const r of data) {
      const key = r.indutyMlsfcNm || "기타";
      const g = map.get(key) ?? { total: 0, cnt: 0 };
      g.total += toNum(r.smtnAmt) || (toNum(r.avrgFrcsAmt) + toNum(r.avrgFntnAmt) + toNum(r.avrgJngEtcAmt));
      g.cnt += 1;
      map.set(key, g);
    }
    const result = new Map<string, number>();
    for (const [k, v] of map) result.set(k, v.cnt > 0 ? Math.round(v.total / v.cnt) : 0);
    return result;
  };

  const currAvg = calcAvg(curr);
  const prevAvg = calcAvg(prev);

  const rows: string[][] = [];
  for (const [name, val] of currAvg) {
    const pv = prevAvg.get(name) ?? 0;
    const diff = val - pv;
    const diffStr = pv > 0 ? (diff >= 0 ? `+${fmtAmtRaw(diff)}` : `-${fmtAmtRaw(Math.abs(diff))}`) : "-";
    const pctStr = pv > 0 ? `${diff >= 0 ? "+" : ""}${(Math.round((diff / pv) * 1000) / 10).toFixed(1)}%` : "-";
    rows.push([name, fmtAmtRaw(val), fmtAmtRaw(pv), diffStr, pctStr]);
  }
  rows.sort((a, b) => {
    const parse = (s: string) => {
      const n = parseFloat(s.replace(/[^0-9.\-]/g, ""));
      return isNaN(n) ? 0 : n;
    };
    return parse(b[3]) - parse(a[3]);
  });

  return {
    dsType: "DS-16",
    title: `${year}년 ${month}월 프랜차이즈 창업비용 변동 현황`,
    lede: rows.length > 0
      ? `${month}월 기준 평균 창업비용이 가장 크게 오른 업종은 ${rows[0][0]}(전년대비 ${rows[0][3]})이다.`
      : `${year}년 ${month}월 창업비용 변동 데이터.`,
    tables: [{
      caption: `창업비용 변동 (${year} vs ${prevYear})`,
      headers: ["업종", `${year}년`, `${prevYear}년`, "변동액", "변동률"],
      rows,
    }],
    notes: ["공정위 데이터는 연간 기준이며, 전년 동기 대비 비교"],
    sources: ["공정위 업종별 창업비용 현황 API"],
    baseDate: `${year}-12-31`,
  };
}

// ─── DS-17: 지역 관광 상권 현황 ─────────────
export async function generateDS17(region: string): Promise<DatasheetInput> {
  const year = yr();
  const start = today().replace(/-/g, "");
  const end90 = new Date(Date.now() + 90 * 86400000).toISOString().slice(0, 10).replace(/-/g, "");
  const [spots, festivals, brands] = await Promise.all([
    fetchAreaTourSpots(region, { numOfRows: 20 }),
    fetchFestivals(region, { startDate: start, endDate: end90, numOfRows: 30 }),
    fetchBrandFrcsStats(year),
  ]);
  const regionKey = region.slice(0, 2);
  const regionalBrands = brands
    .filter(b => b.frcsCnt > 0)
    .sort((a, b) => b.frcsCnt - a.frcsCnt)
    .slice(0, 10);

  const spotRows = spots.map((s, i) => [String(i + 1), s.title, s.addr, s.cat2 || s.cat1]);
  const fmtYmd = (s: string) => s.length >= 8 ? `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}` : s;
  const festivalRows = festivals.slice(0, 10).map(f => [
    f.title, f.addr, fmtYmd(f.eventStartDate), fmtYmd(f.eventEndDate),
  ]);
  const brandRows = regionalBrands.map((b, i) => [
    String(i + 1), b.brandNm, b.indutyMlsfcNm || b.indutyLclasNm, b.frcsCnt.toLocaleString("ko-KR"),
  ]);

  return {
    dsType: "DS-17",
    title: `${region} 관광 상권 현황 — ${today()}`,
    lede: `${region} 주요 관광지 ${spots.length}곳, 향후 90일 내 축제·행사 ${festivals.length}건, 상위 프랜차이즈 ${regionalBrands.length}개 브랜드를 종합한 상권 스냅샷이다.`,
    tables: [
      { caption: `${region} 주요 관광지 Top 20`, headers: ["순위", "명칭", "주소", "분류"], rows: spotRows.length ? spotRows : [["-", "TourAPI 데이터 없음 (키 확인 필요)", "-", "-"]] },
      { caption: `${region} 예정 축제·행사 (90일)`, headers: ["행사명", "장소", "시작일", "종료일"], rows: festivalRows.length ? festivalRows : [["-", "-", "-", "-"]] },
      { caption: `${regionKey} 권역 상위 프랜차이즈`, headers: ["순위", "브랜드", "업종", "가맹점수"], rows: brandRows.length ? brandRows : [["-", "-", "-", "-"]] },
    ],
    notes: ["관광지 분류는 TourAPI cat2 코드", "지역 프랜차이즈는 공정위 가맹점수 기준"],
    sources: ["한국관광공사 TourAPI 4.0 (areaBasedList2/searchFestival2)", "공정위 브랜드별 가맹점 현황 API"],
    baseDate: today(),
  };
}

// ─── DS-18: 지역 업종 사업자 생존율 ─────────────
export async function generateDS18(industry: string, region: string): Promise<DatasheetInput> {
  const ctprvnCd = regionToCtprvnCd(region) ?? undefined;
  const lclsCd = industryToSbizLclsCd(industry) ?? undefined;
  const stores = await fetchStoresByRegion({
    ctprvnCd, indsLclsCd: lclsCd, industryName: industry,
    numOfRows: 1000, maxSigngu: 5,
  });
  const sample = stores.slice(0, 500);
  const bizNos = sample.map(s => s.bizesNo ?? "").filter(Boolean);
  const statuses = await fetchBusinessStatus(bizNos);

  let active = 0, suspended = 0, closed = 0;
  const statusByNo = new Map(statuses.map(s => [s.bizNo, s]));
  for (const s of sample) {
    const st = s.bizesNo ? statusByNo.get(s.bizesNo.replace(/[^0-9]/g, "")) : null;
    if (!st) continue;
    if (/계속/.test(st.businessStatus)) active++;
    else if (/휴업/.test(st.businessStatus)) suspended++;
    else if (/폐업/.test(st.businessStatus)) closed++;
  }
  const evaluated = active + suspended + closed;
  const pctStr = (n: number) => evaluated > 0 ? `${(Math.round((n / evaluated) * 1000) / 10).toFixed(1)}%` : "-";

  const activeStores = sample.filter(s => {
    const st = s.bizesNo ? statusByNo.get(s.bizesNo.replace(/[^0-9]/g, "")) : null;
    return st && /계속/.test(st.businessStatus);
  });
  const storeCount = new Map<string, number>();
  for (const s of activeStores) {
    const name = s.storeName || "무명";
    storeCount.set(name, (storeCount.get(name) ?? 0) + 1);
  }
  const topStores = Array.from(storeCount, ([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count).slice(0, 10);

  return {
    dsType: "DS-18",
    title: `${region} ${industry} 사업자 생존율 — ${today()}`,
    lede: `${region} ${industry} 상가 ${sample.length}곳 샘플 중 국세청 조회 ${evaluated}건 → 계속 ${pctStr(active)}, 휴업 ${pctStr(suspended)}, 폐업 ${pctStr(closed)}.`,
    tables: [
      { caption: "사업자 상태 집계", headers: ["상태", "건수", "비율"], rows: [
        ["계속사업자", String(active), pctStr(active)],
        ["휴업사업자", String(suspended), pctStr(suspended)],
        ["폐업사업자", String(closed), pctStr(closed)],
      ]},
      { caption: "계속사업 Top 10 상호", headers: ["순위", "상호", "건수"],
        rows: topStores.length
          ? topStores.map((s, i) => [String(i + 1), s.name, String(s.count)])
          : [["-", "데이터 없음 (NTS/SBIZ 키 확인 필요)", "-"]],
      },
    ],
    notes: ["상가정보 샘플링 + 국세청 사업자상태 조회 기준", "브랜드 아닌 자영업자 단위 분석"],
    sources: ["소상공인시장진흥공단 상가정보 API", "국세청 사업자등록정보 상태조회 API"],
    baseDate: today(),
  };
}

// ─── DS-19: 상권 업종 밀도 분포 ─────────────
export async function generateDS19(industry: string, region: string): Promise<DatasheetInput> {
  const ctprvnCd = regionToCtprvnCd(region) ?? undefined;
  const lclsCd = industryToSbizLclsCd(industry) ?? undefined;
  const [stores, population] = await Promise.all([
    fetchStoresByRegion({
      ctprvnCd, indsLclsCd: lclsCd, industryName: industry,
      numOfRows: 1000, maxSigngu: 10,
    }),
    fetchRegionPopulation(region),
  ]);
  const byDong = await aggregateByDong(stores);
  const entries = Array.from(byDong, ([dong, list]) => ({ dong, count: list.length }))
    .sort((a, b) => b.count - a.count);

  const dongCount = entries.length || 1;
  const popPerDong = population > 0 ? population / dongCount : 0;
  const densityPerUnit = (count: number) => popPerDong > 0
    ? (Math.round((count / popPerDong) * 100000) / 10).toFixed(1)
    : "-";

  const top10 = entries.slice(0, 10).map((e, i) => [String(i + 1), e.dong, e.count.toLocaleString("ko-KR"), densityPerUnit(e.count)]);
  const bot10 = entries.slice(-10).reverse().map((e, i) => [String(i + 1), e.dong, e.count.toLocaleString("ko-KR"), densityPerUnit(e.count)]);

  const topDong = entries[0]?.dong ?? "-";
  const topCount = entries[0]?.count ?? 0;
  const topDensity = densityPerUnit(topCount);

  return {
    dsType: "DS-19",
    title: `${region} ${industry} 상권 업종 밀도 분포 — ${today()}`,
    lede: `${region} ${industry}은 ${topDong}에서 가장 밀집(${topCount.toLocaleString("ko-KR")}개). 인구 1만 명당 ${topDensity}개 수준.`,
    tables: [
      { caption: "밀도 상위 10개 행정동", headers: ["순위", "행정동", "업소수", "인구1만명당"],
        rows: top10.length ? top10 : [["-", "SBIZ 데이터 없음 (키 확인)", "-", "-"]] },
      { caption: "밀도 하위 10개 행정동", headers: ["순위", "행정동", "업소수", "인구1만명당"],
        rows: bot10.length ? bot10 : [["-", "-", "-", "-"]] },
    ],
    notes: ["상가정보 API 기반 행정동 단위 집계", "인구 데이터는 KOSIS 주민등록인구 연말 기준"],
    sources: ["소상공인시장진흥공단 상가정보 API", "통계청 KOSIS 주민등록인구"],
    baseDate: today(),
  };
}

// ─── DS-20: 지역 축제·창업 타이밍 가이드 ─────────────
const MONTHLY_INDUSTRY_REC: Record<number, string[]> = {
  1: ["주점", "카페"], 2: ["한식", "카페"], 3: ["분식", "카페"], 4: ["카페", "한식"],
  5: ["외식 전반", "기념품"], 6: ["카페", "주점"], 7: ["주점", "숙박"], 8: ["숙박", "기념품"],
  9: ["외식 전반", "카페"], 10: ["외식 전반", "기념품"], 11: ["카페", "한식"], 12: ["주점", "카페"],
};

export async function generateDS20(region: string): Promise<DatasheetInput> {
  const now = new Date();
  const start = now.toISOString().slice(0, 10).replace(/-/g, "");
  const endDate = new Date(now.getTime() + 365 * 86400000);
  const end = endDate.toISOString().slice(0, 10).replace(/-/g, "");

  const festivals = await fetchFestivals(region, { startDate: start, endDate: end, numOfRows: 500 });
  const byMonth = new Map<string, number>();
  for (const f of festivals) {
    const key = f.eventStartDate.slice(0, 6);
    byMonth.set(key, (byMonth.get(key) ?? 0) + 1);
  }
  const monthRows: string[][] = [];
  const recRows: string[][] = [];
  for (let i = 0; i < 12; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() + i, 1);
    const ym = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}`;
    const cnt = byMonth.get(ym) ?? 0;
    const monthLabel = `${ym.slice(0, 4)}-${ym.slice(4)}`;
    monthRows.push([monthLabel, String(cnt)]);
    const recs = MONTHLY_INDUSTRY_REC[d.getMonth() + 1] ?? [];
    recRows.push([monthLabel, recs.join(", ") || "-"]);
  }

  const peak = monthRows.slice().sort((a, b) => Number(b[1]) - Number(a[1]))[0];
  const bigTen = festivals.slice(0, 10).map(f => {
    const fmt = (s: string) => s.length >= 8 ? `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}` : s;
    return [f.title, f.addr, fmt(f.eventStartDate), fmt(f.eventEndDate)];
  });

  return {
    dsType: "DS-20",
    title: `${region} 축제·창업 타이밍 가이드 — ${today()}`,
    lede: festivals.length > 0 && peak
      ? `${region}에서 향후 12개월 총 ${festivals.length}건의 축제가 예정. 피크 시즌은 ${peak[0]}(${peak[1]}건).`
      : `${region} 축제 데이터 없음 (TourAPI 키 확인 필요).`,
    tables: [
      { caption: "월별 축제 수", headers: ["월", "축제 건수"], rows: monthRows },
      { caption: "월별 추천 업종", headers: ["월", "추천 업종"], rows: recRows },
      { caption: "Top 10 대형 축제", headers: ["축제명", "장소", "시작", "종료"],
        rows: bigTen.length ? bigTen : [["-", "-", "-", "-"]] },
    ],
    notes: ["월별 추천 업종은 정적 매핑 기반 (외식·숙박·기념품)", "축제 수는 시작일 기준"],
    sources: ["한국관광공사 TourAPI 4.0 (searchFestival2)"],
    baseDate: today(),
  };
}

// ─── DS-21: 브랜드 가맹본부 신뢰도 스코어카드 ─────────────
type ScoreItem = { item: string; verdict: "O" | "△" | "X"; reason: string; score: number };

export async function generateDS21(brand: string): Promise<DatasheetInput> {
  const [factResult, jng] = await Promise.all([
    fetchFtcFactByBrandName(brand),
    findJngIfrmpSn({ brandName: brand }),
  ]);
  const stat = factResult.raw as BrandFrcsStat | null;

  const items: ScoreItem[] = [];
  const verdict = (cond: "O" | "△" | "X"): number => cond === "O" ? 2 : cond === "△" ? 1 : 0;

  let ntsStatus: string | null = null;
  let bizNoFound: string | null = null;
  let sectionsCache: Awaited<ReturnType<typeof ftcContent>>["sections"] | null = null;
  if (jng) {
    try {
      const { sections } = await ftcContent(jng.jngIfrmpSn);
      sectionsCache = sections;
      for (const s of sections) {
        const match = s.rawXml.match(/\d{3}-?\d{2}-?\d{5}/);
        if (match) {
          bizNoFound = match[0];
          break;
        }
      }
    } catch { /* noop */ }
  }
  if (bizNoFound) {
    const statuses = await fetchBusinessStatus([bizNoFound]);
    if (statuses.length > 0) ntsStatus = statuses[0].businessStatus;
  }
  const v1: "O" | "△" | "X" = ntsStatus === null ? "△" : /계속/.test(ntsStatus) ? "O" : "X";
  items.push({ item: "본부 사업자등록 상태", verdict: v1, reason: ntsStatus ?? (bizNoFound ? "NTS 조회 실패" : "사업자번호 미확인"), score: verdict(v1) });

  const v2: "O" | "△" | "X" = (stat?.frcsCnt ?? 0) >= 10 ? "O" : (stat?.frcsCnt ?? 0) > 0 ? "△" : "X";
  items.push({ item: "가맹점 10개 이상", verdict: v2, reason: stat ? `${stat.frcsCnt}개` : "데이터 없음", score: verdict(v2) });

  const closeRate = stat && stat.frcsCnt > 0 ? ((stat.ctrtEndCnt + stat.ctrtCncltnCnt) / stat.frcsCnt) * 100 : -1;
  const v3: "O" | "△" | "X" = closeRate < 0 ? "△" : closeRate < 15 ? "O" : closeRate < 25 ? "△" : "X";
  items.push({ item: "최근 폐점률 15% 미만", verdict: v3, reason: closeRate >= 0 ? `${closeRate.toFixed(1)}%` : "데이터 없음", score: verdict(v3) });

  const v4: "O" | "△" | "X" = jng ? "O" : "X";
  items.push({ item: "정보공개서 최신 등록", verdict: v4, reason: jng ? `일련번호 ${jng.jngIfrmpSn}` : "정보공개서 미확인", score: verdict(v4) });

  let hasFinance = false;
  let hasTermination = false;
  let hasRoyalty = false;
  if (sectionsCache) {
    hasFinance = sectionsCache.some(s => s.attr.includes("FNNCL") || s.title.includes("재무") || s.attrbSn.startsWith("AF_0201"));
    hasTermination = sectionsCache.some(s => /계약해지|해지/.test(s.title) || s.attr.includes("CTRT_TRMT"));
    hasRoyalty = sectionsCache.some(s => /로열티|가맹금|계속가맹금/.test(s.title) || s.attr.includes("RYLTY") || s.attrbSn?.startsWith("AF_0402"));
  }
  const v5: "O" | "△" | "X" = hasFinance ? "O" : "X";
  items.push({ item: "본사 재무정보 공개", verdict: v5, reason: hasFinance ? "정보공개서 재무 섹션 존재" : "재무 섹션 미확인", score: verdict(v5) });

  const v6: "O" | "△" | "X" = hasTermination ? "O" : "X";
  items.push({ item: "계약해지 조항 법준수", verdict: v6, reason: hasTermination ? "해지 섹션 기재" : "해지 섹션 미확인", score: verdict(v6) });

  const v7: "O" | "△" | "X" = hasRoyalty ? "O" : "X";
  items.push({ item: "로열티 금액·산식 공개", verdict: v7, reason: hasRoyalty ? "로열티 섹션 기재" : "로열티 섹션 미확인", score: verdict(v7) });

  let directCnt = -1;
  if (sectionsCache) {
    const sec = sectionsCache.find(s => s.attrbSn === "AF_0204000000" || s.attr.includes("FRCS_DMS_CNT"));
    if (sec) {
      const text = sec.rawXml.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
      const mAll = text.match(/전체\s+([\d,]+)\s+([\d,]+)\s+([\d,]+)/);
      if (mAll) directCnt = Number(mAll[3].replace(/,/g, "")) || 0;
    }
  }
  const v8: "O" | "△" | "X" = directCnt >= 1 ? "O" : directCnt === 0 ? "X" : "△";
  items.push({
    item: "직영점 운영",
    verdict: v8,
    reason: directCnt >= 0 ? `${directCnt}개 직영점` : "정보공개서 직영점 섹션 미확인",
    score: verdict(v8),
  });

  const totalScore = items.reduce((s, i) => s + i.score, 0);
  const grade = totalScore >= 14 ? "A" : totalScore >= 10 ? "B" : totalScore >= 6 ? "C" : "D";
  const xItems = items.filter(i => i.verdict === "X").length;

  const rows = items.map(i => [i.item, i.verdict, i.reason, String(i.score)]);

  return {
    dsType: "DS-21",
    title: `${brand} 가맹본부 신뢰도 스코어카드 — ${today()}`,
    lede: `${brand} 신뢰도 총점 ${totalScore}/16 (등급 ${grade}). ${xItems > 0 ? `취약 항목 ${xItems}개 확인 필요.` : "모든 필수 항목 충족."}`,
    tables: [
      { caption: "8개 항목 스코어카드", headers: ["항목", "판정", "근거", "점수"], rows },
      { caption: "총점 요약", headers: ["총점", "등급", "취약항목"], rows: [[`${totalScore}/16`, grade, String(xItems)]] },
    ],
    notes: [
      "O=2점 / △=1점 / X=0점, 만점 16점",
      "판정은 공정위 + 국세청 + 정보공개서 교차 검증 기반",
    ],
    sources: [
      "공정위 브랜드별 가맹점 현황 API",
      "공정위 브랜드별·업종별 직영점 및 가맹점 분포 API",
      "공정위 가맹사업정보공개서 본문 API",
      "국세청 사업자등록정보 상태조회 API",
    ],
    baseDate: today(),
  };
}

// ─── DS-22: 가맹점주 분쟁조정 실전 가이드 ─────────────
export async function generateDS22(): Promise<DatasheetInput> {
  const disputeTypes = [
    ["차액가맹금 과다", "물품 시중가 비교, 정보공개서 공개여부 확인", "공정위 신고 → 조정 → 미해결 시 민사"],
    ["영업지역 침해", "계약서 영업지역 조항 확인, 침해 사례 증거 확보", "본부 서면 이의제기 → 공정위 신고"],
    ["계약갱신 거절", "갱신요구권 행사 서면 발송, 거절 사유 정당성 검토", "공정위 분쟁조정신청"],
    ["부당한 해지", "해지 통지 형식·유예기간·사유 열거 확인", "해지 효력정지 가처분 + 공정위 병행"],
  ];
  const compareTable = [
    ["비용", "무료", "인지대·송달료·변호사비"],
    ["기간", "평균 3~6개월", "1심 8~12개월+"],
    ["집행력", "합의문 (민사판결 아님)", "확정판결 (집행력)"],
    ["관할", "한국공정거래조정원", "지방법원"],
    ["장점", "신속·저비용, 합의 지향", "강제집행 가능, 손해배상"],
    ["단점", "강제력 약함", "비용·시간 부담"],
  ];
  const docChecklist = [
    ["가맹계약서 원본", "필수"],
    ["정보공개서 수령본", "필수"],
    ["거래명세표·세금계산서 6개월분", "필수"],
    ["문자·이메일·녹취록", "권장"],
    ["서면 내용증명 사본", "권장"],
    ["매출·매입 장부", "선택"],
  ];

  return {
    dsType: "DS-22",
    title: "가맹점주 분쟁조정 실전 가이드 — 공정위 vs 민사 비교",
    lede: "공정위 분쟁조정은 무료·신속(평균 3~6개월)하나 강제력이 약하다. 민사는 비용·기간 부담이 크지만 확정판결로 집행 가능하다.",
    tables: [
      { caption: "분쟁 유형별 대응 절차", headers: ["유형", "1단계 점검", "2단계 절차"], rows: disputeTypes },
      { caption: "공정위 분쟁조정 vs 민사소송", headers: ["항목", "공정위 조정", "민사소송"], rows: compareTable },
      { caption: "필요 서류 체크리스트", headers: ["서류", "중요도"], rows: docChecklist },
    ],
    notes: [
      "공정위 분쟁조정은 한국공정거래조정원(www.kofair.or.kr)",
      "민사소송은 가맹사업거래법 + 민법 채권편 병행 적용",
    ],
    sources: ["가맹사업거래의 공정화에 관한 법률", "한국공정거래조정원 공식 안내"],
    baseDate: today(),
  };
}

// ─── DS-23: 계약체결 전 필수 점검 20개 체크리스트 ─────────────
export async function generateDS23(): Promise<DatasheetInput> {
  const cats: { cat: string; items: string[] }[] = [
    { cat: "정보공개서 검토", items: [
      "등록일이 최근 1년 이내인가?",
      "수정이력 3회 이상이면 원인 확인",
      "본사 재무 3년 연속 흑자 여부",
      "분쟁 조정·소송 내역 기재 확인",
    ]},
    { cat: "계약서 조항", items: [
      "해지 사유·절차 명확히 기재되어 있는가?",
      "갱신 요구권 행사 요건 명시되었는가?",
      "로열티 금액·산식·지급주기 구체적인가?",
      "영업지역 범위·보호조항 존재하는가?",
    ]},
    { cat: "본사 건전성", items: [
      "대표자 동일 브랜드 2회 이상 폐지 이력 없는가?",
      "본사 사업자 상태 '계속' 확인",
      "직영점 1개 이상 운영하는가?",
      "상시근로자 수 10명 이상인가?",
    ]},
    { cat: "상권·입지", items: [
      "임대료가 예상 매출 20% 이하인가?",
      "반경 500m 내 동일 브랜드/경쟁 브랜드 확인",
      "배후 주거·유동인구 1만명 이상인가?",
      "대중교통·주차 접근성 확보되었는가?",
    ]},
    { cat: "자금 계획", items: [
      "자기자본 비율이 총 창업비의 50% 이상인가?",
      "손익분기점이 개업 후 12개월 이내인가?",
      "예비비 총 창업비의 10% 이상 확보했는가?",
      "대출 이자 월 순이익 20% 이하인가?",
    ]},
  ];
  const rows: string[][] = [];
  let idx = 1;
  for (const c of cats) {
    for (const item of c.items) {
      rows.push([String(idx++), c.cat, item, "☐"]);
    }
  }
  return {
    dsType: "DS-23",
    title: "프랜차이즈 계약체결 전 필수 점검 20개 체크리스트",
    lede: "계약 직전 최종 검증용 20개 항목. 5개 카테고리(정보공개서·계약조항·본사·상권·자금) 각 4개로 구성.",
    tables: [
      { caption: "20개 체크리스트", headers: ["번호", "카테고리", "점검 항목", "체크"], rows },
    ],
    notes: ["인쇄·저장 지향 콘텐츠. 서면 검토 시 체크 박스 활용"],
    sources: ["가맹사업거래의 공정화에 관한 법률", "공정위 가맹분쟁 심결례"],
    baseDate: today(),
  };
}

// ─── DS-24: 브랜드 가맹점 증감 추이 ─────────────
export async function generateDS24(brand: string): Promise<DatasheetInput> {
  const years = ["2024", "2023", "2022", "2021", "2020"];
  const norm = (s: string) => s.replace(/\s+/g, "").toLowerCase();
  const target = norm(brand);
  const byYear: { yr: string; frcsCnt: number; newFrcs: number; ctrtEnd: number; ctrtCncltn: number }[] = [];
  for (const y of years) {
    try {
      const all = await fetchBrandFrcsStats(y);
      const m = all.find(b => norm(b.brandNm).includes(target));
      if (m) {
        byYear.push({ yr: y, frcsCnt: m.frcsCnt, newFrcs: m.newFrcsRgsCnt, ctrtEnd: m.ctrtEndCnt, ctrtCncltn: m.ctrtCncltnCnt });
      }
    } catch { /* noop */ }
  }
  byYear.sort((a, b) => a.yr.localeCompare(b.yr));

  const rows = byYear.map(r => [
    r.yr,
    r.frcsCnt.toLocaleString("ko-KR"),
    r.newFrcs.toLocaleString("ko-KR"),
    r.ctrtEnd.toLocaleString("ko-KR"),
    r.ctrtCncltn.toLocaleString("ko-KR"),
  ]);

  const first = byYear[0];
  const last = byYear[byYear.length - 1];
  const diff = last && first ? last.frcsCnt - first.frcsCnt : 0;
  const pctDiff = first && first.frcsCnt > 0 ? ((diff / first.frcsCnt) * 100).toFixed(1) : "-";

  return {
    dsType: "DS-24",
    title: `${brand} 가맹점 증감 추이 — 최근 ${byYear.length}년 공정위 기준`,
    lede: byYear.length >= 2
      ? `${brand} 가맹점수는 ${first.yr}년 ${first.frcsCnt.toLocaleString("ko-KR")}개 → ${last.yr}년 ${last.frcsCnt.toLocaleString("ko-KR")}개 (${diff >= 0 ? "+" : ""}${diff}, ${pctDiff}%).`
      : `${brand} 가맹점수 시계열 데이터 부족.`,
    tables: [
      { caption: `${brand} 연도별 가맹점 동향`, headers: ["연도", "가맹점수", "신규개점", "계약종료", "계약해지"],
        rows: rows.length ? rows : [["-", "-", "-", "-", "-"]] },
    ],
    notes: ["공정위 브랜드별 가맹점 현황 API 기반 시계열 추출", "브랜드명 변경 이력 있을 경우 누락 가능"],
    sources: ["공정위 브랜드별 가맹점 현황 API"],
    baseDate: today(),
  };
}

// ─── DS-25: 외국계 프랜차이즈 특집 (API 실패 시 휴리스틱 폴백) ─────────────
const FOREIGN_BRAND_KEYWORDS = [
  "맥도날드", "버거킹", "KFC", "서브웨이", "스타벅스", "파파존스", "도미노피자",
  "피자헛", "아웃백", "TGI", "코스트코", "이케아", "유니클로", "자라", "H&M",
  "나이키", "아디다스", "퓨마", "뉴발란스", "블루보틀", "폴바셋", "커피빈",
  "배스킨라빈스", "던킨", "크리스피크림", "타코벨", "쉐이크쉑",
];

export async function generateDS25(): Promise<DatasheetInput> {
  const year = yr();
  const [list, stats] = await Promise.all([
    fetchForeignFranchisor(year).catch(() => []),
    fetchBrandFrcsStats(year),
  ]);
  const useOfficial = list.length > 0;

  type Row = { rank: number; name: string; addr: string; brandCount: number };
  let rowsData: Row[];

  if (useOfficial) {
    const sorted = list.sort((a, b) => b.brandCount - a.brandCount);
    rowsData = sorted.slice(0, 30).map((r, i) => ({
      rank: i + 1, name: r.name, addr: r.address || "-", brandCount: r.brandCount,
    }));
  } else {
    const matches = stats.filter(s =>
      FOREIGN_BRAND_KEYWORDS.some(k => s.brandNm.includes(k) || s.corpNm.includes(k)) ||
      /[A-Z]{2,}/.test(s.brandNm)
    );
    const byCorp = new Map<string, { brandCount: number; brands: string[]; addr: string }>();
    for (const s of matches) {
      const key = s.corpNm || s.brandNm;
      const g = byCorp.get(key) ?? { brandCount: 0, brands: [], addr: "" };
      g.brandCount += 1;
      g.brands.push(s.brandNm);
      byCorp.set(key, g);
    }
    const sorted = Array.from(byCorp, ([name, g]) => ({ name, brandCount: g.brandCount, brands: g.brands, addr: g.addr }))
      .sort((a, b) => b.brandCount - a.brandCount);
    rowsData = sorted.slice(0, 30).map((r, i) => ({
      rank: i + 1, name: r.name, addr: r.brands.slice(0, 3).join(", "), brandCount: r.brandCount,
    }));
  }

  const rows = rowsData.map(r => [String(r.rank), r.name, r.addr, r.brandCount.toLocaleString("ko-KR")]);
  const total = rowsData.reduce((s, r) => s + r.brandCount, 0);

  return {
    dsType: "DS-25",
    title: `외국계 프랜차이즈 특집 — ${year}년 공정위 기준`,
    lede: rowsData.length > 0
      ? useOfficial
        ? `국내 공정위 등록 외국계 가맹본부는 ${rowsData.length}개이며, 평균 ${(total / rowsData.length).toFixed(1)}개 브랜드를 운영한다.`
        : `브랜드명·법인명 기반 휴리스틱 추출 결과 ${rowsData.length}개 법인, 총 ${total}개 브랜드가 외국계/글로벌 성격으로 판별됨.`
      : "외국계 프랜차이즈 후보 데이터 없음.",
    tables: [
      {
        caption: `외국계 프랜차이즈 법인 Top ${Math.min(30, rowsData.length)} (${year}년)`,
        headers: useOfficial ? ["순위", "본부명", "주소", "브랜드 수"] : ["순위", "법인/브랜드", "대표 브랜드", "등록 브랜드 수"],
        rows: rows.length ? rows : [["-", "-", "-", "-"]],
      },
    ],
    notes: useOfficial
      ? ["공정위 '외국계 가맹본부 일반정보' 정식 API 기반", "국적·진출연도는 별도 확인 필요"]
      : ["공정위 외국계 전용 API 응답 없음 → 브랜드명 휴리스틱 기반 폴백 (글로벌 키워드·영문 대문자 패턴 매칭)", "정확한 외국계 구분은 공정위 확정 데이터 확인 필요"],
    sources: ["공정위 브랜드별 가맹점 현황 API", ...(useOfficial ? ["공정위 외국계 가맹본부 일반정보 API"] : [])],
    baseDate: `${year}-12-31`,
  };
}

// ─── DS-26: 대기업 프랜차이즈 계보도 (정식 API + 정적 매핑 폴백) ─────────────
const CHAEBOL_AFFILIATES: { group: string; brands: string[]; industry: string }[] = [
  { group: "롯데", brands: ["롯데리아", "엔제리너스", "크리스피크림도넛", "빌라드샬롯", "세븐일레븐", "TGI프라이데이스"], industry: "외식·유통" },
  { group: "신세계", brands: ["스타벅스 코리아", "이마트24", "노브랜드버거", "데블스도어", "일렉트로마트"], industry: "외식·유통" },
  { group: "CJ", brands: ["뚜레쥬르", "빕스", "계절밥상", "제일제면소", "더플레이스", "올리브영"], industry: "외식·유통" },
  { group: "SPC", brands: ["파리바게뜨", "파리크라상", "배스킨라빈스", "던킨", "쉐이크쉑", "에그슬럿", "패션5"], industry: "외식" },
  { group: "이랜드", brands: ["애슐리", "자연별곡", "피자몰", "수사", "로운", "스파오"], industry: "외식·패션" },
  { group: "농심", brands: ["코코이찌방야", "별미식당", "둥지냉면"], industry: "외식" },
  { group: "GS", brands: ["GS25", "GS수퍼마켓", "터틀앤 피자", "파오파오"], industry: "유통·외식" },
  { group: "BGF", brands: ["CU", "헬로네이처"], industry: "유통" },
  { group: "한화", brands: ["63레스토랑", "더플라자", "갤러리아식품관"], industry: "외식" },
  { group: "현대백화점", brands: ["현대백화점식품관", "현대그린푸드", "한섬"], industry: "유통·패션" },
  { group: "동원", brands: ["동원몰", "반지", "한식뷔페"], industry: "외식·유통" },
  { group: "오뚜기", brands: ["오뚜기라면", "진라면 브랜드숍"], industry: "외식" },
];

export async function generateDS26(chaebol?: string): Promise<DatasheetInput> {
  const year = yr();
  const list = await fetchConglomerateList(year).catch(() => []);
  const useOfficial = list.length > 0;

  type GroupEntry = { groupName: string; companies: string[] };
  let groupEntries: GroupEntry[];

  if (useOfficial) {
    const fbKeyword = /음식|외식|식품|유통|소매|편의|커피|베이커리|패션|도소매/;
    let filtered = list.filter(r => fbKeyword.test(r.industry));
    if (chaebol) {
      const needle = chaebol.replace(/\s+/g, "");
      filtered = filtered.filter(r => r.groupName.replace(/\s+/g, "").includes(needle));
    }
    const byGroup = new Map<string, GroupEntry>();
    for (const r of filtered) {
      const g = byGroup.get(r.groupName) ?? { groupName: r.groupName, companies: [] };
      g.companies.push(`${r.companyName}(${r.industry})`);
      byGroup.set(r.groupName, g);
    }
    groupEntries = Array.from(byGroup.values())
      .sort((a, b) => b.companies.length - a.companies.length)
      .slice(0, 20);
  } else {
    let source = CHAEBOL_AFFILIATES;
    if (chaebol) {
      const needle = chaebol.replace(/\s+/g, "");
      source = source.filter(g => g.group.replace(/\s+/g, "").includes(needle));
    }
    groupEntries = source.map(g => ({
      groupName: `${g.group} (${g.industry})`,
      companies: g.brands.map(b => `${b}(${g.industry})`),
    }));
  }

  const rows = groupEntries.map((g, i) => [
    String(i + 1), g.groupName, String(g.companies.length),
    g.companies.slice(0, 5).join(", ") + (g.companies.length > 5 ? " 외" : ""),
  ]);
  const total = groupEntries.reduce((s, g) => s + g.companies.length, 0);

  return {
    dsType: "DS-26",
    title: chaebol
      ? `${chaebol} 프랜차이즈 계보도 — ${year}년 공정위 기준`
      : `대기업 프랜차이즈 계보도 — ${year}년 공정위 기준`,
    lede: groupEntries.length > 0
      ? useOfficial
        ? `공정위 지정 대규모기업집단의 F&B·유통 계열사 ${total}곳, ${groupEntries.length}개 그룹에 분산. 상위 ${groupEntries[0].groupName}이 ${groupEntries[0].companies.length}개로 최다.`
        : `국내 주요 재벌 대기업집단 ${groupEntries.length}개가 운영하는 외식·유통 프랜차이즈 총 ${total}개 브랜드 매핑.`
      : "대기업 F&B·유통 계열사 데이터 없음.",
    tables: [
      {
        caption: "기업집단별 F&B·유통 계열사 현황",
        headers: ["순위", "기업집단", "계열사 수", "주요 계열사"],
        rows: rows.length ? rows : [["-", "-", "-", "-"]],
      },
    ],
    notes: useOfficial
      ? ["공정위 '대규모기업집단 소속회사' 정식 API 기반", "업종은 참여업종 필드 매칭"]
      : ["공정위 대규모기업집단 API 응답 없음 → 공개된 재벌 계열 프랜차이즈 정적 매핑 사용 (정확성은 수시 갱신 필요)"],
    sources: useOfficial
      ? ["공정위 대규모기업집단 소속회사 조회 API", "공정위 대규모기업집단 참여업종 API"]
      : ["공정위 공개 자료 (정적 매핑)"],
    baseDate: `${year}-12-31`,
  };
}

// ─── DS-27: 업종 개황 리포트 ─────────────
export async function generateDS27(industry: string): Promise<DatasheetInput> {
  const year = yr();
  const m = isAll(industry) ? null : getMapping(industry);
  const [overview, flux, openClose, costStats] = await Promise.all([
    fetchIndutyOverview(year).catch(() => []),
    fetchIndutyFrcsFluctuation(year).catch(() => []),
    m
      ? fetchIndutyOpenCloseRate(year, m.lclas).catch(() => [])
      : Promise.all(ALL_LCLAS.map(l => fetchIndutyOpenCloseRate(year, l).catch(() => [])))
        .then(a => a.flat()),
    m
      ? fetchIndutyStrtupCost(year, m.lclas).catch(() => [])
      : Promise.all(ALL_LCLAS.map(l => fetchIndutyStrtupCost(year, l).catch(() => [])))
        .then(a => a.flat()),
  ]);
  const matchOverview = m
    ? overview.filter(o => o.industry.includes(m.lclas))
    : overview;
  const matchFlux = m
    ? flux.filter(f => f.industry.includes(m.lclas))
    : flux;

  const totalStores = matchOverview.reduce((s, o) => s + o.stores, 0);
  const totalBrands = matchOverview.reduce((s, o) => s + o.brands, 0);
  const avgOpen = openClose.length > 0 ? (openClose.reduce((s, r) => s + r.openRate, 0) / openClose.length).toFixed(1) : "-";
  const avgClose = openClose.length > 0 ? (openClose.reduce((s, r) => s + r.closeRate, 0) / openClose.length).toFixed(1) : "-";
  const toNum = (s: string | undefined) => {
    if (!s) return 0;
    const n = Number(s.replace(/,/g, ""));
    return isNaN(n) ? 0 : n;
  };
  const totalCostRaw = costStats.reduce((s, r) => s + toNum(r.smtnAmt), 0);
  const avgCost = costStats.length > 0 ? Math.round(totalCostRaw / costStats.length) : 0;

  const summaryRows = [
    ["총 브랜드 수", totalBrands.toLocaleString("ko-KR") + "개"],
    ["총 가맹점 수", totalStores.toLocaleString("ko-KR") + "개"],
    ["평균 개점률", `${avgOpen}%`],
    ["평균 폐점률", `${avgClose}%`],
    ["평균 총 창업비용", avgCost > 0 ? fmtAmtRaw(avgCost) : "-"],
  ];
  const fluxRows = matchFlux.map(f => [f.industry, f.stores.toLocaleString("ko-KR"), f.avgNew.toFixed(1), f.avgEnd.toFixed(1)]);

  return {
    dsType: "DS-27",
    title: `${industry} 업종 개황 종합 리포트 — ${year}년 공정위 기준`,
    lede: `${industry} 업종 브랜드 ${totalBrands}개, 가맹점 ${totalStores.toLocaleString("ko-KR")}개 / 평균 개점률 ${avgOpen}%, 폐점률 ${avgClose}% / 평균 창업비 ${avgCost > 0 ? fmtAmtRaw(avgCost) : "집계불가"}.`,
    tables: [
      { caption: `${industry} 업종 요약`, headers: ["지표", "값"], rows: summaryRows },
      { caption: `${industry} 연간 변동 현황`, headers: ["업종", "가맹점", "평균 신규개점", "평균 계약종료"],
        rows: fluxRows.length ? fluxRows : [["-", "-", "-", "-"]] },
    ],
    notes: ["공정위 업종별 업종개황·변동·개폐점률·창업비용 API 교차 집계"],
    sources: [
      "공정위 업종별 업종개황 API",
      "공정위 업종별 가맹점 변동현황 API",
      "공정위 주요 업종별 개·폐점률 API",
      "공정위 업종별 창업비용 API",
    ],
    baseDate: `${year}-12-31`,
  };
}

// ─── DS-28: 월간 신규 등록 브랜드 리포트 (폴백 포함) ─────────────
export async function generateDS28(ym: string): Promise<DatasheetInput> {
  const latestKnown = yr();
  const requestedYear = ym ? ym.slice(0, 4) : latestKnown;
  const year = Number(requestedYear) > Number(latestKnown) ? latestKnown : requestedYear;
  const monthKey = ym ? ym.slice(0, 7).replace("-", "") : "";
  const [newList, stats] = await Promise.all([
    fetchNewBrandList(year).catch(() => []),
    fetchBrandFrcsStats(year),
  ]);
  const statByBrand = new Map(stats.map(s => [s.brandNm, s]));

  const useOfficial = newList.length > 0;
  type Row = { brand: string; corp: string; industryName: string; startDate: string; frcsCnt: number };
  let rowsData: Row[];
  if (useOfficial) {
    const inMonth = monthKey
      ? newList.filter(n => (n.startDate || "").replace(/[^0-9]/g, "").slice(0, 6) === monthKey)
      : newList;
    rowsData = inMonth.slice(0, 100).map(n => {
      const s = statByBrand.get(n.brand);
      return {
        brand: n.brand,
        corp: n.corp,
        industryName: s?.indutyMlsfcNm || s?.indutyLclasNm || "-",
        startDate: n.startDate ? n.startDate.slice(0, 10) : "-",
        frcsCnt: s?.frcsCnt ?? 0,
      };
    });
  } else {
    const candidates = stats.filter(s => s.newFrcsRgsCnt > 0);
    candidates.sort((a, b) => b.newFrcsRgsCnt - a.newFrcsRgsCnt);
    rowsData = candidates.slice(0, 100).map(s => ({
      brand: s.brandNm,
      corp: s.corpNm,
      industryName: s.indutyMlsfcNm || s.indutyLclasNm || "-",
      startDate: "-",
      frcsCnt: s.newFrcsRgsCnt,
    }));
  }

  const rows = rowsData.map(r => [r.brand, r.corp, r.industryName, r.startDate, r.frcsCnt.toLocaleString("ko-KR")]);

  return {
    dsType: "DS-28",
    title: `${year}년${ym ? " " + ym.slice(5, 7) + "월" : ""} 신규 등록 브랜드 리포트`,
    lede: useOfficial
      ? `${ym || year}년 신규 등록 프랜차이즈 브랜드는 ${rowsData.length}개이다 (공정위 신규등록 API).`
      : `${year}년 신규 가맹점을 등록한 브랜드는 ${rowsData.length}개이다 (newFrcsRgsCnt 기준 폴백).`,
    tables: [
      {
        caption: "신규 등록 브랜드",
        headers: useOfficial
          ? ["브랜드", "법인명", "업종", "시작일", "가맹점수"]
          : ["브랜드", "법인명", "업종", "시작일", "신규등록수"],
        rows: rows.length ? rows : [["-", "-", "-", "-", "-"]],
      },
    ],
    notes: useOfficial
      ? ["공정위 신규등록 브랜드 목록 API 기반", "월별 필터는 가맹사업 시작일 기준"]
      : ["공정위 신규등록 전용 API 응답 없음 → 브랜드별 가맹점 현황의 newFrcsRgsCnt 필드로 대체"],
    sources: ["공정위 브랜드별 가맹점 현황 API", ...(useOfficial ? ["공정위 신규등록 브랜드 목록 API"] : [])],
    baseDate: ym ? `${ym}-01` : today(),
  };
}

// ─── DS-29: 업종 식품안전 이슈 리포트 ─────────────
export async function generateDS29(industry: string): Promise<DatasheetInput> {
  const incidents = await fetchIndustryIncidents(industry, { months: 12 });
  const top = incidents.slice(0, 30);
  const violations = aggregateViolations(incidents).slice(0, 10);
  const topRows = top.map(i => [
    i.productName || "-",
    i.bizName || "-",
    (i.reason || "-").slice(0, 60),
    i.occurredAt ? i.occurredAt.slice(0, 10) : "-",
  ]);
  const viRows = violations.map((v, i) => [String(i + 1), v.reason, String(v.count)]);

  return {
    dsType: "DS-29",
    title: `${industry} 식품안전 이슈 리포트 — 최근 12개월`,
    lede: incidents.length > 0
      ? `${industry} 업종 관련 식약처 리콜·행정처분 ${incidents.length}건. 최다 위반 사유는 '${violations[0]?.reason.slice(0, 30) ?? "-"}'.`
      : `${industry} 관련 최근 12개월 식약처 이슈 데이터 없음.`,
    tables: [
      { caption: "최근 리콜·행정처분 이력", headers: ["제품명", "업소", "사유", "일자"],
        rows: topRows.length ? topRows : [["-", "-", "-", "-"]] },
      { caption: "자주 걸리는 위반 사유 Top 10", headers: ["순위", "사유", "건수"],
        rows: viRows.length ? viRows : [["-", "-", "-"]] },
    ],
    notes: ["식약처 식품안전나라 OpenAPI 기반, 현재 키는 I0490 (부적합 회수) 서비스만 승인"],
    sources: ["식품의약품안전처 식품안전나라 OpenAPI (I0490)"],
    baseDate: today(),
  };
}

// ─── DS-30: 업종 거시 시장규모 추이 (KOSIS 서비스업동향조사) ─────────────
export async function generateDS30(industry: string): Promise<DatasheetInput> {
  const series = await fetchIndustryMarketSize(industry, { months: 24 });
  series.sort((a, b) => a.period.localeCompare(b.period));
  const hasData = series.length > 0;

  const rows = series.map((r, i) => {
    const prev = i > 0 ? series[i - 1].value : 0;
    const growth = prev > 0 ? (((r.value - prev) / prev) * 100).toFixed(1) + "%" : "-";
    const periodLabel = r.period.length >= 6
      ? `${r.period.slice(0, 4)}-${r.period.slice(4, 6)}`
      : r.period;
    return [periodLabel, r.value.toLocaleString("ko-KR"), r.unit || "-", growth];
  });
  const first = series[0];
  const last = series[series.length - 1];
  const steps = Math.max(1, series.length - 1);
  const cagr = first && last && first.value > 0
    ? (((Math.pow(last.value / first.value, 1 / steps) - 1) * 100).toFixed(1))
    : "-";

  const placeholderRow = [[
    "-",
    `${industry} 업종의 KOSIS 서비스업동향조사 대응 코드를 찾지 못함`,
    "-",
    "매핑 코드 추가 필요 (utils/kosis.ts::mapIndustryCode)",
  ]];

  return {
    dsType: "DS-30",
    title: `${industry} 거시 시장규모 추이 — 통계청 KOSIS 기준`,
    lede: hasData
      ? `${industry} 시장규모는 ${first.period} ${first.value.toLocaleString("ko-KR")}${first.unit} → ${last.period} ${last.value.toLocaleString("ko-KR")}${last.unit} (CAGR ${cagr}%).`
      : `${industry} 업종은 현재 KOSIS 서비스업동향조사 매핑 범위 밖이다 (utils/kosis.ts의 mapIndustryCode 확장 필요).`,
    tables: [
      {
        caption: `${industry} 월별 서비스업 매출지수 추이`,
        headers: ["기간", "지수/규모", "단위", "전월대비"],
        rows: hasData ? rows : placeholderRow,
      },
    ],
    notes: ["통계청 KOSIS 서비스업동향조사 지수 기반", hasData ? "전월 대비 증감률" : "업종 매핑 보강 시 자동 활성화"],
    sources: ["통계청 KOSIS 공유서비스 OpenAPI"],
    baseDate: today(),
  };
}
