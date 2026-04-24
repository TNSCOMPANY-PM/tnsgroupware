/* PR030 seed — 본사 POS 엑셀 → frandoor_brand_facts (범용 배치) */
import * as fs from "node:fs";
import * as path from "node:path";
import * as XLSX from "xlsx";
import { createClient } from "@supabase/supabase-js";

type BrandEntry = {
  brandName: string;
  brandId: string;
  xlsxCandidates: string[];
  ftcFirstRegistered: string | null;
  corporationFoundedYear: number | null;
};

const FILES: BrandEntry[] = [
  {
    brandName: "오공김밥",
    brandId: "82c7ffc9-ed53-44bf-859d-a9a72b147b20",
    xlsxCandidates: [
      "C:/Users/user1/Dropbox/claude/GEO프로젝트/오공김밥 2023~최근 매장별 매출현황(실제 본사자료) (1).xlsx",
      "/sessions/gifted-loving-darwin/mnt/GEO프로젝트/오공김밥 2023~최근 매장별 매출현황(실제 본사자료) (1).xlsx",
    ],
    ftcFirstRegistered: null,
    corporationFoundedYear: null,
  },
];

function resolveXlsx(cands: string[]): string | null {
  for (const p of cands) { try { if (fs.existsSync(p)) return p; } catch {} }
  return null;
}

type PosMonth = {
  year_month: string;
  store_count: number;
  total_sales: number;
  per_store_avg: number;
  top3_stores: Array<{ name: string; sales: number }>;
  bottom3_stores: Array<{ name: string; sales: number }>;
};

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

function toNumber(v: unknown): number {
  if (typeof v === "number") return v;
  const s = String(v ?? "").replace(/[,\s\u00A0]/g, "");
  const n = Number(s);
  return Number.isFinite(n) ? n : NaN;
}

function parseBrandExcel(xlsxPath: string): PosMonth[] {
  const wb = XLSX.readFile(xlsxPath, { cellDates: false });
  const months: PosMonth[] = [];
  for (const sheetName of wb.SheetNames) {
    const m = sheetName.match(/^(\d{2})\.(\d{1,2})$/);
    if (!m) continue;
    const year_month = "20" + m[1] + "-" + m[2].padStart(2, "0");
    const sheet = wb.Sheets[sheetName];
    if (!sheet) continue;
    const aoa = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: null });
    if (aoa.length < 3) continue;
    let headerRowIdx = -1;
    for (let i = 0; i < Math.min(aoa.length, 5); i++) {
      const row = (aoa[i] ?? []) as unknown[];
      if (row.some((c) => /날짜/.test(String(c ?? "")))) { headerRowIdx = i; break; }
    }
    if (headerRowIdx === -1) continue;
    const headers = (aoa[headerRowIdx] ?? []) as unknown[];
    const storeNames = headers.slice(1).map((h) => String(h ?? "").trim());
    const storeSales = new Map<string, number>();
    for (let i = headerRowIdx + 1; i < aoa.length; i++) {
      const row = (aoa[i] ?? []) as unknown[];
      for (let j = 1; j < row.length; j++) {
        const name = storeNames[j - 1];
        if (!name) continue;
        if (/총계|합계|TOTAL|소계/i.test(name)) continue;
        const sales = toNumber(row[j]);
        if (!Number.isFinite(sales) || sales <= 0) continue;
        storeSales.set(name, (storeSales.get(name) ?? 0) + sales);
      }
    }
    const records = Array.from(storeSales.entries())
      .filter(([n, s]) => n && s > 0 && !/총계|합계|TOTAL|소계/i.test(n))
      .map(([n, s]) => ({ name: n, sales: s }));
    if (records.length === 0) continue;
    records.sort((a, b) => b.sales - a.sales);
    const total = records.reduce((s, r) => s + r.sales, 0);
    months.push({
      year_month,
      store_count: records.length,
      total_sales: total,
      per_store_avg: Math.round(total / records.length),
      top3_stores: records.slice(0, 3),
      bottom3_stores: records.slice(-3).reverse(),
    });
  }
  months.sort((a, b) => a.year_month.localeCompare(b.year_month));
  return months;
}

