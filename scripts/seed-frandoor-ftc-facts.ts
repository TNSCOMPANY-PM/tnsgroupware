/* PR034 seed — 공정위 정보공개서 HTML → frandoor_ftc_facts + timeseries + regional.
 * 16테이블 full coverage. caption/th 텍스트 매칭 기반 → 620개 브랜드 HTML 동일 구조 대응.
 */
import * as fs from "node:fs";
import * as path from "node:path";
import { load as cheerioLoad, type CheerioAPI, type Cheerio } from "cheerio";
import type { Element } from "domhandler";
import { createClient } from "@supabase/supabase-js";

type Entry = {
  brandId: string;
  brandName: string;
  format: "html";
  pathCandidates: string[];
};

const FILES: Entry[] = [
  {
    brandId: "82c7ffc9-ed53-44bf-859d-a9a72b147b20",
    brandName: "오공김밥",
    format: "html",
    pathCandidates: [
      "C:/Users/user1/Dropbox/claude/GEO프로젝트/오공김밥.html",
      "/sessions/gifted-loving-darwin/mnt/GEO프로젝트/오공김밥.html",
      "/sessions/gifted-loving-darwin/mnt/uploads/오공김밥.html",
    ],
  },
];

// 17개 광역시도 정규화 — 어떤 표기가 들어와도 표준 1단어로 매핑
const REGION_NORMALIZE: Array<[RegExp, string]> = [
  [/서울/, "서울"],
  [/부산/, "부산"],
  [/대구/, "대구"],
  [/인천/, "인천"],
  [/광주/, "광주"],
  [/대전/, "대전"],
  [/울산/, "울산"],
  [/세종/, "세종"],
  [/경기/, "경기"],
  [/강원/, "강원"],
  [/충북|충청북도/, "충북"],
  [/충남|충청남도/, "충남"],
  [/전북|전라북도/, "전북"],
  [/전남|전라남도/, "전남"],
  [/경북|경상북도/, "경북"],
  [/경남|경상남도/, "경남"],
  [/제주/, "제주"],
];
function normalizeRegion(raw: string): string | null {
  const t = (raw ?? "").trim();
  if (!t) return null;
  for (const [re, norm] of REGION_NORMALIZE) if (re.test(t)) return norm;
  return null;
}

type MasterFields = {
  corp_name: string | null;
  representative: string | null;
  industry_main: string | null;
  industry_sub: string | null;
  corp_founded_date: string | null;
  biz_registered_date: string | null;
  ftc_first_registered_date: string | null;
  ftc_latest_registered_date: string | null;
  source_year: string | null;
  source_registered_at: string | null;
  source_first_registered_at: string | null;
  hq_address: string | null;
  biz_type: string | null;
  franchise_started_date: string | null;
  brand_count: number | null;
  affiliate_count: number | null;
  regional_hq_count: number | null;
  latest_year: string | null;
  stores_total: number | null;
  avg_monthly_revenue: number | null;       // 만원
  latest_avg_annual_revenue: number | null; // 만원
  latest_avg_revenue_per_unit_area: number | null; // 만원
  area_unit_revenue: number | null;         // 만원 (legacy alias of latest_avg_revenue_per_unit_area)
  franchise_fee: number | null;
  education_fee: number | null;
  deposit: number | null;
  other_cost: number | null;
  cost_total: number | null;
  interior_per_unit_area: number | null;
  reference_area: number | null;
  interior_total: number | null;
  contract_initial_years: number | null;
  contract_extension_years: number | null;
  violations_ftc: number | null;
  violations_civil: number | null;
  violations_criminal: number | null;
  violations_total: number | null;
  closure_rate: number | null;
  industry_avg_revenue: number | null;
  new_stores: number | null;
  closed_stores: number | null;
  terminated_stores: number | null;
  deposit_types_raw: unknown;
  sources: string[];
};

type TsRow = {
  year: number;
  assets: number | null;
  liabilities: number | null;
  equity: number | null;
  revenue: number | null;
  operating_profit: number | null;
  net_profit: number | null;
  executives: number | null;
  employees: number | null;
  opening_balance: number | null;
  new_opens: number | null;
  contract_end: number | null;
  contract_terminate: number | null;
  name_change: number | null;
  closing_balance: number | null;
  stores_total: number | null;
  stores_franchise: number | null;
  stores_direct: number | null;
  advertising: number | null;
  promotion: number | null;
  avg_annual_revenue: number | null;
  avg_revenue_per_unit_area: number | null;
};

