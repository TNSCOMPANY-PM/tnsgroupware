/**
 * 공정위 가맹사업거래 OpenAPI (franchise.ftc.go.kr/api/search.do) 래퍼.
 * 인증키: FTC_FRANCHISE_KEY (URL-encoded, 40자).
 *
 * 3개 엔드포인트:
 *   - type=list    : 연도별 정보공개서 목록 (jngIfrmpSn 탐색용)
 *   - type=title   : 정보공개서 목차 (tocObj, attrbMnno 포함)
 *   - type=content : 정보공개서 본문 XML (<section><h1 attr="..."><table>...)
 *
 * 주의:
 *   - 기본 curl User-Agent 는 차단됨 → Mozilla UA 필수
 *   - list API 는 연도별 ~232~800건 범위 (전체 브랜드 X, 대형 브랜드 중심)
 *     → 전체 브랜드 데이터는 ftcDataPortal.fetchBrandFrcsStats 사용
 */

import { findBrandFrcsStat } from "@/utils/ftcDataPortal";

const FTC_BASE = "https://franchise.ftc.go.kr/api/search.do";

function getKey(): string {
  const k = process.env.FTC_FRANCHISE_KEY;
  if (!k) throw new Error("[ftcFranchise] FTC_FRANCHISE_KEY 미설정");
  // env 는 URL-encoded 포맷이므로 한 번 decode 해서 URLSearchParams 재인코딩에 넘긴다
  // (decode 후 재encode 하면 원본 바이트 동일 유지)
  return k.includes("%") ? decodeURIComponent(k) : k;
}

async function fetchXml(url: string): Promise<string> {
  const r = await fetch(url, {
    cache: "no-store",
    headers: { "User-Agent": "Mozilla/5.0" },
  });
  if (!r.ok) throw new Error(`[ftcFranchise] HTTP ${r.status} ${url}`);
  const text = await r.text();
  if (text.includes("<errorCn>") || text.includes("<OpenAPI_ServiceResponse>")) {
    const err =
      text.match(/<errorCn>([^<]+)<\/errorCn>/)?.[1] ??
      text.match(/<returnAuthMsg>([^<]+)<\/returnAuthMsg>/)?.[1] ??
      text.slice(0, 200);
    throw new Error(`[ftcFranchise] API Error: ${err}`);
  }
  return text;
}

function parseListItems(xml: string): Record<string, string>[] {
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

// ───────────────────────────────────────────────
// 1. 정보공개서 목록 조회
// ───────────────────────────────────────────────
export type FtcListItem = {
  jngIfrmpSn: string;      // 정보공개서 일련번호 (후속 조회 PK)
  corpNm: string;          // 가맹본부 법인명
  brandNm: string;         // 영업표지 (브랜드명)
  brno: string;            // 사업자등록번호
  jngIfrmpRgsno: string;   // 정보공개서 등록번호
  viwerUrl: string;        // 뷰어 URL
};

export async function ftcList(params: {
  yr: string;
  pageNo?: number;
  numOfRows?: number;
}): Promise<FtcListItem[]> {
  const qs = new URLSearchParams({
    type: "list",
    serviceKey: getKey(),
    yr: params.yr,
    pageNo: String(params.pageNo ?? 1),
    numOfRows: String(params.numOfRows ?? 1000),
  });
  const xml = await fetchXml(`${FTC_BASE}?${qs.toString()}`);
  const raw = parseListItems(xml);
  return raw.map(r => ({
    jngIfrmpSn: r.jngIfrmpSn ?? "",
    corpNm: r.corpNm ?? "",
    brandNm: r.brandNm ?? "",
    brno: r.brno ?? "",
    jngIfrmpRgsno: r.jngIfrmpRgsno ?? "",
    viwerUrl: r.viwerUrl ?? "",
  }));
}

/** 연도별 전체 페이지 합산. list API 는 연 1000건 이내라 보통 1페이지로 끝. */
export async function ftcListAll(yr: string): Promise<FtcListItem[]> {
  const all: FtcListItem[] = [];
  for (let pageNo = 1; pageNo <= 10; pageNo++) {
    const page = await ftcList({ yr, pageNo, numOfRows: 1000 });
    all.push(...page);
    if (page.length < 1000) break;
  }
  return all;
}

// ───────────────────────────────────────────────
// 2. 목차 조회 (tocObj 평면 리스트)
// ───────────────────────────────────────────────
export type FtcTocObj = {
  attrbMnno: string;  // 섹션 코드 (AF_0100000000 등)
  level: string;      // 1, 2, 3
  hasChild: boolean;
  title: string;
};

export async function ftcTitle(jngIfrmpSn: string): Promise<FtcTocObj[]> {
  const qs = new URLSearchParams({
    type: "title",
    serviceKey: getKey(),
    jngIfrmpSn,
  });
  const xml = await fetchXml(`${FTC_BASE}?${qs.toString()}`);
  const items: FtcTocObj[] = [];
  const re = /<tocObj\s+attrbMnno="([^"]*)"\s+level="([^"]*)"\s+hasChild="([^"]*)"[^>]*>\s*<title>([\s\S]*?)<\/title>\s*<\/tocObj>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml)) !== null) {
    items.push({
      attrbMnno: m[1],
      level: m[2],
      hasChild: m[3] === "true",
      title: m[4].replace(/<!\[CDATA\[|\]\]>/g, "").trim(),
    });
  }
  return items;
}