// 점포별 월매출 시계열 수집 (store_records 용) — parseBrandExcel 과 별도로 실행.
// 반환: Map<storeName, [{year_month, sales}]>
function collectStoreSeries(xlsxPath: string): Map<string, Array<{ year_month: string; sales: number }>> {
  const wb = XLSX.readFile(xlsxPath, { cellDates: false });
  const series = new Map<string, Array<{ year_month: string; sales: number }>>();
  for (const sheetName of wb.SheetNames) {
    const m = sheetName.match(/^(\d{2})\.(\d{1,2})$/);
    if (!m) continue;
    const mm = m[2].padStart(2, "0");
    const year_month = "20" + m[1] + "-" + mm;
    const sheet = wb.Sheets[sheetName];
    if (!sheet) continue;
    const aoa = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: null });
    if (aoa.length < 3) continue;
    let headerRowIdx = -1;
    for (let i = 0; i < Math.min(aoa.length, 5); i++) {
      const row = (aoa[i] ?? []) as unknown[];
      if (row.some((c) => /날짜/.test(String(c ?? "")))) { headerRowIdx = i; break; }
    }
    if (headerRowIdx === -1) continue;
    const headers = (aoa[headerRowIdx] ?? []) as unknown[];
    const storeNames = headers.slice(1).map((h) => String(h ?? "").trim());
    const storeSales = new Map<string, number>();
    for (let i = headerRowIdx + 1; i < aoa.length; i++) {
      const row = (aoa[i] ?? []) as unknown[];
      for (let j = 1; j < row.length; j++) {
        const name = storeNames[j - 1];
        if (!name) continue;
        if (/총계|합계|TOTAL|소계/i.test(name)) continue;
        const sales = toNumber(row[j]);
        if (!Number.isFinite(sales) || sales <= 0) continue;
        storeSales.set(name, (storeSales.get(name) ?? 0) + sales);
      }
    }
    for (const [name, monthTotal] of storeSales) {
      if (!series.has(name)) series.set(name, []);
      series.get(name)!.push({ year_month, sales: monthTotal });
    }
  }
  for (const arr of series.values()) arr.sort((a, b) => a.year_month.localeCompare(b.year_month));
  return series;
}

// 파생지표 계산 — pos_monthly(월별 집계) 기반
function computeDerivedMetrics(posMonthly: PosMonth[]): {
  seasonal_peak_month: string | null;
  seasonal_trough_month: string | null;
  seasonal_ratio: number | null;
  yoy_growth: number | null;
  qoq_growth: number | null;
} {
  if (posMonthly.length === 0) {
    return { seasonal_peak_month: null, seasonal_trough_month: null, seasonal_ratio: null, yoy_growth: null, qoq_growth: null };
  }
  const recent12 = posMonthly.slice(-12);
  let peak = recent12[0], trough = recent12[0];
  for (const m of recent12) {
    if (m.total_sales > peak.total_sales) peak = m;
    if (m.total_sales < trough.total_sales) trough = m;
  }
  const seasonal_peak_month = peak.year_month;
  const seasonal_trough_month = trough.year_month;
  const seasonal_ratio = trough.total_sales > 0 ? Math.round((peak.total_sales / trough.total_sales) * 100) / 100 : null;

  // YoY: 최신월 vs 12개월 전
  let yoy_growth: number | null = null;
  if (posMonthly.length >= 13) {
    const cur = posMonthly[posMonthly.length - 1].total_sales;
    const prev = posMonthly[posMonthly.length - 13].total_sales;
    if (prev > 0) yoy_growth = Math.round(((cur - prev) / prev) * 1000) / 10;
  }
  // QoQ: 최신 3개월 합 vs 직전 3개월 합
  let qoq_growth: number | null = null;
  if (posMonthly.length >= 6) {
    const cur3 = posMonthly.slice(-3).reduce((s, m) => s + m.total_sales, 0);
    const prev3 = posMonthly.slice(-6, -3).reduce((s, m) => s + m.total_sales, 0);
    if (prev3 > 0) qoq_growth = Math.round(((cur3 - prev3) / prev3) * 1000) / 10;
  }
  return { seasonal_peak_month, seasonal_trough_month, seasonal_ratio, yoy_growth, qoq_growth };
}

