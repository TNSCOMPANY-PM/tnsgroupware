/* PR030 hotfix seed — 공정위 정보공개서 HTML → frandoor_ftc_facts */
import * as fs from "node:fs";
import * as path from "node:path";
import { load as cheerioLoad } from "cheerio";
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

type FtcFacts = {
  source_year: string | null;
  source_registered_at: string | null;
  source_first_registered_at: string | null;
  stores_total: number | null;
  new_stores: number | null;
  closed_stores: number | null;
  terminated_stores: number | null;
  avg_monthly_revenue: number | null;
  area_unit_revenue: number | null;
  cost_total: number | null;
  franchise_fee: number | null;
  education_fee: number | null;
  deposit: number | null;
  closure_rate: number | null;
  industry_avg_revenue: number | null;
  violations_total: number | null;
  contract_years: number | null;
  corp_name: string | null;
  sources: string[];
};

function emptyFacts(): FtcFacts {
  return {
    source_year: null, source_registered_at: null, source_first_registered_at: null,
    stores_total: null, new_stores: null, closed_stores: null, terminated_stores: null,
    avg_monthly_revenue: null, area_unit_revenue: null,
    cost_total: null, franchise_fee: null, education_fee: null, deposit: null,
    closure_rate: null, industry_avg_revenue: null,
    violations_total: null, contract_years: null, corp_name: null,
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

function thousandToMan(n: number | null): number | null {
  return n == null ? null : Math.round(n / 10);
}

function parseNum(s: string | undefined): number | null {
  if (!s) return null;
  const c = s.replace(/[,\s원개%년월]/g, "").replace(/만|천/g, "");
  if (!c) return null;
  const n = Number(c);
  return Number.isFinite(n) ? n : null;
}

function rowsOf($: any, table: any): string[][] {
  const rows: string[][] = [];
  $(table).find("tr").each((_: number, tr: any) => {
    const cells: string[] = [];
    $(tr).find("th,td").each((_: number, c: any) => cells.push($(c).text().replace(/\s+/g, " ").trim()));
    if (cells.some((c) => c.length > 0)) rows.push(cells);
  });
  return rows;
}

export function parseFtcViewerHtml(html: string): FtcFacts {
  const $ = cheerioLoad(html);
  const out = emptyFacts();

  const regDates = Array.from(html.matchAll(/\(20\d{2}\.\d{2}\.\d{2}\)/g))
    .map((m) => m[0].replace(/[()]/g, "").replace(/\./g, "-"))
    .sort();
  if (regDates.length > 0) {
    out.source_first_registered_at = regDates[0];
    out.source_registered_at = regDates[regDates.length - 1];
  }

  $("table").each((_: number, table: any) => {
    const cap = $(table).find("caption").text().trim();
    if (!cap) return;
    const rows = rowsOf($, table);

    // 가맹점 변동: [연도, 신규개점, 계약종료, 계약해지, 명의변경]
    if (/가맹점\s*변동\s*현황/.test(cap)) {
      const hi = rows.findIndex((r) => r.some((c) => /연도/.test(c)) && r.some((c) => /신규/.test(c)));
      if (hi >= 0) {
        const h = rows[hi];
        const ci = {
          year: h.findIndex((c) => /연도/.test(c)),
          nw: h.findIndex((c) => /신규/.test(c)),
          en: h.findIndex((c) => /계약\s*종료/.test(c)),
          tm: h.findIndex((c) => /계약\s*해지/.test(c)),
        };
        const data = rows.slice(hi + 1).filter((r) => {
          const y = parseNum(r[ci.year]);
          return y != null && y > 2000;
        });
        if (data.length) {
          data.sort((a, b) => (parseNum(b[ci.year]) ?? 0) - (parseNum(a[ci.year]) ?? 0));
          const latest = data[0];
          const yr = parseNum(latest[ci.year]);
          if (yr && !out.source_year) out.source_year = String(yr);
          out.new_stores = parseNum(latest[ci.nw]);
          out.closed_stores = parseNum(latest[ci.en]);
          out.terminated_stores = parseNum(latest[ci.tm]);
        }
      }
    }

    // 평균매출액: row[1]=[가맹점수, 평균매출액, 면적당...], 데이터행 =[지역, 가맹점수값, 평균매출값, 면적당값]
    // sub-header 인덱스 + 1 = 데이터행 인덱스
    if (/평균\s*매출액.*면적|가맹점사업자의\s*평균\s*매출액/.test(cap)) {
      const si = rows.findIndex((r) => r.some((c) => /^평균\s*매출액$/.test(c)));
      if (si >= 0) {
        const sh = rows[si];
        const storesSh = sh.findIndex((c) => /^가맹점수$/.test(c));
        const avgSh = sh.findIndex((c) => /^평균\s*매출액$/.test(c));
        const areaSh = sh.findIndex((c) => /면적.*평균|㎡.*평균/.test(c));
        const total = rows.slice(si + 1).find((r) => /전체/.test(r[0] ?? ""));
        if (total) {
          const stores = storesSh >= 0 ? parseNum(total[storesSh + 1]) : null;
          const avgAnnK = avgSh >= 0 ? parseNum(total[avgSh + 1]) : null;
          const areaK = areaSh >= 0 ? parseNum(total[areaSh + 1]) : null;
          if (stores != null && stores > 0) out.stores_total = stores;
          if (avgAnnK != null && avgAnnK > 0) out.avg_monthly_revenue = Math.round(avgAnnK / 12 / 10);
          if (areaK != null && areaK > 0) out.area_unit_revenue = thousandToMan(areaK);
        }
      }
    }

    // 부담금: 단위 천원
    if (/가맹점사업자의\s*부담금/.test(cap) && /가입비|가맹비/.test(cap)) {
      const hi = rows.findIndex((r) => r.some((c) => /가입비|가맹비/.test(c)));
      if (hi >= 0) {
        const h = rows[hi];
        const c = {
          fee: h.findIndex((x) => /가입비|가맹비/.test(x)),
          edu: h.findIndex((x) => /교육비/.test(x)),
          dep: h.findIndex((x) => /보증금/.test(x)),
          tot: h.findIndex((x) => /합계|총액/.test(x)),
        };
        const d = rows[hi + 1];
        if (d) {
          out.franchise_fee = thousandToMan(parseNum(d[c.fee]));
          out.education_fee = thousandToMan(parseNum(d[c.edu]));
          out.deposit = thousandToMan(parseNum(d[c.dep]));
          out.cost_total = thousandToMan(parseNum(d[c.tot]));
        }
      }
    }

    // 법위반 합산
    if (/법\s*위반/.test(cap)) {
      const hi = rows.findIndex((r) => r.some((c) => /시정|민사|형의\s*선고/.test(c)));
      if (hi >= 0) {
        const d = rows[hi + 1];
        if (d) {
          const t = d.reduce((s, c) => {
            const n = parseNum(c);
            return s + (n != null ? n : 0);
          }, 0);
          out.violations_total = t;
        }
      }
    }

    // 법인명
    if (/일반\s*현황|상호|영업표지/.test(cap)) {
      for (const r of rows) {
        for (let i = 0; i < r.length - 1; i++) {
          if (/상호|법인명/.test(r[i]) && !out.corp_name && r[i + 1]) out.corp_name = r[i + 1];
        }
      }
    }
  });

  if (!out.source_year && out.source_registered_at) {
    out.source_year = out.source_registered_at.slice(0, 4);
  }
  if (out.stores_total && out.stores_total > 0) {
    const closed = (out.closed_stores ?? 0) + (out.terminated_stores ?? 0);
    out.closure_rate = Math.round((closed / out.stores_total) * 1000) / 10;
  }
  out.sources = ["공정거래위원회 정보공개서 (franchise.ftc.go.kr) — 프랜도어 HTML 업로드"];
  return out;
}

function resolve(cands: string[]): string | null {
  for (const p of cands) { try { if (fs.existsSync(p)) return p; } catch {} }
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
    let p: FtcFacts = emptyFacts();
    try {
      p = parseFtcViewerHtml(fs.readFileSync(src, "utf8"));
    } catch (err) {
      console.error("[ftc-seed] parse fail", err);
      process.exitCode = 1;
      continue;
    }
    // v2 스키마: master 1행 + timeseries N행 + regional N행.
    // 기존 파서는 master 필드만 추출. timeseries/regional 은 HTML 추가 파싱 완료 전까지 빈 배열.
    const payload = {
      brand_id: e.brandId,
      brand_name: e.brandName,
      corp_name: p.corp_name,
      source_year: p.source_year,
      source_registered_at: p.source_registered_at,
      source_first_registered_at: p.source_first_registered_at,
      ftc_first_registered_date: p.source_first_registered_at,
      ftc_latest_registered_date: p.source_registered_at,
      latest_year: p.source_year,
      stores_total: p.stores_total,
      new_stores: p.new_stores,
      closed_stores: p.closed_stores,
      terminated_stores: p.terminated_stores,
      avg_monthly_revenue: p.avg_monthly_revenue,
      area_unit_revenue: p.area_unit_revenue,
      cost_total: p.cost_total,
      franchise_fee: p.franchise_fee,
      education_fee: p.education_fee,
      deposit: p.deposit,
      closure_rate: p.closure_rate,
      industry_avg_revenue: p.industry_avg_revenue,
      violations_total: p.violations_total,
      contract_initial_years: p.contract_years,
      source_ingest_method: "html_parse_mvp",
      sources: p.sources,
      raw: { source_file: path.basename(src) },
      updated_at: new Date().toISOString(),
    };
    const { error } = await sb.from("frandoor_ftc_facts").upsert(payload, { onConflict: "brand_id" });
    if (error) {
      console.error("[ftc-seed] master upsert fail:", error.message);
      process.exitCode = 1;
      continue;
    }

    // timeseries 한 줄이라도 생성 (latest year 기준, 가능한 값만)
    const yr = p.source_year ? parseInt(p.source_year, 10) : null;
    if (yr && (p.new_stores != null || p.closed_stores != null || p.stores_total != null)) {
      const tsRow = {
        brand_id: e.brandId,
        year: yr,
        stores_total: p.stores_total,
        new_opens: p.new_stores,
        contract_end: p.closed_stores,
        contract_terminate: p.terminated_stores,
        avg_annual_revenue: p.avg_monthly_revenue != null ? p.avg_monthly_revenue * 12 : null,
        avg_revenue_per_unit_area: p.area_unit_revenue,
        raw: {},
      };
      const { error: tsErr } = await sb.from("frandoor_ftc_timeseries").upsert(tsRow, { onConflict: "brand_id,year" });
      if (tsErr) console.warn("[ftc-seed] timeseries upsert 경고:", tsErr.message);
    }

    console.log("[ftc-seed] " + e.brandName + " OK");
    console.log("  master: stores_total=" + p.stores_total + " source_year=" + p.source_year);
    console.log("  master: avg_monthly_revenue=" + p.avg_monthly_revenue + "만원 cost_total=" + p.cost_total);
    console.log("  master: violations=" + p.violations_total + " closure_rate=" + p.closure_rate);
    console.log("  timeseries: " + (yr ? "1 row (" + yr + ")" : "skipped (no year)"));
    console.log("  regional: 0 row (HTML 추가 파싱 필요)");
  }
}

main().catch((e) => { console.error("[ftc-seed] fatal:", e); process.exit(1); });
