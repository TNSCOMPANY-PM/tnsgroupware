/**
 * v2-10 LLM1 batch — ftc_brands_2024 → brand_facts (provenance='ftc') + industry_facts.
 *
 * v2-10 architectural pivot:
 *   · brand_facts.brand_id = ftc_brands_2024.id (UUID, ftc PK) — 9,552 brand 전수 universe.
 *   · geo_brands 의존 완전 제거. 우리 고객 89 매핑은 LLM2 (extract-facts) 가 담당.
 *   · 152 컬럼 raw 전수 적재 (skip 메타 제외, brand 당 80~120 fact 기대).
 *   · industry_facts: 외식 15+ 업종 × N metric × 5 agg_method.
 *
 * 사용:
 *   npx tsx scripts/llm1_ingest_ftc.ts --dry-run        (적재 X, 통계만)
 *   npx tsx scripts/llm1_ingest_ftc.ts --reset          (ftc + frandoor_derived + industry_facts wipe 후 재적재. docx 보존)
 *   npx tsx scripts/llm1_ingest_ftc.ts --industry "분식" (특정 업종만)
 *   npx tsx scripts/llm1_ingest_ftc.ts --limit 100      (테스트 — 100 brand)
 */

import * as fs from "node:fs";
import * as path from "node:path";

const envPath = path.resolve(process.cwd(), ".env.local");
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const m = line.match(/^([A-Z0-9_]+)=([\s\S]*)$/);
    if (!m) continue;
    let v = m[2];
    if (v.startsWith("'") && v.endsWith("'")) v = v.slice(1, -1);
    if (v.startsWith('"') && v.endsWith('"')) v = v.slice(1, -1);
    if (!process.env[m[1]]) process.env[m[1]] = v;
  }
}

type Args = {
  dryRun: boolean;
  industry: string | null;
  reset: boolean;
  limit: number | null;
};

function parseArgs(): Args {
  const a: Args = { dryRun: false, industry: null, reset: false, limit: null };
  const argv = process.argv.slice(2);
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--dry-run") a.dryRun = true;
    else if (arg === "--reset") a.reset = true;
    else if (arg === "--industry") a.industry = argv[++i];
    else if (arg === "--limit") a.limit = parseInt(argv[++i], 10);
  }
  return a;
}

const SOURCE_LABEL_FTC = "공정거래위원회 정보공개서 (2024-12 기준)";
const SOURCE_URL_FTC = "https://franchise.ftc.go.kr/";
const PERIOD = "2024-12";

type BrandFactRow = {
  brand_id: string;
  metric_id: string;
  metric_label: string;
  value_num: number | null;
  value_text: string | null;
  unit: string;
  period: string;
  provenance: "ftc" | "frandoor_derived";
  source_tier: "A" | "B" | "C";
  source_url: string;
  source_label: string;
  confidence: "high" | "medium" | "low";
  formula?: string | null;
  inputs?: Record<string, unknown> | null;
};

const INDUSTRY_AGG_METRICS = [
  "monthly_avg_revenue",
  "avg_sales_2024_total",
  "frcs_cnt_2024_total",
  "startup_cost_total",
  "startup_fee",
  "interior_cost_total",
  "interior_cost_per_sqm",
  "fin_2024_op_margin_pct",
  "fin_2024_debt_ratio_pct",
];
const AGG_METHODS = ["trimmed_mean_5pct", "median", "p25", "p75", "p90"] as const;

function trimmedMean(values: number[], trimPct = 0.05): number | null {
  if (values.length === 0) return null;
  if (values.length < 10) return values.reduce((s, v) => s + v, 0) / values.length;
  const sorted = [...values].sort((a, b) => a - b);
  const trim = Math.floor(sorted.length * trimPct);
  const trimmed = sorted.slice(trim, sorted.length - trim);
  if (trimmed.length === 0) return null;
  return trimmed.reduce((s, v) => s + v, 0) / trimmed.length;
}

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

function pct(values: number[], p: number): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.floor(sorted.length * p);
  return sorted[Math.min(idx, sorted.length - 1)];
}