// ───────────────────────────────────────────────
// 3. 본문 조회 — 섹션별 원문 XML 반환
// ───────────────────────────────────────────────
export type FtcContentSection = {
  attr: string;       // JNGHDQRTRS_GNRL_STUS 등
  attrbSn: string;    // AF_0100000000 등
  title: string;
  levl: string;       // "1", "2", "3"
  rawXml: string;     // 섹션 원문 XML (테이블 포함)
};

/**
 * 본문 XML 을 h1 기준으로 슬라이싱.
 * <section> 태그가 중첩돼 있어 <section>...</section> 매칭은 실패함.
 * 대신 각 <h1 attrb_sn="..." attr="..." title="..."> 위치를 찾아 다음 h1 까지 잘라낸다.
 */
export function splitSectionsByH1(raw: string): FtcContentSection[] {
  const h1Re = /<h([1-9])\s+attrb_sn="([^"]*)"\s+attr="([^"]*)"\s+title="([^"]*)"[^>]*>/g;
  const matches: { attrbSn: string; attr: string; title: string; start: number }[] = [];
  let mm: RegExpExecArray | null;
  while ((mm = h1Re.exec(raw)) !== null) {
    matches.push({ attrbSn: mm[2], attr: mm[3], title: mm[4], start: mm.index });
  }
  const sections: FtcContentSection[] = [];
  for (let i = 0; i < matches.length; i++) {
    const end = i + 1 < matches.length ? matches[i + 1].start : raw.length;
    const body = raw.slice(matches[i].start, end);
    // level 추론: attrbSn 의 0 개수로 대략 결정 (AF_01000000 level=1, AF_01010000 level=2, AF_01010100 level=3)
    const code = matches[i].attrbSn.replace(/^AF_/, "");
    let levl = "1";
    if (/^\d{2}0{8}$/.test(code)) levl = "1";
    else if (/^\d{4}0{6}$/.test(code)) levl = "2";
    else if (/^\d{6}0{4}$/.test(code)) levl = "3";
    else if (/^\d{8}0{2}$/.test(code)) levl = "4";
    sections.push({
      attrbSn: matches[i].attrbSn,
      attr: matches[i].attr,
      title: matches[i].title,
      levl,
      rawXml: body,
    });
  }
  return sections;
}

export async function ftcContent(jngIfrmpSn: string): Promise<{
  raw: string;
  sections: FtcContentSection[];
}> {
  const qs = new URLSearchParams({
    type: "content",
    serviceKey: getKey(),
    jngIfrmpSn,
  });
  const raw = await fetchXml(`${FTC_BASE}?${qs.toString()}`);
  return { raw, sections: splitSectionsByH1(raw) };
}

// ───────────────────────────────────────────────
// 4. 브랜드/법인명 → jngIfrmpSn 매칭
// ───────────────────────────────────────────────
function normalize(s: string): string {
  return s
    .replace(/\s+/g, "")
    .replace(/[()（）㈜]/g, "")
    .replace(/^주식회사|^\(주\)/g, "")
    .toLowerCase();
}

/**
 * 브랜드명으로 공정위 정보공개서 요약 블록을 텍스트로 반환.
 * 근거: ftcDataPortal.findBrandFrcsStat (브랜드별 가맹점 현황).
 * 실패/미공개 시 ok:false + "공식자료 미공개" 블록.
 */