type RegRow = {
  year: number;
  region: string;
  stores_franchise: number | null;
  stores_direct: number | null;
  avg_annual_revenue: number | null;
};

type ParseResult = { master: MasterFields; timeseries: TsRow[]; regional: RegRow[] };

function emptyMaster(): MasterFields {
  return {
    corp_name: null, representative: null, industry_main: null, industry_sub: null,
    corp_founded_date: null, biz_registered_date: null,
    ftc_first_registered_date: null, ftc_latest_registered_date: null,
    source_year: null, source_registered_at: null, source_first_registered_at: null,
    hq_address: null, biz_type: null, franchise_started_date: null,
    brand_count: null, affiliate_count: null, regional_hq_count: null,
    latest_year: null,
    stores_total: null, avg_monthly_revenue: null,
    latest_avg_annual_revenue: null, latest_avg_revenue_per_unit_area: null, area_unit_revenue: null,
    franchise_fee: null, education_fee: null, deposit: null, other_cost: null, cost_total: null,
    interior_per_unit_area: null, reference_area: null, interior_total: null,
    contract_initial_years: null, contract_extension_years: null,
    violations_ftc: null, violations_civil: null, violations_criminal: null, violations_total: null,
    closure_rate: null, industry_avg_revenue: null,
    new_stores: null, closed_stores: null, terminated_stores: null,
    deposit_types_raw: null,
    sources: [],
  };
}

function loadEnv() {
  const envPath = path.resolve(process.cwd(), ".env.local");
  if (!fs.existsSync(envPath)) return;
  const t = fs.readFileSync(envPath, "utf8");
  for (const line of t.split(/\r?\n/)) {
    const m = line.match(/^([A-Z0-9_]+)=([\s\S]*)$/);
    if (!m) continue;
    let v = m[2];
    if (v.startsWith("'") && v.endsWith("'")) v = v.slice(1, -1);
    if (v.startsWith('"') && v.endsWith('"')) v = v.slice(1, -1);
    if (!process.env[m[1]]) process.env[m[1]] = v;
  }
}

function thousandToMan(n: number | null | undefined): number | null {
  return n == null ? null : Math.round(n / 10);
}
function parseNum(s: string | undefined): number | null {
  if (!s) return null;
  const c = s.replace(/[,\s원개%년월명]/g, "").replace(/만|천/g, "");
  if (!c) return null;
  const n = Number(c);
  return Number.isFinite(n) ? n : null;
}
function parseKoreanDate(s: string | undefined): string | null {
  if (!s) return null;
  const m = s.match(/(\d{4})[.\-\s]+(\d{1,2})[.\-\s]+(\d{1,2})/);
  if (!m) return null;
  const y = m[1], mo = m[2].padStart(2, "0"), d = m[3].padStart(2, "0");
  return `${y}-${mo}-${d}`;
}

function rowsOf($: CheerioAPI, table: Element): string[][] {
  const rows: string[][] = [];
  $(table).find("tr").each((_i: number, tr: Element) => {
    const cells: string[] = [];
    $(tr).find("th,td").each((_j: number, c: Element) => {
      cells.push($(c).text().replace(/\s+/g, " ").trim());
    });
    if (cells.some((c) => c.length > 0)) rows.push(cells);
  });
  return rows;
}

// th 의 id 속성으로 라벨→값 맵 추출 (일반 현황 표 특유 구조)
// <td headers="corpNm"><label class="hidden">상호</label>(주)푸드스팟</td>
// → label 제거 후 "(주)푸드스팟" 만 반환
function thIdMap($: CheerioAPI, table: Cheerio<Element>): Map<string, string> {
  const map = new Map<string, string>();
  table.find("tbody td").each((_i: number, el: Element) => {
    const headers = ($(el).attr("headers") ?? "").split(/\s+/).filter(Boolean);
    if (headers.length === 0) return;
    const clone = $(el).clone();
    clone.find("label").remove();
    const text = clone.text().replace(/\s+/g, " ").trim();
    if (!text) return;
    for (const h of headers) if (!map.has(h)) map.set(h, text);
  });
  return map;
}

