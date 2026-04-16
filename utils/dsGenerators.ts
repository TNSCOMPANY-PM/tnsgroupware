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
  type BrandFrcsStat,
  type IndutyLclas,
} from "./ftcDataPortal";
import {
  fetchFtcFactByBrandName,
  findJngIfrmpSn,
  ftcContent,
} from "./ftcFranchise";
import { extractFactsFromContent } from "./ftcContentParser";

// ─── 업종 매핑 ────────────────────────────────
type IndustryMapping = { lclas: IndutyLclas; filter: string };

const INDUSTRY_MAP: Record<string, IndustryMapping> = {
  치킨: { lclas: "외식", filter: "치킨" },
  카페: { lclas: "외식", filter: "커피" },
  편의점: { lclas: "도소매", filter: "편의점" },
  피자: { lclas: "외식", filter: "피자" },
  한식: { lclas: "외식", filter: "한식" },
  분식: { lclas: "외식", filter: "분식" },
  주점: { lclas: "외식", filter: "주점" },
  기타: { lclas: "외식", filter: "" },
};

function getMapping(industry: string): IndustryMapping {
  return INDUSTRY_MAP[industry] ?? { lclas: "외식", filter: industry };
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
  const m = getMapping(industry);
  const year = yr();
  const raw = await fetchIndutyStrtupCost(year, m.lclas);

  // 필터: 중분류에 filter 키워드 포함
  const filtered = m.filter
    ? raw.filter(r => (r.indutyMlsfcNm ?? "").includes(m.filter))
    : raw;

  const toNum = (s: string | undefined) => {
    if (!s) return 0;
    const n = Number(s.replace(/,/g, ""));
    return isNaN(n) ? 0 : n;
  };

  // 실제 API 필드: avrgFrcsAmt(가맹금), avrgFntnAmt(교육비), avrgJngEtcAmt(기타), smtnAmt(합계)
  const rows: string[][] = [];
  const source = filtered.length > 0 ? filtered : await fetchIndutyStrtupCost(year, m.lclas);

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
  const lede = topRow
    ? `${industry} 프랜차이즈 평균 창업비용은 ${topRow[1]}이다. (${year}년 공정위 정보공개서 기준)`
    : `${industry} 프랜차이즈 창업비용 데이터. (${year}년 공정위 기준)`;

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
    ],
    sources: ["공정위 가맹사업정보공개서", "공공데이터포털 업종별 창업비용 현황 API"],
    baseDate: `${year}-12-31`,
  };
}

// ─── DS-02: 업종별 폐점률 순위표 ─────────────
export async function generateDS02(industry: string): Promise<DatasheetInput> {
  const m = getMapping(industry);
  const year = yr();
  const all = await fetchBrandFrcsStats(year);

  // 업종 필터
  const filtered = m.filter
    ? all.filter(b => b.indutyLclasNm.includes(m.lclas) && b.indutyMlsfcNm.includes(m.filter))
    : all.filter(b => b.indutyLclasNm.includes(m.lclas));

  // 중분류별 집계
  const groups = new Map<string, { frcsCnt: number; ctrtEnd: number; ctrtCncltn: number; newFrcs: number }>();
  for (const b of filtered) {
    const key = b.indutyMlsfcNm || "기타";
    const g = groups.get(key) ?? { frcsCnt: 0, ctrtEnd: 0, ctrtCncltn: 0, newFrcs: 0 };
    g.frcsCnt += b.frcsCnt;
    g.ctrtEnd += b.ctrtEndCnt;
    g.ctrtCncltn += b.ctrtCncltnCnt;
    g.newFrcs += b.newFrcsRgsCnt;
    groups.set(key, g);
  }

  type Row = { name: string; frcsCnt: number; closeRate: number; ctrtEnd: number; ctrtCncltn: number; newFrcs: number };
  const ranked: Row[] = [];
  for (const [name, g] of groups) {
    const closed = g.ctrtEnd + g.ctrtCncltn;
    const rate = g.frcsCnt > 0 ? Math.round((closed / g.frcsCnt) * 1000) / 10 : 0;
    ranked.push({ name, frcsCnt: g.frcsCnt, closeRate: rate, ctrtEnd: g.ctrtEnd, ctrtCncltn: g.ctrtCncltn, newFrcs: g.newFrcs });
  }
  ranked.sort((a, b) => b.closeRate - a.closeRate);

  const rows = ranked.slice(0, 20).map((r, i) => [
    String(i + 1),
    r.name,
    r.frcsCnt.toLocaleString("ko-KR"),
    `${r.closeRate}%`,
    r.newFrcs.toLocaleString("ko-KR"),
    r.ctrtEnd.toLocaleString("ko-KR"),
    r.ctrtCncltn.toLocaleString("ko-KR"),
  ]);

  const top = ranked[0];
  const lede = top
    ? `${year}년 폐점률이 가장 높은 업종은 ${top.name}(${top.closeRate}%)이다.`
    : `${year}년 ${industry} 폐점률 데이터.`;

  return {
    dsType: "DS-02",
    title: `프랜차이즈 업종별 폐점률 순위 — ${year}년 공정위 기준`,
    lede,
    tables: [{
      caption: `업종별 폐점률 순위 (${year}년)`,
      headers: ["순위", "업종(중분류)", "가맹점수", "폐점률", "신규개점", "계약종료", "계약해지"],
      rows,
    }],
    notes: [
      "폐점률 = (계약종료 + 계약해지) / 가맹점수 × 100",
      "전년도 정보공개서 신고 기준",
    ],
    sources: ["공정위 브랜드별 가맹점 현황 API"],
    baseDate: `${year}-12-31`,
  };
}