async function main() {
  loadEnv();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error("[seed] env missing");
    process.exit(1);
  }
  const sb = createClient(url, key);

  for (const entry of FILES) {
    const xlsxPath = resolveXlsx(entry.xlsxCandidates);
    if (!xlsxPath) {
      console.error("[seed] SKIP " + entry.brandName);
      continue;
    }
    console.log("[seed] " + entry.brandName + " parsing");
    let posMonthly: PosMonth[] = [];
    let storeSeries = new Map<string, Array<{ year_month: string; sales: number }>>();
    try {
      posMonthly = parseBrandExcel(xlsxPath);
      storeSeries = collectStoreSeries(xlsxPath);
    } catch (e) {
      console.error("[seed] parse fail", e);
      process.exitCode = 1;
      continue;
    }
    const latest = posMonthly[posMonthly.length - 1];
    if (!latest) {
      console.error("[seed] no valid sheets");
      process.exitCode = 1;
      continue;
    }

    // 단위 스케일 자동 감지 — per_store_avg 가 1억 원 이상이면 원 단위 → /10000 변환
    const scaleDiv = latest.per_store_avg > 100_000_000 ? 10000 : 1;
    const toMan = (n: number) => Math.round(n / scaleDiv);

    const derived = computeDerivedMetrics(posMonthly);

    const payload = {
      brand_id: entry.brandId,
      brand_name: entry.brandName,
      ftc_first_registered: entry.ftcFirstRegistered,
      stores_latest: latest.store_count,
      stores_latest_as_of: latest.year_month,
      pos_monthly: posMonthly,
      corporation_founded_year: entry.corporationFoundedYear,
      seasonal_peak_month: derived.seasonal_peak_month,
      seasonal_trough_month: derived.seasonal_trough_month,
      seasonal_ratio: derived.seasonal_ratio,
      yoy_growth: derived.yoy_growth,
      qoq_growth: derived.qoq_growth,
      raw: { source_file: path.basename(xlsxPath) },
      updated_at: new Date().toISOString(),
    };
    const { error } = await sb.from("frandoor_brand_facts").upsert(payload, { onConflict: "brand_id" });
    if (error) {
      console.error("[seed] master upsert fail:", error.message);
      process.exitCode = 1;
      continue;
    }

    // 점포 익명 레코드 — 실명 해시 X, 매출 순위 기반 A지점/B지점... 라벨.
    // 정렬: 총매출 내림차순. 상위 25% = revenue_tier "A", 중위 50% = "B", 하위 25% = "C".
    const labeled = Array.from(storeSeries.entries())
      .map(([name, s]) => ({ name, series: s, total: s.reduce((sum, m) => sum + m.sales, 0) }))
      .sort((a, b) => b.total - a.total);
    const n = labeled.length;
    const storeRecords = labeled.map((s, i) => {
      const rank = (i + 1) / n;
      const tier = rank <= 0.25 ? "A" : rank <= 0.75 ? "B" : "C";
      // 라벨: A지점, B지점, ..., Z지점, AA지점, AB지점, ...
      let label: string;
      if (i < 26) label = String.fromCharCode(65 + i) + "지점";
      else {
        const q = Math.floor(i / 26) - 1;
        const r = i % 26;
        label = String.fromCharCode(65 + q) + String.fromCharCode(65 + r) + "지점";
      }
      return {
        brand_id: entry.brandId,
        display_label: label,
        revenue_tier: tier,
        region_major: null,
        location_type: null,
        area_tier: null,
        opened_at: null,
        closed_at: null,
        monthly_series: s.series.map((m) => ({ year_month: m.year_month, sales: toMan(m.sales) })),
      };
    });

    if (storeRecords.length > 0) {
      // idempotent: 기존 레코드 삭제 후 insert
      await sb.from("frandoor_store_records").delete().eq("brand_id", entry.brandId);
      const { error: recErr } = await sb.from("frandoor_store_records").insert(storeRecords);
      if (recErr) console.warn("[seed] store_records 경고:", recErr.message);
    }

    console.log("[seed] OK " + entry.brandName);
    console.log("  months=" + posMonthly.length + " latest=" + latest.year_month + " stores=" + latest.store_count);
    console.log("  total=" + latest.total_sales + " avg=" + latest.per_store_avg);
    console.log("  derived: peak=" + derived.seasonal_peak_month + " trough=" + derived.seasonal_trough_month + " ratio=" + derived.seasonal_ratio + " yoy=" + derived.yoy_growth + " qoq=" + derived.qoq_growth);
    console.log("  store_records: " + storeRecords.length + " 개 (A지점~" + (storeRecords.length > 0 ? storeRecords[storeRecords.length - 1].display_label : "-") + ")");
  }
}

main().catch((e) => { console.error("[seed] fatal:", e); process.exit(1); });