function aggregate(values: number[], method: (typeof AGG_METHODS)[number]): number | null {
  if (values.length === 0) return null;
  switch (method) {
    case "trimmed_mean_5pct":
      return trimmedMean(values, 0.05);
    case "median":
      return median(values);
    case "p25":
      return pct(values, 0.25);
    case "p75":
      return pct(values, 0.75);
    case "p90":
      return pct(values, 0.9);
  }
}

/** range pagination 으로 ftc_brands_2024 전수 fetch. */
async function fetchAllFtcBrands(
  fra: { from: (t: string) => unknown },
  filter?: { industry?: string | null; limit?: number | null },
): Promise<Record<string, unknown>[]> {
  const PAGE = 1000;
  const all: Record<string, unknown>[] = [];
  for (let offset = 0; ; offset += PAGE) {
    if (filter?.limit && offset >= filter.limit) break;
    const targetEnd = filter?.limit
      ? Math.min(offset + PAGE - 1, filter.limit - 1)
      : offset + PAGE - 1;

    let q = (fra.from("ftc_brands_2024") as {
      select: (s: string) => unknown;
    }).select("*");
    if (filter?.industry) {
      q = (q as unknown as { eq: (k: string, v: string) => typeof q }).eq(
        "induty_mlsfc",
        filter.industry,
      );
    }
    const { data, error } = await (q as unknown as {
      range: (a: number, b: number) => Promise<{ data: unknown; error: { message: string } | null }>;
    }).range(offset, targetEnd);
    if (error) {
      console.error(`[ftc.fetchAll] range(${offset},${targetEnd}) 실패:`, error.message);
      throw new Error(error.message);
    }
    const batch = (data ?? []) as Record<string, unknown>[];
    all.push(...batch);
    process.stdout.write(
      `[ftc.fetchAll] range(${offset},${targetEnd}) → ${batch.length} row (누적 ${all.length})\n`,
    );
    if (batch.length < PAGE) break;
  }
  return all;
}