export function parseFtcViewerHtml(html: string): ParseResult {
  const $ = cheerioLoad(html);
  const master = emptyMaster();
  const tsByYear = new Map<number, TsRow>();
  const regRows: RegRow[] = [];
  const ensureTs = (year: number): TsRow => {
    let t = tsByYear.get(year);
    if (!t) {
      t = {
        year, assets: null, liabilities: null, equity: null, revenue: null,
        operating_profit: null, net_profit: null, executives: null, employees: null,
        opening_balance: null, new_opens: null, contract_end: null, contract_terminate: null,
        name_change: null, closing_balance: null,
        stores_total: null, stores_franchise: null, stores_direct: null,
        advertising: null, promotion: null,
        avg_annual_revenue: null, avg_revenue_per_unit_area: null,
      };
      tsByYear.set(year, t);
    }
    return t;
  };

  // 공통: 등록일 후보 추출 (dropdown "(YYYY.MM.DD)" 패턴)
  const regDates = Array.from(html.matchAll(/\(20\d{2}\.\d{2}\.\d{2}\)/g))
    .map((m) => m[0].replace(/[()]/g, "").replace(/\./g, "-"))
    .sort();
  if (regDates.length > 0) {
    master.source_first_registered_at = regDates[0];
    master.source_registered_at = regDates[regDates.length - 1];
    master.ftc_first_registered_date = regDates[0];
    master.ftc_latest_registered_date = regDates[regDates.length - 1];
  }

  $("table").each((_i: number, table: Element) => {
    const cap = $(table).find("caption").text().trim();
    if (!cap) return;
    const rows = rowsOf($, table);

    // T2.1 일반 현황 — 상호/영업표지/대표자/업종/법인설립/사업자등록/최초등록/최종등록
    if (/일반\s*현황.*상호|일반\s*현황.*영업표지/.test(cap)) {
      const m = thIdMap($, $(table));
      if (!master.corp_name) master.corp_name = m.get("corpNm") ?? null;
      if (!master.representative) master.representative = m.get("ceoNm") ?? null;
      if (!master.industry_sub) master.industry_sub = m.get("bizTyp") ?? null;
      master.industry_main = "외식"; // 가맹사업거래 정보공개서는 외식 전용 파서
      if (!master.corp_founded_date) master.corp_founded_date = parseKoreanDate(m.get("corpFndDt"));
      if (!master.biz_registered_date) master.biz_registered_date = parseKoreanDate(m.get("corpDt"));
      const first = parseKoreanDate(m.get("frstRegDt"));
      const last = parseKoreanDate(m.get("fnRegDt"));
      if (first) master.ftc_first_registered_date = first;
      if (last) master.ftc_latest_registered_date = last;
      // fallback
      for (const r of rows) {
        for (let i = 0; i < r.length - 1; i++) {
          if (/상호|법인명/.test(r[i]) && !master.corp_name && r[i + 1]) master.corp_name = r[i + 1];
          if (/대표자/.test(r[i]) && !master.representative && r[i + 1]) master.representative = r[i + 1];
          if (/업종/.test(r[i]) && !master.industry_sub && r[i + 1]) master.industry_sub = r[i + 1];
        }
      }
      return;
    }

    // T2.1b 일반 현황 — 주소·사업자유형
    if (/일반\s*현황.*주소|주소.*사업자유형/.test(cap)) {
      for (const r of rows) {
        for (let i = 0; i < r.length - 1; i++) {
          if (/주소/.test(r[i]) && r[i + 1] && !master.hq_address) {
            const addr = r[i + 1].replace(/^우\s*:\s*\d+\s*/, "").trim();
            master.hq_address = normalizeRegion(addr) ?? addr.split(" ").slice(0, 2).join(" ");
          }
          if (/사업자유형/.test(r[i]) && r[i + 1] && !master.biz_type) master.biz_type = r[i + 1].trim();
        }
      }
      return;
    }

    // T2.2 재무상황 — 연도/자산/부채/자본/매출액/영업이익/당기순이익 (단위 천원)
    if (/재무\s*상황|연도.*자산.*부채/.test(cap)) {
      const hi = rows.findIndex((r) => r.includes("연도") || /자산.*부채.*자본/.test(r.join(",")));
      if (hi >= 0) {
        const h = rows[hi];
        const ci = {
          year: h.findIndex((c) => /^연도$/.test(c)),
          assets: h.findIndex((c) => /자산/.test(c)),
          liab: h.findIndex((c) => /부채/.test(c)),
          equity: h.findIndex((c) => /자본/.test(c)),
          rev: h.findIndex((c) => /매출액/.test(c)),
          op: h.findIndex((c) => /영업이익/.test(c)),
          net: h.findIndex((c) => /당기순이익|순이익/.test(c)),
        };
        for (const r of rows.slice(hi + 1)) {
          const y = parseNum(r[ci.year]);
          if (!y || y < 2000) continue;
          const ts = ensureTs(y);
          ts.assets = thousandToMan(parseNum(r[ci.assets]));
          ts.liabilities = thousandToMan(parseNum(r[ci.liab]));
          ts.equity = thousandToMan(parseNum(r[ci.equity]));
          ts.revenue = thousandToMan(parseNum(r[ci.rev]));
          ts.operating_profit = thousandToMan(parseNum(r[ci.op]));
          ts.net_profit = thousandToMan(parseNum(r[ci.net]));
        }
      }
      return;
    }

    // T2.3 임직원수 — 연도/임원수/직원수
    if (/임직원수/.test(cap)) {
      const hi = rows.findIndex((r) => r.some((c) => /^연도$/.test(c)) && r.some((c) => /임원수?/.test(c)));
      if (hi >= 0) {
        const h = rows[hi];
        const ci = {
          year: h.findIndex((c) => /^연도$/.test(c)),
          exec: h.findIndex((c) => /임원수?/.test(c)),
          emp: h.findIndex((c) => /직원수?/.test(c)),
        };
        for (const r of rows.slice(hi + 1)) {
          const y = parseNum(r[ci.year]);
          if (!y || y < 2000) continue;
          const ts = ensureTs(y);
          ts.executives = parseNum(r[ci.exec]);
          ts.employees = parseNum(r[ci.emp]);
        }
      }
      return;
    }

    // T2.4 브랜드·계열사 — 단일 행 (브랜드수, 가맹사업 계열사수)
    if (/브랜드.*계열사/.test(cap)) {
      const hi = rows.findIndex((r) => r.some((c) => /브랜드\s*수/.test(c)));
      if (hi >= 0) {
        const d = rows[hi + 1];
        if (d && d.length >= 2) {
          master.brand_count = parseNum(d[0]);
          master.affiliate_count = parseNum(d[1]);
        }
      }
      return;
    }

    // T2.5 가맹사업 개시일
    if (/가맹사업\s*개시/.test(cap)) {
      for (const r of rows) {
        for (let i = 0; i < r.length - 1; i++) {
          if (/개시일/.test(r[i]) && r[i + 1]) {
            const d = parseKoreanDate(r[i + 1]);
            if (d) master.franchise_started_date = d;
          }
        }
      }
      return;
    }

    // T2.6 가맹점·직영점 현황 (★ 복잡: 지역 × 연도별 3컬럼)
    // 헤더 row1: [지역, 2024년, 2023년, 2022년, ...] (각 연도 th colspan=3)
    // 헤더 row2: [전체, 가맹점수, 직영점수] × N
    // 데이터 rows: [지역명, v1, v2, v3, v1, v2, v3, ...]
    if (/가맹점.*직영점.*현황|가맹점수.*직영점수/.test(cap)) {
      // 헤더 연도 순서 추출
      const years: number[] = [];
      $(table).find("thead th, thead tr th").each((_j: number, th: Element) => {
        const y = parseNum($(th).text().replace("년", ""));
        if (y && y > 2000) years.push(y);
      });
      if (years.length === 0) return;

      // 데이터 rows (지역명 첫 셀)
      for (const r of rows) {
        if (r.length < 1 + years.length * 3) continue;
        const label = r[0];
        if (!label) continue;
        if (/^합계$/.test(label)) continue;
        const isAll = /^전체$/.test(label);
        const regionStd = normalizeRegion(label);
        if (!isAll && !regionStd) continue;

        for (let yi = 0; yi < years.length; yi++) {
          const base = 1 + yi * 3;
          const total = parseNum(r[base]);
          const franchise = parseNum(r[base + 1]);
          const direct = parseNum(r[base + 2]);
          const y = years[yi];
          if (isAll) {
            const ts = ensureTs(y);
            if (total != null) ts.stores_total = total;
            if (franchise != null) ts.stores_franchise = franchise;
            if (direct != null) ts.stores_direct = direct;
          } else if (regionStd) {
            // regRows 축적 (병합은 main 에서)
            regRows.push({
              year: y, region: regionStd,
              stores_franchise: franchise, stores_direct: direct,
              avg_annual_revenue: null,
            });
          }
        }
      }
      return;
    }

    // T2.7 가맹지역본부 수
    if (/가맹지역본부/.test(cap)) {
      for (const r of rows) {
        for (let i = 0; i < r.length; i++) {
          if (/지역본부|지사|지역총판/.test(r[i])) {
            const n = parseNum(r[i + 1]);
            if (n != null) master.regional_hq_count = n;
          }
        }
      }
      return;
    }

    // T2.8 광고·판촉비 — 연도/광고비/판촉비 (단위 천원)
    if (/광고.*판촉비|판촉비.*내역/.test(cap)) {
      const hi = rows.findIndex((r) => r.some((c) => /^연도$/.test(c)) && r.some((c) => /광고비/.test(c)));
      if (hi >= 0) {
        const h = rows[hi];
        const ci = {
          year: h.findIndex((c) => /^연도$/.test(c)),
          ad: h.findIndex((c) => /광고비/.test(c)),
          pr: h.findIndex((c) => /판촉비/.test(c)),
        };
        for (const r of rows.slice(hi + 1)) {
          const y = parseNum(r[ci.year]);
          if (!y || y < 2000) continue;
          const ts = ensureTs(y);
          ts.advertising = thousandToMan(parseNum(r[ci.ad]));
          ts.promotion = thousandToMan(parseNum(r[ci.pr]));
        }
      }
      return;
    }

    // T2.9 가맹금 예치 (raw 로만 저장)
    if (/가맹금\s*예치|예치\s*가맹금/.test(cap)) {
      master.deposit_types_raw = rows;
      return;
    }

    // T2.10 인테리어 비용 — 단위면적/기준면적/인테리어비용 총액 (천원)
    if (/인테리어\s*비용/.test(cap)) {
      const hi = rows.findIndex((r) => r.some((c) => /단위면적/.test(c)));
      if (hi >= 0) {
        const h = rows[hi];
        const ci = {
          unit: h.findIndex((c) => /단위면적/.test(c)),
          ref: h.findIndex((c) => /기준점포면적/.test(c)),
          total: h.findIndex((c) => /^인테리어\s*비용$/.test(c)),
        };
        const d = rows[hi + 1];
        if (d) {
          master.interior_per_unit_area = thousandToMan(parseNum(d[ci.unit]));
          master.reference_area = parseNum(d[ci.ref]);
          master.interior_total = thousandToMan(parseNum(d[ci.total]));
        }
      }
      return;
    }

    // T2.11 가맹계약 기간 — 최초/연장 (년)
    if (/가맹계약\s*기간|계약기간.*최초.*연장/.test(cap)) {
      const hi = rows.findIndex((r) => r.some((c) => /^최초\s*$/.test(c)));
      if (hi >= 0) {
        const d = rows[hi + 1];
        if (d && d.length >= 2) {
          master.contract_initial_years = parseNum(d[0]);
          master.contract_extension_years = parseNum(d[1]);
        }
      }
      return;
    }

    // 가맹점 변동 — 연도/신규/종료/해지/명의변경
    if (/가맹점\s*변동/.test(cap)) {
      const hi = rows.findIndex((r) => r.some((c) => /연도/.test(c)) && r.some((c) => /신규/.test(c)));
      if (hi >= 0) {
        const h = rows[hi];
        const ci = {
          year: h.findIndex((c) => /^연도$/.test(c)),
          nw: h.findIndex((c) => /신규/.test(c)),
          en: h.findIndex((c) => /계약\s*종료/.test(c)),
          tm: h.findIndex((c) => /계약\s*해지/.test(c)),
          nm: h.findIndex((c) => /명의변경/.test(c)),
        };
        for (const r of rows.slice(hi + 1)) {
          const y = parseNum(r[ci.year]);
          if (!y || y < 2000) continue;
          const ts = ensureTs(y);
          ts.new_opens = parseNum(r[ci.nw]);
          ts.contract_end = parseNum(r[ci.en]);
          ts.contract_terminate = parseNum(r[ci.tm]);
          if (ci.nm >= 0) ts.name_change = parseNum(r[ci.nm]);
        }
        // 최신연도 latest year 로 master 에도 투사
        const years = Array.from(tsByYear.keys()).sort((a, b) => b - a);
        if (years.length > 0 && !master.latest_year) master.latest_year = String(years[0]);
        const latest = years.length > 0 ? tsByYear.get(years[0]) : null;
        if (latest) {
          if (latest.new_opens != null) master.new_stores = latest.new_opens;
          if (latest.contract_end != null) master.closed_stores = latest.contract_end;
          if (latest.contract_terminate != null) master.terminated_stores = latest.contract_terminate;
        }
      }
      return;
    }

    // T2.12 평균매출액 (연도별·지역별) — 가맹점수/평균매출액/면적당평균
    if (/평균\s*매출액.*면적|가맹점사업자의\s*평균\s*매출액/.test(cap)) {
      // 헤더 row 1: [지역, 2024년(colspan=3), 2023년, ...]
      // 헤더 row 2: [가맹점수, 평균매출액, 면적당 평균매출액] × N
      const years: number[] = [];
      $(table).find("thead th").each((_j: number, th: Element) => {
        const y = parseNum($(th).text().replace("년", ""));
        if (y && y > 2000) years.push(y);
      });

      const subIdx = rows.findIndex((r) => r.some((c) => /^평균\s*매출액$/.test(c)));
      if (subIdx >= 0) {
        for (const r of rows.slice(subIdx + 1)) {
          const label = r[0];
          if (!label) continue;
          if (/^합계$/.test(label)) continue;
          const isAll = /^전체$/.test(label);
          const regionStd = normalizeRegion(label);
          if (!isAll && !regionStd) continue;

          for (let yi = 0; yi < years.length; yi++) {
            const base = 1 + yi * 3;
            const stores = parseNum(r[base]);
            const avgAnnK = parseNum(r[base + 1]);
            const areaK = parseNum(r[base + 2]);
            const y = years[yi];
            if (isAll) {
              const ts = ensureTs(y);
              if (avgAnnK != null && avgAnnK > 0) ts.avg_annual_revenue = thousandToMan(avgAnnK);
              if (areaK != null && areaK > 0) ts.avg_revenue_per_unit_area = thousandToMan(areaK);
              if (stores != null && stores > 0 && ts.stores_total == null) ts.stores_total = stores;
              // master 최신연도 전국 snapshot
              const latestYr = years.length > 0 ? Math.max(...years) : null;
              if (y === latestYr) {
                if (avgAnnK != null && avgAnnK > 0) {
                  master.latest_avg_annual_revenue = thousandToMan(avgAnnK);
                  master.avg_monthly_revenue = Math.round(avgAnnK / 12 / 10);
                }
                if (areaK != null && areaK > 0) {
                  master.latest_avg_revenue_per_unit_area = thousandToMan(areaK);
                  master.area_unit_revenue = thousandToMan(areaK);
                }
                if (stores != null && stores > 0) master.stores_total = stores;
              }
            } else if (regionStd) {
              // 평균매출 병합 → regRows 에 동일 year/region 엔트리가 있으면 업데이트, 없으면 추가
              const existing = regRows.find((x) => x.year === y && x.region === regionStd);
              if (existing) {
                if (avgAnnK != null) existing.avg_annual_revenue = thousandToMan(avgAnnK);
              } else {
                regRows.push({
                  year: y, region: regionStd,
                  stores_franchise: null, stores_direct: null,
                  avg_annual_revenue: thousandToMan(avgAnnK),
                });
              }
            }
          }
        }
      }
      return;
    }

    // 부담금 — 가입비/교육비/보증금/기타비용/합계 (천원)
    if (/가맹점사업자의\s*부담금/.test(cap) && /가입비|가맹비/.test(cap)) {
      const hi = rows.findIndex((r) => r.some((c) => /가입비|가맹비/.test(c)));
      if (hi >= 0) {
        const h = rows[hi];
        const ci = {
          fee: h.findIndex((x) => /가입비|가맹비/.test(x)),
          edu: h.findIndex((x) => /교육비/.test(x)),
          dep: h.findIndex((x) => /보증금/.test(x)),
          etc: h.findIndex((x) => /기타비용/.test(x)),
          tot: h.findIndex((x) => /합계|총액/.test(x)),
        };
        const d = rows[hi + 1];
        if (d) {
          master.franchise_fee = thousandToMan(parseNum(d[ci.fee]));
          master.education_fee = thousandToMan(parseNum(d[ci.edu]));
          master.deposit = thousandToMan(parseNum(d[ci.dep]));
          master.other_cost = ci.etc >= 0 ? thousandToMan(parseNum(d[ci.etc])) : null;
          master.cost_total = thousandToMan(parseNum(d[ci.tot]));
        }
      }
      return;
    }

    // 법위반 — 시정조치/민사/형의 선고 × 3년 합산
    if (/법\s*위반/.test(cap)) {
      const hi = rows.findIndex((r) => r.some((c) => /시정|민사|형의\s*선고/.test(c)));
      if (hi >= 0) {
        const h = rows[hi];
        let ftcSum = 0, civSum = 0, crimSum = 0, total = 0;
        for (const d of rows.slice(hi + 1)) {
          for (let i = 0; i < h.length; i++) {
            const n = parseNum(d[i]);
            if (n == null) continue;
            if (/시정|공정거래/.test(h[i])) ftcSum += n;
            else if (/민사/.test(h[i])) civSum += n;
            else if (/형의\s*선고|형사/.test(h[i])) crimSum += n;
            total += n;
          }
        }
        master.violations_ftc = ftcSum;
        master.violations_civil = civSum;
        master.violations_criminal = crimSum;
        master.violations_total = total;
      }
      return;
    }
  });

  // derive: stores_total 기반 closure_rate
  if (master.stores_total && master.stores_total > 0) {
    const closed = (master.closed_stores ?? 0) + (master.terminated_stores ?? 0);
    master.closure_rate = Math.round((closed / master.stores_total) * 1000) / 10;
  }
  if (!master.source_year && master.source_registered_at) {
    master.source_year = master.source_registered_at.slice(0, 4);
  }
  if (!master.latest_year && master.source_year) master.latest_year = master.source_year;

  master.sources = ["공정거래위원회 정보공개서 (franchise.ftc.go.kr) — 프랜도어 HTML 업로드"];

  const timeseries = Array.from(tsByYear.values()).sort((a, b) => b.year - a.year);
  return { master, timeseries, regional: regRows };
}