export async function fetchFtcFactByBrandName(brandName: string): Promise<{
  ok: boolean;
  factBlock: string;
  raw: unknown;
}> {
  try {
    const stat = await findBrandFrcsStat({ brandName });
    if (!stat) {
      return { ok: false, factBlock: `${brandName}: 공식자료 미공개`, raw: null };
    }
    // FTC OpenAPI frcsCnt 는 "해당 연도 정보공개서 등록 기준치".
    // frcsCnt === newFrcsRgsCnt && 계약종료/해지 0 이면 해당 연도가 **최초 등록 해** → "현 운영수 아님" 명시.
    const isFirstYear =
      stat.frcsCnt > 0 &&
      stat.frcsCnt === stat.newFrcsRgsCnt &&
      stat.ctrtEndCnt === 0 &&
      stat.ctrtCncltnCnt === 0;
    const frcsLabel = stat.frcsCnt > 0
      ? (isFirstYear
          ? `가맹점수(${stat.yr} 최초등록 기준, 현 운영수 아님): ${stat.frcsCnt.toLocaleString()}개`
          : `가맹점수(${stat.yr} 공정위 정보공개서 기준): ${stat.frcsCnt.toLocaleString()}개`)
      : `가맹점수(${stat.yr} 공정위 정보공개서 기준): 공식자료 미공개`;
    const lines: string[] = [
      `브랜드: ${stat.brandNm || brandName}`,
      `법인: ${stat.corpNm || "공식자료 미공개"}`,
      `업종: ${stat.indutyLclasNm || "공식자료 미공개"}${stat.indutyMlsfcNm ? ` / ${stat.indutyMlsfcNm}` : ""}`,
      `기준연도: ${stat.yr}${isFirstYear ? " (최초 등록 해)" : ""}`,
      frcsLabel,
      `신규등록(${stat.yr} 기준): ${stat.newFrcsRgsCnt > 0 ? `${stat.newFrcsRgsCnt}개` : "공식자료 미공개"}`,
      `계약종료(${stat.yr} 기준): ${stat.ctrtEndCnt > 0 ? `${stat.ctrtEndCnt}개` : "공식자료 미공개"}`,
      `계약해지(${stat.yr} 기준): ${stat.ctrtCncltnCnt > 0 ? `${stat.ctrtCncltnCnt}개` : "공식자료 미공개"}`,
      `평균매출(${stat.yr} 공정위): ${stat.avrgSlsAmt > 0 ? `${Math.round(stat.avrgSlsAmt / 10).toLocaleString()}만원(연)` : "공식자료 미공개"}`,
    ];
    // 폐점률 = (ctrtEndCnt + ctrtCncltnCnt) / frcsCnt * 100 — 단, 최초 등록 해는 분모 의미 약함
    if (stat.frcsCnt > 0 && !isFirstYear) {
      const closed = stat.ctrtEndCnt + stat.ctrtCncltnCnt;
      const rate = Math.round((closed / stat.frcsCnt) * 1000) / 10;
      lines.push(`폐점률(계약종료+해지/가맹점수, ${stat.yr}): ${rate}%`);
    } else if (stat.frcsCnt > 0 && isFirstYear) {
      lines.push(`폐점률: 최초등록 해라 의미 없음`);
    } else {
      lines.push(`폐점률: 공식자료 미공개`);
    }
    return { ok: true, factBlock: lines.join("\n"), raw: { ...stat, isFirstYear } };
  } catch (e) {
    console.warn(`[ftcFranchise] fetchFtcFactByBrandName 실패 (${brandName}):`, e instanceof Error ? e.message : e);
    return { ok: false, factBlock: `${brandName}: 공식자료 미공개`, raw: null };
  }
}

export async function findJngIfrmpSn(opts: {
  brandName?: string;
  corpName?: string;
  brno?: string;
  years?: string[];
}): Promise<FtcListItem | null> {
  const years = opts.years ?? ["2024", "2023", "2022"];
  const bTarget = opts.brandName ? normalize(opts.brandName) : null;
  const cTarget = opts.corpName ? normalize(opts.corpName) : null;
  const brnoTarget = opts.brno?.replace(/\D/g, "") ?? null;

  for (const yr of years) {
    const list = await ftcListAll(yr);
    const exact = list.find(it => {
      if (brnoTarget && it.brno.replace(/\D/g, "") === brnoTarget) return true;
      const b = normalize(it.brandNm);
      const c = normalize(it.corpNm);
      if (bTarget && b === bTarget) return true;
      if (cTarget && c === cTarget) return true;
      return false;
    });
    if (exact) return exact;

    const partial = list.find(it => {
      const b = normalize(it.brandNm);
      const c = normalize(it.corpNm);
      if (bTarget && b && (b.includes(bTarget) || bTarget.includes(b))) return true;
      if (cTarget && c && (c.includes(cTarget) || cTarget.includes(c))) return true;
      return false;
    });
    if (partial) return partial;
  }
  return null;
}