async function main() {
  const args = parseArgs();
  console.log(`\n=== LLM1 ingest ftc (v2-10) ===`);
  console.log(
    `옵션: dryRun=${args.dryRun} industry=${args.industry ?? "전체"} reset=${args.reset} limit=${args.limit ?? "-"}\n`,
  );

  const { isFrandoorConfigured, createFrandoorClient } = await import("../utils/supabase/frandoor");
  const { FTC_COLUMN_META, getColumnMeta, isIngestibleColumn } = await import(
    "../lib/geo/v2/ftc_column_labels"
  );

  if (!isFrandoorConfigured()) {
    console.error("❌ FRANDOOR env 미설정");
    process.exit(1);
  }
  const fra = createFrandoorClient();

  // (0) reset — ftc + frandoor_derived + industry_facts wipe (docx 보존)
  if (args.reset && !args.dryRun) {
    console.log("[reset] brand_facts WHERE provenance IN ('ftc','frandoor_derived') 삭제 중...");
    const { error: rErr } = await fra
      .from("brand_facts")
      .delete()
      .in("provenance", ["ftc", "frandoor_derived"]);
    if (rErr) {
      console.error("[reset] brand_facts:", rErr.message);
      process.exit(1);
    }
    console.log("[reset] industry_facts 전체 삭제 중...");
    const { error: iErr } = await fra.from("industry_facts").delete().not("id", "is", null);
    if (iErr) {
      console.error("[reset] industry_facts:", iErr.message);
      process.exit(1);
    }
    console.log("[reset] ✓ ftc + industry_facts wipe (provenance='docx' 는 보존)\n");
  }

  // (1) ftc_brands_2024 전수 fetch
  console.log(`[ftc] fetch 시작 (range pagination)...`);
  const rows = await fetchAllFtcBrands(fra as unknown as { from: (t: string) => unknown }, {
    industry: args.industry,
    limit: args.limit,
  });
  console.log(`[ftc] ✓ 총 ${rows.length} brand\n`);

  // (2) 152 컬럼 raw 전수 → brand_facts row 변환
  // 동시에 derived metric 5종 계산 (annual → monthly / op_margin / debt_ratio / per_employee / per_pyung)
  const allFacts: BrandFactRow[] = [];
  let skippedNoBrandId = 0;
  let factsTotal = 0;
  let derivedTotal = 0;

  // 컬럼 정의 통계
  const colStats = { explicit: 0, inferred: 0, skipped: 0 };
  if (rows.length > 0) {
    const sampleCols = Object.keys(rows[0]);
    for (const col of sampleCols) {
      if (!isIngestibleColumn(col)) {
        colStats.skipped++;
        continue;
      }
      if (FTC_COLUMN_META[col]) colStats.explicit++;
      else colStats.inferred++;
    }
    console.log(
      `[columns] sample=${sampleCols.length} (explicit=${colStats.explicit}, heuristic=${colStats.inferred}, skip=${colStats.skipped})\n`,
    );
  }

  for (const row of rows) {
    const brandId = String(row.id ?? "").trim();
    if (!brandId) {
      skippedNoBrandId++;
      continue;
    }

    // raw 매핑 (skip 컬럼 외 모두)
    const brandFacts: BrandFactRow[] = [];
    const metricsByCol: Record<string, number> = {};

    for (const [col, raw] of Object.entries(row)) {
      if (!isIngestibleColumn(col)) continue;
      if (raw == null || raw === "") continue;
      const meta = getColumnMeta(col);

      // 숫자 변환 시도
      const isNumeric =
        typeof raw === "number" ||
        (typeof raw === "string" && /^-?[\d,]+(\.\d+)?$/.test(raw.trim()));

      let value_num: number | null = null;
      let value_text: string | null = null;

      if (isNumeric) {
        const n = typeof raw === "number" ? raw : Number(String(raw).replace(/,/g, ""));
        if (!Number.isFinite(n) || n === 0) continue;
        value_num = meta.transform ? meta.transform(n) : n;
        if (typeof value_num === "number" && Number.isFinite(value_num)) {
          metricsByCol[col] = value_num;
        }
      } else if (typeof raw === "string") {
        value_text = raw.trim();
        if (!value_text) continue;
      } else {
        continue;
      }

      brandFacts.push({
        brand_id: brandId,
        metric_id: col,
        metric_label: meta.label,
        value_num,
        value_text,
        unit: meta.unit,
        period: PERIOD,
        provenance: "ftc",
        source_tier: "A",
        source_url: SOURCE_URL_FTC,
        source_label: SOURCE_LABEL_FTC,
        confidence: "high",
      });
    }

    factsTotal += brandFacts.length;

    // ─── derived 5종 ───
    const annual = metricsByCol["avg_sales_2024_total"];
    if (typeof annual === "number" && annual > 0) {
      const monthly = Math.round(annual / 12);
      brandFacts.push({
        brand_id: brandId,
        metric_id: "monthly_avg_revenue",
        metric_label: "가맹점 월평균매출",
        value_num: monthly,
        value_text: null,
        unit: "만원",
        period: PERIOD,
        provenance: "frandoor_derived",
        source_tier: "A",
        source_url: SOURCE_URL_FTC,
        source_label: "frandoor 산출 (avg_sales_2024_total / 12)",
        confidence: "high",
        formula: "avg_sales_2024_total / 12",
        inputs: { avg_sales_2024_total: annual },
      });
      derivedTotal++;
    }
    const rev = metricsByCol["fin_2024_revenue"];
    const op = metricsByCol["fin_2024_op_profit"];
    if (typeof rev === "number" && rev > 0 && typeof op === "number") {
      const margin = Math.round((op / rev) * 1000) / 10;
      brandFacts.push({
        brand_id: brandId,
        metric_id: "fin_2024_op_margin_pct",
        metric_label: "본사 영업이익률 (2024)",
        value_num: margin,
        value_text: null,
        unit: "%",
        period: PERIOD,
        provenance: "frandoor_derived",
        source_tier: "A",
        source_url: SOURCE_URL_FTC,
        source_label: "frandoor 산출 (op_profit / revenue × 100)",
        confidence: "high",
        formula: "(fin_2024_op_profit / fin_2024_revenue) * 100",
        inputs: { fin_2024_op_profit: op, fin_2024_revenue: rev },
      });
      derivedTotal++;
    }
    const debt = metricsByCol["fin_2024_total_debt"];
    const equity = metricsByCol["fin_2024_total_equity"];
    if (typeof debt === "number" && typeof equity === "number" && equity > 0) {
      const ratio = Math.round((debt / equity) * 1000) / 10;
      brandFacts.push({
        brand_id: brandId,
        metric_id: "fin_2024_debt_ratio_pct",
        metric_label: "본사 부채비율 (2024)",
        value_num: ratio,
        value_text: null,
        unit: "%",
        period: PERIOD,
        provenance: "frandoor_derived",
        source_tier: "A",
        source_url: SOURCE_URL_FTC,
        source_label: "frandoor 산출 (debt / equity × 100)",
        confidence: "high",
        formula: "(fin_2024_total_debt / fin_2024_total_equity) * 100",
        inputs: { fin_2024_total_debt: debt, fin_2024_total_equity: equity },
      });
      derivedTotal++;
    }
    const stores = metricsByCol["frcs_cnt_2024_total"];
    const employees = metricsByCol["staff_cnt"];
    if (typeof stores === "number" && typeof employees === "number" && employees > 0) {
      const perEmp = Math.round((stores / employees) * 10) / 10;
      brandFacts.push({
        brand_id: brandId,
        metric_id: "stores_per_employee",
        metric_label: "직원 1인당 가맹점",
        value_num: perEmp,
        value_text: null,
        unit: "개",
        period: PERIOD,
        provenance: "frandoor_derived",
        source_tier: "A",
        source_url: SOURCE_URL_FTC,
        source_label: "frandoor 산출 (stores / staff)",
        confidence: "high",
        formula: "frcs_cnt_2024_total / staff_cnt",
        inputs: { frcs_cnt_2024_total: stores, staff_cnt: employees },
      });
      derivedTotal++;
    }
    const interior = metricsByCol["interior_cost_total"];
    const area = metricsByCol["interior_std_area"] ?? metricsByCol["store_area_sqm"];
    if (typeof interior === "number" && typeof area === "number" && area > 0) {
      const perPy = Math.round(interior / (area / 3.3));
      if (Number.isFinite(perPy) && perPy > 0) {
        brandFacts.push({
          brand_id: brandId,
          metric_id: "cost_per_pyung",
          metric_label: "평당 인테리어 단가 (산출)",
          value_num: perPy,
          value_text: null,
          unit: "만원",
          period: PERIOD,
          provenance: "frandoor_derived",
          source_tier: "A",
          source_url: SOURCE_URL_FTC,
          source_label: "frandoor 산출 (interior_cost / (area / 3.3))",
          confidence: "high",
          formula: "interior_cost_total / (interior_std_area / 3.3)",
          inputs: { interior_cost_total: interior, interior_std_area: area },
        });
        derivedTotal++;
      }
    }

    allFacts.push(...brandFacts);
  }

  console.log(
    `[brand_facts] 총 ${allFacts.length} row (raw=${factsTotal} + derived=${derivedTotal}) — brand 평균 ${(allFacts.length / Math.max(rows.length - skippedNoBrandId, 1)).toFixed(1)} fact`,
  );
  if (skippedNoBrandId > 0) console.log(`  ⚠ brand_id 없음 ${skippedNoBrandId}건 skip`);

  // (3) industry_facts — 외식 전체 ftc rows 기준 group by induty_mlsfc
  const industryGroups = new Map<string, Map<string, number[]>>();
  for (const row of rows) {
    const industry = String(row.induty_mlsfc ?? "").trim();
    if (!industry) continue;

    const localMetrics: Record<string, number> = {};
    for (const [col, raw] of Object.entries(row)) {
      if (!isIngestibleColumn(col)) continue;
      if (raw == null || raw === "") continue;
      const meta = getColumnMeta(col);
      const isNumeric =
        typeof raw === "number" ||
        (typeof raw === "string" && /^-?[\d,]+(\.\d+)?$/.test(raw.trim()));
      if (!isNumeric) continue;
      const n = typeof raw === "number" ? raw : Number(String(raw).replace(/,/g, ""));
      if (!Number.isFinite(n) || n === 0) continue;
      localMetrics[col] = meta.transform ? meta.transform(n) : n;
    }
    // derived
    if (typeof localMetrics["avg_sales_2024_total"] === "number") {
      localMetrics["monthly_avg_revenue"] = Math.round(localMetrics["avg_sales_2024_total"] / 12);
    }
    const r = localMetrics["fin_2024_revenue"];
    const o = localMetrics["fin_2024_op_profit"];
    if (typeof r === "number" && r > 0 && typeof o === "number") {
      localMetrics["fin_2024_op_margin_pct"] = Math.round((o / r) * 1000) / 10;
    }
    const d = localMetrics["fin_2024_total_debt"];
    const e = localMetrics["fin_2024_total_equity"];
    if (typeof d === "number" && typeof e === "number" && e > 0) {
      localMetrics["fin_2024_debt_ratio_pct"] = Math.round((d / e) * 1000) / 10;
    }

    if (!industryGroups.has(industry)) industryGroups.set(industry, new Map());
    const m = industryGroups.get(industry)!;
    for (const mid of INDUSTRY_AGG_METRICS) {
      const v = localMetrics[mid];
      if (typeof v !== "number" || !Number.isFinite(v) || v <= 0) continue;
      if (!m.has(mid)) m.set(mid, []);
      m.get(mid)!.push(v);
    }
  }

  type IndustryFactRow = {
    industry: string;
    metric_id: string;
    metric_label: string;
    value_num: number;
    unit: string;
    period: string;
    n: number;
    agg_method: (typeof AGG_METHODS)[number];
    source_label: string;
  };
  const industryFactRows: IndustryFactRow[] = [];
  for (const [industry, metricMap] of industryGroups.entries()) {
    for (const [mid, values] of metricMap.entries()) {
      if (values.length === 0) continue;
      const meta = FTC_COLUMN_META[mid] ?? {
        label: mid,
        unit: mid.endsWith("_pct") ? "%" : "",
      };
      for (const method of AGG_METHODS) {
        const v = aggregate(values, method);
        if (v == null) continue;
        industryFactRows.push({
          industry,
          metric_id: mid,
          metric_label: meta.label,
          value_num: Math.round(v * 10) / 10,
          unit: meta.unit,
          period: PERIOD,
          n: values.length,
          agg_method: method,
          source_label: `공정위 정보공개서 2024 (${industry} ${values.length} brand 집계, ${method})`,
        });
      }
    }
  }
  console.log(
    `[industry_facts] ${industryFactRows.length} row (${industryGroups.size} 업종)`,
  );
  console.log(`  업종 sample: ${[...industryGroups.keys()].slice(0, 15).join(", ")}\n`);

  if (args.dryRun) {
    console.log("✓ dry-run — 적재 skip\n");
    process.exit(0);
  }

  // (4) brand_facts upsert
  const BATCH = 1000;
  console.log(`[brand_facts] upsert 시작 (${allFacts.length} row, batch=${BATCH})...`);
  for (let i = 0; i < allFacts.length; i += BATCH) {
    const slice = allFacts.slice(i, i + BATCH);
    const { error } = await fra
      .from("brand_facts")
      .upsert(slice, { onConflict: "brand_id,metric_id,period,provenance" });
    if (error) {
      console.error(`[brand_facts] batch ${i}: ${error.message}`);
      process.exit(1);
    }
    if ((i / BATCH) % 10 === 0) console.log(`  ${i + slice.length}/${allFacts.length}`);
  }
  console.log(`✓ brand_facts ${allFacts.length} row 적재 완료\n`);

  // (5) industry_facts upsert
  console.log(`[industry_facts] upsert 시작 (${industryFactRows.length} row)...`);
  for (let i = 0; i < industryFactRows.length; i += BATCH) {
    const slice = industryFactRows.slice(i, i + BATCH);
    const { error } = await fra
      .from("industry_facts")
      .upsert(slice, { onConflict: "industry,metric_id,period,agg_method" });
    if (error) {
      console.error(`[industry_facts] batch ${i}: ${error.message}`);
      process.exit(1);
    }
  }
  console.log(`✓ industry_facts ${industryFactRows.length} row 적재 완료\n`);

  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