function resolve(cands: string[]): string | null {
  for (const p of cands) { try { if (fs.existsSync(p)) return p; } catch { /* noop */ } }
  return null;
}

async function main() {
  loadEnv();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) { console.error("[ftc-seed] env missing"); process.exit(1); }
  const sb = createClient(url, key);

  for (const e of FILES) {
    const src = resolve(e.pathCandidates);
    if (!src) { console.error("[ftc-seed] SKIP " + e.brandName); continue; }
    let parsed: ParseResult;
    try {
      parsed = parseFtcViewerHtml(fs.readFileSync(src, "utf8"));
    } catch (err) {
      console.error("[ftc-seed] parse fail", err);
      process.exitCode = 1;
      continue;
    }
    const m = parsed.master;

    const payload = {
      brand_id: e.brandId,
      brand_name: e.brandName,
      corp_name: m.corp_name,
      representative: m.representative,
      industry_main: m.industry_main,
      industry_sub: m.industry_sub,
      corp_founded_date: m.corp_founded_date,
      biz_registered_date: m.biz_registered_date,
      ftc_first_registered_date: m.ftc_first_registered_date,
      ftc_latest_registered_date: m.ftc_latest_registered_date,
      source_year: m.source_year,
      source_registered_at: m.source_registered_at,
      source_first_registered_at: m.source_first_registered_at,
      hq_address: m.hq_address,
      biz_type: m.biz_type,
      franchise_started_date: m.franchise_started_date,
      brand_count: m.brand_count,
      affiliate_count: m.affiliate_count,
      regional_hq_count: m.regional_hq_count,
      latest_year: m.latest_year,
      stores_total: m.stores_total,
      avg_monthly_revenue: m.avg_monthly_revenue,
      latest_avg_annual_revenue: m.latest_avg_annual_revenue,
      latest_avg_revenue_per_unit_area: m.latest_avg_revenue_per_unit_area,
      area_unit_revenue: m.area_unit_revenue,
      new_stores: m.new_stores,
      closed_stores: m.closed_stores,
      terminated_stores: m.terminated_stores,
      cost_total: m.cost_total,
      franchise_fee: m.franchise_fee,
      education_fee: m.education_fee,
      deposit: m.deposit,
      other_cost: m.other_cost,
      interior_per_unit_area: m.interior_per_unit_area,
      reference_area: m.reference_area,
      interior_total: m.interior_total,
      contract_initial_years: m.contract_initial_years,
      contract_extension_years: m.contract_extension_years,
      violations_ftc: m.violations_ftc,
      violations_civil: m.violations_civil,
      violations_criminal: m.violations_criminal,
      violations_total: m.violations_total,
      closure_rate: m.closure_rate,
      industry_avg_revenue: m.industry_avg_revenue,
      source_ingest_method: "html_parse_v2",
      sources: m.sources,
      raw: { source_file: path.basename(src), deposit_types: m.deposit_types_raw ?? null },
      updated_at: new Date().toISOString(),
    };

    const { error } = await sb.from("frandoor_ftc_facts").upsert(payload, { onConflict: "brand_id" });
    if (error) {
      console.error("[ftc-seed] master upsert fail:", error.message);
      process.exitCode = 1;
      continue;
    }

    // timeseries 배치 upsert
    if (parsed.timeseries.length > 0) {
      const tsRows = parsed.timeseries.map((t) => ({ ...t, brand_id: e.brandId, raw: {} }));
      const { error: tsErr } = await sb.from("frandoor_ftc_timeseries").upsert(tsRows, { onConflict: "brand_id,year" });
      if (tsErr) console.warn("[ftc-seed] timeseries 경고:", tsErr.message);
    }

    // regional 배치 — idempotent 위해 기존 삭제 후 insert
    if (parsed.regional.length > 0) {
      await sb.from("frandoor_ftc_regional").delete().eq("brand_id", e.brandId);
      const regRows = parsed.regional.map((r) => ({ ...r, brand_id: e.brandId }));
      // dedupe by (year, region) — 가맹점현황 + 평균매출액 두 테이블에서 중복 가능
      const dedupe = new Map<string, typeof regRows[number]>();
      for (const r of regRows) {
        const k = `${r.year}:${r.region}`;
        const exist = dedupe.get(k);
        if (!exist) dedupe.set(k, r);
        else {
          dedupe.set(k, {
            ...exist,
            stores_franchise: exist.stores_franchise ?? r.stores_franchise,
            stores_direct: exist.stores_direct ?? r.stores_direct,
            avg_annual_revenue: exist.avg_annual_revenue ?? r.avg_annual_revenue,
          });
        }
      }
      const { error: regErr } = await sb.from("frandoor_ftc_regional").insert(Array.from(dedupe.values()));
      if (regErr) console.warn("[ftc-seed] regional 경고:", regErr.message);
    }

    console.log("[ftc-seed] " + e.brandName + " OK");
    console.log("  master 필드: corp=" + m.corp_name + " rep=" + m.representative + " industry=" + m.industry_sub);
    console.log("  dates: corp_founded=" + m.corp_founded_date + " franchise_started=" + m.franchise_started_date + " first_reg=" + m.ftc_first_registered_date);
    console.log("  counts: brand=" + m.brand_count + " affiliate=" + m.affiliate_count + " regional_hq=" + m.regional_hq_count);
    console.log("  financial: stores_total=" + m.stores_total + " avg_annual=" + m.latest_avg_annual_revenue + "만원 cost_total=" + m.cost_total + "만원");
    console.log("  interior: per_unit=" + m.interior_per_unit_area + "만원/3.3㎡ area=" + m.reference_area + "㎡ total=" + m.interior_total + "만원");
    console.log("  contract: initial=" + m.contract_initial_years + "년 extension=" + m.contract_extension_years + "년");
    console.log("  timeseries: " + parsed.timeseries.length + " rows (" + parsed.timeseries.map((t) => t.year).join(",") + ")");
    console.log("  regional: " + parsed.regional.length + " rows (dedupe 후 " + new Set(parsed.regional.map((r) => `${r.year}:${r.region}`)).size + ")");
  }
}

main().catch((e) => { console.error("[ftc-seed] fatal:", e); process.exit(1); });