// ─── DS-03: 업종별 월평균매출 순위 ─────────────
export async function generateDS03(industry: string): Promise<DatasheetInput> {
  const m = getMapping(industry);
  const year = yr();
  const all = await fetchBrandFrcsStats(year);

  const filtered = m.filter
    ? all.filter(b => b.indutyMlsfcNm.includes(m.filter) && b.avrgSlsAmt > 0)
    : all.filter(b => b.indutyLclasNm.includes(m.lclas) && b.avrgSlsAmt > 0);

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
  const lede = topB
    ? `${industry} 프랜차이즈 중 월평균매출 1위는 ${topB.brandNm}(${fmtAmt(topB.avrgSlsAmt)})이다.`
    : `${industry} 프랜차이즈 매출 순위 데이터.`;

  return {
    dsType: "DS-03",
    title: `${industry} 프랜차이즈 월평균매출 순위 — ${year}년 공정위 기준`,
    lede,
    tables: [{
      caption: `${industry} 월평균매출 TOP 20 (${year}년)`,
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
  const m = getMapping(industry);
  const year = yr();
  const raw = await fetchAreaIndutyAvr(year, m.lclas);

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

  const m = getMapping(industry);

  // 지역별 집계
  type RegData = { name: string; frcsCnt: number };
  const regionMap = new Map<string, RegData>();
  for (const r of raw) {
    const rName = r.areaNm ?? r.signguNm ?? "기타";
    if (m.filter && !(r.indutyMlsfcNm ?? "").includes(m.filter)) continue;
    if (!m.filter && !(r.indutyLclasNm ?? "").includes(m.lclas)) continue;
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
  const m = getMapping(industry);
  const year = yr();
  const all = await fetchBrandFrcsStats(year);

  // 해당 업종 상위 10개 (가맹점수 기준)
  const filtered = (m.filter
    ? all.filter(b => b.indutyMlsfcNm.includes(m.filter))
    : all.filter(b => b.indutyLclasNm.includes(m.lclas))
  ).filter(b => b.frcsCnt >= 10)
   .sort((a, b) => b.frcsCnt - a.frcsCnt)
   .slice(0, 10);

  const rows: string[][] = [];
  // 정보공개서에서 로열티 추출 시도 (병렬, 최대 5개)
  const targets = filtered.slice(0, 5);
  const results = await Promise.allSettled(
    targets.map(async (b) => {
      const item = await findJngIfrmpSn({ brandName: b.brandNm, corpName: b.corpNm });
      if (!item) return { brand: b.brandNm, royalty: "정보 없음" };
      const { sections } = await ftcContent(item.jngIfrmpSn);
      // AF_0402 or 로열티 관련 섹션 탐색
      const royaltySec = sections.find(s =>
        s.attr.includes("RYLTY") || s.title.includes("로열티") || s.attrbSn === "AF_0402000000"
      );
      if (!royaltySec) return { brand: b.brandNm, royalty: "정보공개서 미기재" };
      const text = royaltySec.rawXml.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
      // 금액 또는 비율 추출
      const amtMatch = text.match(/(\d[\d,]*)\s*(?:천원|만원|원)/);
      const pctMatch = text.match(/(\d+\.?\d*)\s*%/);
      const royalty = amtMatch ? amtMatch[0] : pctMatch ? pctMatch[0] : text.slice(0, 60);
      return { brand: b.brandNm, royalty };
    })
  );

  for (const r of results) {
    if (r.status === "fulfilled") {
      rows.push([r.value.brand, r.value.royalty]);
    }
  }

  // 나머지는 "미조회"
  for (const b of filtered.slice(5)) {
    rows.push([b.brandNm, "미조회 (정보공개서 개별 확인 필요)"]);
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
      "상위 5개 브랜드만 자동 조회, 나머지는 개별 확인 필요",
    ],
    sources: ["공정위 가맹사업정보공개서 본문 API"],
    baseDate: `${year}-12-31`,
  };
}

// ─── DS-07: 직영점 비율 순위표 ─────────────
// 직영점 데이터는 정보공개서 AF_0204에서 추출 가능하나 개별 호출 비용 큼
// → BrandFrcsStats 의 frcsCnt 대비 정보공개서의 직영점수 비교
export async function generateDS07(industry: string): Promise<DatasheetInput> {
  const m = getMapping(industry);
  const year = yr();
  const all = await fetchBrandFrcsStats(year);

  const filtered = (m.filter
    ? all.filter(b => b.indutyMlsfcNm.includes(m.filter))
    : all.filter(b => b.indutyLclasNm.includes(m.lclas))
  ).filter(b => b.frcsCnt >= 5)
   .sort((a, b) => b.frcsCnt - a.frcsCnt)
   .slice(0, 15);

  // 상위 5개 브랜드 정보공개서에서 직영점수 추출
  const results = await Promise.allSettled(
    filtered.slice(0, 5).map(async (b) => {
      const item = await findJngIfrmpSn({ brandName: b.brandNm, corpName: b.corpNm });
      if (!item) return { brand: b.brandNm, frcsCnt: b.frcsCnt, directCnt: 0, found: false };
      const { sections } = await ftcContent(item.jngIfrmpSn);
      // AF_0204 : 가맹점 및 직영점 총 수
      const sec = sections.find(s => s.attrbSn === "AF_0204000000" || s.attr.includes("FRCS_DMS_CNT"));
      if (!sec) return { brand: b.brandNm, frcsCnt: b.frcsCnt, directCnt: 0, found: false };
      const text = sec.rawXml.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
      // "전체 <total> <가맹> <직영>" 패턴에서 직영 추출
      const mAll = text.match(/전체\s+([\d,]+)\s+([\d,]+)\s+([\d,]+)/);
      const directCnt = mAll ? Number(mAll[3].replace(/,/g, "")) || 0 : 0;
      return { brand: b.brandNm, frcsCnt: b.frcsCnt, directCnt, found: true };
    })
  );

  const rows: string[][] = [];
  for (const r of results) {
    if (r.status === "fulfilled" && r.value.found) {
      const v = r.value;
      const totalStores = v.frcsCnt + v.directCnt;
      const ratio = totalStores > 0 ? `${(Math.round((v.directCnt / totalStores) * 1000) / 10).toFixed(1)}%` : "-";
      rows.push([v.brand, String(v.directCnt), v.frcsCnt.toLocaleString("ko-KR"), ratio]);
    }
  }

  // 직영비율 내림차순
  rows.sort((a, b) => parseFloat(b[3]) - parseFloat(a[3]));

  return {
    dsType: "DS-07",
    title: `${industry} 프랜차이즈 직영점 비율 순위 — ${year}년 공정위 기준`,
    lede: rows.length > 0
      ? `직영점 비율이 가장 높은 브랜드는 ${rows[0][0]}(${rows[0][3]})이다.`
      : `${industry} 프랜차이즈 직영점 비율 데이터.`,
    tables: [{
      caption: `${industry} 직영점 비율 (${year}년, 상위 브랜드)`,
      headers: ["브랜드", "직영점수", "가맹점수", "직영비율"],
      rows,
    }],
    notes: [
      "직영점 데이터는 정보공개서 본문 기준이며, 상위 5개 브랜드만 자동 조회",
      "직영비율 = 직영점수 / (직영점수 + 가맹점수) × 100",
    ],
    sources: ["공정위 가맹사업정보공개서 본문 API", "공정위 브랜드별 가맹점 현황 API"],
    baseDate: `${year}-12-31`,
  };
}

// ─── DS-08: 월간 신규 브랜드 리스트 ─────────────
export async function generateDS08(industry: string): Promise<DatasheetInput> {
  const year = yr();
  // ftcList 에서 최근 연도 목록 가져와 업종 매핑
  const all = await fetchBrandFrcsStats(year);
  const m = getMapping(industry);

  // 신규등록 브랜드: newFrcsRgsCnt > 0 이면서 frcsCnt 가 작은 (신규)
  const newBrands = (m.filter
    ? all.filter(b => b.indutyMlsfcNm.includes(m.filter))
    : all.filter(b => b.indutyLclasNm.includes(m.lclas))
  ).filter(b => b.frcsCnt > 0 && b.frcsCnt <= 20) // 소규모 = 신규 추정
   .sort((a, b) => b.newFrcsRgsCnt - a.newFrcsRgsCnt)
   .slice(0, 30);

  const rows = newBrands.map(b => [
    b.brandNm,
    b.corpNm,
    b.indutyMlsfcNm || b.indutyLclasNm,
    b.frcsCnt.toLocaleString("ko-KR"),
    b.newFrcsRgsCnt.toLocaleString("ko-KR"),
  ]);

  return {
    dsType: "DS-08",
    title: `${year}년 신규 등록 프랜차이즈 브랜드 — ${industry} 업종`,
    lede: `${year}년 ${industry} 업종 신규·소규모 프랜차이즈 브랜드는 총 ${rows.length}개이다.`,
    tables: [{
      caption: `${industry} 신규·소규모 브랜드 (${year}년, 가맹점 20개 이하)`,
      headers: ["브랜드", "법인명", "업종", "가맹점수", "신규등록"],
      rows,
    }],
    notes: ["가맹점수 20개 이하 브랜드를 신규·소규모로 분류", "실제 등록연도는 정보공개서 등록일 기준 별도 확인 필요"],
    sources: ["공정위 브랜드별 가맹점 현황 API"],
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

// ─── DS-12~14: 법령 (LAW_API_KEY 대기) ─────────
function lawStub(dsType: string, title: string): DatasheetInput {
  return {
    dsType,
    title,
    lede: "국가법령정보 API 키 발급 대기 중. 발급 후 자동 연결 예정.",
    tables: [{ caption: "법령 데이터", headers: ["조항", "내용"], rows: [["대기", "LAW_API_KEY 미설정"]] }],
    sources: ["국가법령정보센터 (law.go.kr)"],
    baseDate: today(),
  };
}

export function generateDS12(): DatasheetInput {
  return lawStub("DS-12", "가맹사업거래법 핵심 10개 조항 — 예비 창업자 필독");
}

export function generateDS13(): DatasheetInput {
  return lawStub("DS-13", "차액가맹금이란? — 뜻, 구조, 주의사항");
}

export function generateDS14(): DatasheetInput {
  return lawStub("DS-14", "프랜차이즈 계약해지 조건과 절차 — 가맹사업거래법 기준");
}

// ─── DS-15: 월간 업종 개폐점 현황 ─────────────
export async function generateDS15(industry: string, ym: string): Promise<DatasheetInput> {
  // 월간이지만 FTC 데이터는 연단위 → 최신 연도 데이터 활용
  const year = ym ? ym.slice(0, 4) : yr();
  const month = ym ? ym.slice(5, 7) : "12";
  const m = getMapping(industry);
  const all = await fetchBrandFrcsStats(year);

  const filtered = m.filter
    ? all.filter(b => b.indutyMlsfcNm.includes(m.filter))
    : all.filter(b => b.indutyLclasNm.includes(m.lclas));

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
  const m = getMapping(industry);

  // 현재 연도 + 전년도 비교
  const prevYear = String(Number(year) - 1);
  const [curr, prev] = await Promise.all([
    fetchIndutyStrtupCost(year, m.lclas),
    fetchIndutyStrtupCost(prevYear, m.lclas).catch(() => [] as Record<string, string>[]),
  ]);

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
