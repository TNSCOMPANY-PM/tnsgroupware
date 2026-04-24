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
    try {
      posMonthly = parseBrandExcel(xlsxPath);
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
    const payload = {
      brand_id: entry.brandId,
      brand_name: entry.brandName,
      ftc_first_registered: entry.ftcFirstRegistered,
      stores_latest: latest.store_count,
      stores_latest_as_of: latest.year_month,
      pos_monthly: posMonthly,
      corporation_founded_year: entry.corporationFoundedYear,
      raw: { source_file: path.basename(xlsxPath) },
      updated_at: new Date().toISOString(),
    };
    const { error } = await sb.from("frandoor_brand_facts").upsert(payload, { onConflict: "brand_id" });
    if (error) {
      console.error("[seed] upsert fail:", error.message);
      process.exitCode = 1;
    } else {
      console.log("[seed] OK " + entry.brandName);
      console.log("  months=" + posMonthly.length + " latest=" + latest.year_month + " stores=" + latest.store_count);
      console.log("  total=" + latest.total_sales + " avg=" + latest.per_store_avg);
      console.log("  top3=" + latest.top3_stores.map((s) => s.name + ":" + s.sales).join(", "));
      console.log("  bot3=" + latest.bottom3_stores.map((s) => s.name + ":" + s.sales).join(", "));
    }
  }
}

main().catch((e) => { console.error("[seed] fatal:", e); process.exit(1); });
