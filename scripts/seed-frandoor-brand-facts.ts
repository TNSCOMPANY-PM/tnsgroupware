/* PR030 — 본사 POS 엑셀 → frandoor_brand_facts 배치 시드 (범용).
 *
 * 사용:
 *   npx tsx scripts/seed-frandoor-brand-facts.ts
 *
 * 추가 브랜드: FILES 배열에 { brandName, brandId, xlsxPath, ... } append.
 * 엑셀 시트 규칙: 시트명 "YY.MM" (예: "23.03"), 시트 내부에 "점포명/매장명/지점" + "매출/합계/금액" 컬럼.
 */
import * as fs from "node:fs";
import * as path from "node:path";
import * as XLSX from "xlsx";
import { createClient } from "@supabase/supabase-js";

type BrandEntry = {
  brandName: string;
  brandId: string;
  xlsxPath: string;
  ftcFirstRegistered: string | null;
  corporationFoundedYear: number | null;
};

const FILES: BrandEntry[] = [
  {
    brandName: "오공김밥",
    brandId: "82c7ffc9-ed53-44bf-859d-a9a72b147b20",
    xlsxPath: "C:/Users/user1/Dropbox/claude/GEO프로젝트/오공김밥 2023~최근 매장별 매출현황(실제 본사자료) (1).xlsx",
    ftcFirstRegistered: null,
    corporationFoundedYear: null,
  },
];

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

function detectColumn(keys: string[], pattern: RegExp): string | null {
  for (const k of keys) if (pattern.test(k)) return k;
  return null;
}

function parseBrandExcel(xlsxPath: string): PosMonth[] {
  const wb = XLSX.readFile(xlsxPath, { cellDates: false });
  const months: PosMonth[] = [];
  for (const sheetName of wb.SheetNames) {
    const m = sheetName.match(/^(\d{2})\.(\d{1,2})$/);
    if (!m) continue;
    const mm = m[2].padStart(2, "0");
    const year_month = `20${m[1]}-${mm}`;
    const sheet = wb.Sheets[sheetName];
    if (!sheet) continue;
    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: null });
    if (rows.length === 0) continue;
    const headers = Object.keys(rows[0] ?? {});
    const nameKey = detectColumn(headers, /점포|매장|지점|가맹점/);
    if (!nameKey) continue;
    const salesKey =
      detectColumn(headers, /월\s*매출|매출\s*합계|총\s*매출|매출/) ??
      detectColumn(headers, /합계|금액/);
    if (!salesKey) continue;

    const records = rows
      .map((r) => {
        const name = String(r[nameKey] ?? "").trim();
        const rawSales = r[salesKey];
        const sales =
          typeof rawSales === "number"
            ? rawSales
            : Number(String(rawSales ?? "").replace(/[,\s]/g, ""));
        if (!name || !Number.isFinite(sales) || sales <= 0) return null;
        if (/총계|합계|TOTAL|소계/i.test(name)) return null;
        return { name, sales };
      })
      .filter((x): x is { name: string; sales: number } => x !== null);

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
    console.error("[seed] env 누락: NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY");
    process.exit(1);
  }
  const sb = createClient(url, key);

  for (const entry of FILES) {
    if (!fs.existsSync(entry.xlsxPath)) {
      console.error(`[seed] SKIP: ${entry.xlsxPath} not found`);
      continue;
    }
    console.log(`[seed] ${entry.brandName} — parsing ${path.basename(entry.xlsxPath)}`);
    let posMonthly: PosMonth[] = [];
    try {
      posMonthly = parseBrandExcel(entry.xlsxPath);
    } catch (e) {
      console.error(`[seed] ${entry.brandName} 파싱 실패:`, e instanceof Error ? e.message : e);
      process.exitCode = 1;
      continue;
    }
    const latest = posMonthly[posMonthly.length - 1];
    if (!latest) {
      console.error(`[seed] ${entry.brandName}: 유효 시트 0건 (YY.MM 형식 시트 없음 또는 컬럼 감지 실패)`);
      const wb = XLSX.readFile(entry.xlsxPath);
      console.error(`  sheets = ${wb.SheetNames.join(", ")}`);
      const first = wb.SheetNames[0];
      if (first) {
        const dump = XLSX.utils.sheet_to_json<Record<string, unknown>>(wb.Sheets[first], { defval: null }).slice(0, 3);
        console.error(`  first sheet sample (3 rows):`, JSON.stringify(dump, null, 2));
      }
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
      raw: { source_file: path.basename(entry.xlsxPath) },
      updated_at: new Date().toISOString(),
    };
    const { error } = await sb.from("frandoor_brand_facts").upsert(payload, { onConflict: "brand_id" });
    if (error) {
      console.error(`[seed] ${entry.brandName} UPSERT 실패:`, error.message);
      process.exitCode = 1;
    } else {
      console.log(
        `[seed] ${entry.brandName} OK — ${posMonthly.length}개월, 최신 ${latest.year_month} 활성 ${latest.store_count}점`,
      );
    }
  }
}

main().catch((e) => {
  console.error("[seed] fatal:", e);
  process.exit(1);
});
