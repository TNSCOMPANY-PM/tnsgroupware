/* PR030 hotfix — 공정위 정보공개서(프랜도어 업로드) HTML/엑셀 → frandoor_ftc_facts (범용 배치).
 *   npx tsx scripts/seed-frandoor-ftc-facts.ts
 * FILES 배열에 { brandId, brandName, format, pathCandidates } append 로 확장.
 * HTML 파서: franchise.ftc.go.kr 정보공개서 열람 페이지 dump 대응 (caption/th 텍스트 매칭).
 */
import * as fs from "node:fs";
import * as path from "node:path";
import { load as cheerioLoad } from "cheerio";
import { createClient } from "@supabase/supabase-js";

type Entry =
  | { brandId: string; brandName: string; format: "html"; pathCandidates: string[] }
  | { brandId: string; brandName: string; format: "xlsx"; pathCandidates: string[] };

const FILES: Entry[] = [
  {
    brandId: "82c7ffc9-ed53-44bf-859d-a9a72b147b20",
    brandName: "오공김밥",
    format: "html",
    pathCandidates: [
      "C:/Users/user1/Dropbox/claude/GEO프로젝트/오공김밥.html",
      "C:/Users/user1/Dropbox/claude/GEO프로젝트/오공김밥_ftc.html",
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
  const text = fs.readFileSync(envPath, "utf8");
  for (const line of text.split(/\r?\n/)) {
    const m = line.match(/^([A-Z0-9_]+)=([\s\S]*)$/);
    if (!m) continue;
    let v = m[2];
    if (v.startsWith("'") && v.endsWith("'")) v = v.slice(1, -1);
    if (v.startsWith('"') && v.endsWith('"')) v = v.slice(1, -1);
    if (!process.env[m[1]]) process.env[m[1]] = v;
  }
}

function toNumber(v: unknown): number | null {
  if (v == null) return null;
  const s = String(v).replace(/[,\s원개%년월]/g, "").replace(/만/g, "");
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

// 공정위 franchise.ftc.go.kr 정보공개서 열람 페이지 파서 (caption/th 텍스트 매칭).
export function parseFtcViewerHtml(html: string): FtcFacts {
  const $ = cheerioLoad(html);
  const out = emptyFacts();

  // 등록일 — "(YYYY.MM.DD)" 패턴 추출
  const regDates = Array.from(html.matchAll(/\(20\d{2}\.\d{2}\.\d{2}\)/g))
    .map((m) => m[0].replace(/[()]/g, "").replace(/\./g, "-"))
    .sort();
  if (regDates.length > 0) {
    out.source_first_registered_at = regDates[0];
    out.source_registered_at = regDates[regDates.length - 1];
    out.source_year = out.source_registered_at.slice(0, 4);
  }

  // 법인명 — "상호명", "법인명" 라벨 행
  $("table").each((_, table) => {
    $(table).find("tr").each((_, tr) => {
      const th = $(tr).find("th").first().text().trim();
      const td = $(tr).find("td").first().text().trim();
      if (!th || !td) return;
      if (/법인명|상호/.test(th) && !out.corp_name) out.corp_name = td;
      if (/계약\s*기간/.test(th)) out.contract_years = toNumber(td);
    });
  });

  // 핵심 테이블: caption 또는 첫 th 기반 섹션 판정
  $("table").each((_, table) => {
    const caption = $(table).find("caption").text().trim();
    const firstTh = $(table).find("th").first().text().trim();
    const label = caption || firstTh;
    if (!label) return;

    const rows = $(table).find("tbody tr, tr").toArray();
    const cellMap = new Map<string, string>();
    for (const tr of rows) {
      const th = $(tr).find("th").first().text().trim();
      const td = $(tr).find("td").first().text().trim();
      if (th && td) cellMap.set(th, td);
    }

    if (/가맹점\s*(현황|수|변동)/.test(label)) {
      for (const [k, v] of cellMap) {
        const n = toNumber(v);
        if (/신규/.test(k) && n != null) out.new_stores = n;
        else if (/계약종료|종료/.test(k) && n != null) out.closed_stores = n;
        else if (/계약해지|해지/.test(k) && n != null) out.terminated_stores = n;
        else if (/전체|총\s*가맹점|가맹점수|연말/.test(k) && n != null) out.stores_total = n;
      }
    }
    if (/평균\s*매출|매출액/.test(label)) {
      for (const [k, v] of cellMap) {
        const n = toNumber(v);
        if (n == null) continue;
        if (/월\s*평균/.test(k)) out.avg_monthly_revenue = n;
        else if (/면적|평당|㎡당/.test(k)) out.area_unit_revenue = n;
        else if (/업종\s*평균|업계\s*평균/.test(k)) out.industry_avg_revenue = n;
      }
    }
    if (/창업비용|가맹금|가맹비|가입비/.test(label)) {
      for (const [k, v] of cellMap) {
        const n = toNumber(v);
        if (n == null) continue;
        if (/가맹금|가맹비|가입비/.test(k)) out.franchise_fee = n;
        else if (/교육비/.test(k)) out.education_fee = n;
        else if (/보증금/.test(k)) out.deposit = n;
        else if (/합계|총액|총\s*비용/.test(k)) out.cost_total = n;
      }
    }
    if (/법\s*위반|시정|제재/.test(label)) {
      for (const [k, v] of cellMap) {
        const n = toNumber(v);
        if (/건수|합계|총/.test(k) && n != null) { out.violations_total = n; break; }
      }
    }
    if (/폐점|종료율/.test(label)) {
      for (const [, v] of cellMap) {
        const m = String(v).match(/(\d+(?:\.\d+)?)\s*%/);
        if (m) { out.closure_rate = parseFloat(m[1]); break; }
      }
    }
  });

  out.sources = [
    "공정거래위원회 정보공개서 (franchise.ftc.go.kr) — 프랜도어 HTML 업로드",
  ];
  return out;
}

function resolvePath(cands: string[]): string | null {
  for (const p of cands) { try { if (fs.existsSync(p)) return p; } catch { /* noop */ } }
  return null;
}

async function main() {
  loadEnv();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error("[ftc-seed] env missing: NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY");
    process.exit(1);
  }
  const sb = createClient(url, key);

  for (const entry of FILES) {
    const src = resolvePath(entry.pathCandidates);
    if (!src) {
      console.error(`[ftc-seed] SKIP ${entry.brandName}: no file found. Tried:\n  ${entry.pathCandidates.join("\n  ")}`);
      continue;
    }

    let parsed: FtcFacts = emptyFacts();
    let method = "";
    if (entry.format === "html") {
      try {
        parsed = parseFtcViewerHtml(fs.readFileSync(src, "utf8"));
        method = "html_parse_mvp";
      } catch (e) {
        console.error(`[ftc-seed] ${entry.brandName} parse fail:`, e instanceof Error ? e.message : e);
        process.exitCode = 1;
        continue;
      }
    } else {
      console.log(`[ftc-seed] xlsx parser not yet implemented (${entry.brandName}), skip`);
      continue;
    }

    const payload = {
      brand_id: entry.brandId,
      brand_name: entry.brandName,
      source_year: parsed.source_year,
      source_registered_at: parsed.source_registered_at,
      source_first_registered_at: parsed.source_first_registered_at,
      stores_total: parsed.stores_total,
      new_stores: parsed.new_stores,
      closed_stores: parsed.closed_stores,
      terminated_stores: parsed.terminated_stores,
      avg_monthly_revenue: parsed.avg_monthly_revenue,
      area_unit_revenue: parsed.area_unit_revenue,
      cost_total: parsed.cost_total,
      franchise_fee: parsed.franchise_fee,
      education_fee: parsed.education_fee,
      deposit: parsed.deposit,
      closure_rate: parsed.closure_rate,
      industry_avg_revenue: parsed.industry_avg_revenue,
      violations_total: parsed.violations_total,
      contract_years: parsed.contract_years,
      corp_name: parsed.corp_name,
      source_ingest_method: method,
      sources: parsed.sources,
      raw: { source_file: path.basename(src) },
      updated_at: new Date().toISOString(),
    };
    const { error } = await sb.from("frandoor_ftc_facts").upsert(payload, { onConflict: "brand_id" });
    if (error) {
      console.error(`[ftc-seed] ${entry.brandName} UPSERT 실패:`, error.message);
      process.exitCode = 1;
    } else {
      console.log(
        `[ftc-seed] ${entry.brandName} OK — stores_total=${payload.stores_total}, source_year=${payload.source_year}, registered=${payload.source_registered_at}, method=${method}`,
      );
    }
  }
}

main().catch((e) => { console.error("[ftc-seed] fatal:", e); process.exit(1); });
