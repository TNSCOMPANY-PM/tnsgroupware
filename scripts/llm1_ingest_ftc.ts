/**
 * v2-02 LLM1 batch — ftc_brands_2024 → brand_facts (provenance='ftc') + industry_facts.
 *
 * Deterministic 코드 (LLM 호출 없음). 9,552 brand × 평균 25~40 metric → ~250~380k row.
 * + 외식 15 업종 × 9 metric × 5 agg_method ≈ 675 row industry_facts.
 *
 * 사용:
 *   npx tsx scripts/llm1_ingest_ftc.ts
 *   npx tsx scripts/llm1_ingest_ftc.ts --dry-run        (실제 적재 X, 통계만)
 *   npx tsx scripts/llm1_ingest_ftc.ts --industry "분식" (특정 업종만)
 *   npx tsx scripts/llm1_ingest_ftc.ts --reset          (provenance='ftc' 전부 삭제 후 재적재)
 *   npx tsx scripts/llm1_ingest_ftc.ts --limit 50       (테스트 — 50 brand 만)
 */

import * as fs from "node:fs";
import * as path from "node:path";

// ─── .env.local 직접 로드 ───
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

type MetricId = string;

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

// ─── ftc 컬럼명 → metric_id 매핑 (PR059 실측 컬럼명 기반) ───
type ColMapping = { metric_id: MetricId; transform?: (v: number) => number };

const FTC_COL_TO_METRIC: Record<string, ColMapping> = {
  // 기본
  induty_mlsfc: { metric_id: "industry_sub" },

  // 매출 (천원/연 → 만원/연. monthly_avg_revenue 는 derived ÷12)
  avg_sales_2024_total: { metric_id: "annual_revenue", transform: (v) => Math.round(v / 10) },

  // 가맹점
  frcs_cnt_2024_total: { metric_id: "stores_total" },
  chg_2024_new_open: { metric_id: "stores_new_open" },
  chg_2024_contract_end: { metric_id: "stores_close_terminate" },
  chg_2024_contract_cancel: { metric_id: "stores_close_cancel" },
  chg_2024_name_change: { metric_id: "stores_ownership_change" },

  // 창업 비용 (천원 → 만원 ÷10)
  startup_cost_total: { metric_id: "cost_total", transform: (v) => Math.round(v / 10) },
  startup_fee: { metric_id: "cost_franchise_fee", transform: (v) => Math.round(v / 10) },
  education_fee: { metric_id: "cost_education_fee", transform: (v) => Math.round(v / 10) },
  deposit_fee: { metric_id: "cost_deposit", transform: (v) => Math.round(v / 10) },
  other_fee: { metric_id: "cost_other", transform: (v) => Math.round(v / 10) },
  interior_cost_total: { metric_id: "cost_interior", transform: (v) => Math.round(v / 10) },
  interior_std_area: { metric_id: "cost_store_area" },

  // 본사 재무 (천원 → 만원)
  fin_2024_revenue: { metric_id: "hq_revenue", transform: (v) => Math.round(v / 10) },
  fin_2024_op_profit: { metric_id: "hq_op_profit", transform: (v) => Math.round(v / 10) },
  fin_2024_net_income: { metric_id: "hq_net_profit", transform: (v) => Math.round(v / 10) },
  fin_2024_total_asset: { metric_id: "hq_total_asset", transform: (v) => Math.round(v / 10) },
  fin_2024_total_equity: { metric_id: "hq_total_equity", transform: (v) => Math.round(v / 10) },
  fin_2024_total_debt: { metric_id: "hq_total_debt", transform: (v) => Math.round(v / 10) },
  staff_cnt: { metric_id: "hq_employees" },

  // 컴플라이언스
  violation_correction: { metric_id: "law_violations" },
  violation_civil: { metric_id: "disputes_count" },
};

const SOURCE_LABEL_FTC = "공정거래위원회 정보공개서 2024 (frandoor 적재본)";
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

// 외식 15 업종 (induty_mlsfc 의 distinct 값 — 실측 후 정정 가능)
const RESTAURANT_INDUSTRIES = new Set([
  "한식", "중식", "일식", "양식", "분식", "치킨", "피자", "햄버거",
  "커피·음료", "주점", "베이커리", "디저트", "아이스크림", "도시락·죽", "기타외식",
]);

const INDUSTRY_AGG_METRICS: MetricId[] = [
  "monthly_avg_revenue", "annual_revenue", "stores_total",
  "cost_total", "cost_franchise_fee", "cost_interior", "cost_per_pyung",
  "hq_op_margin_pct", "hq_debt_ratio_pct",
];
const AGG_METHODS = ["trimmed_mean_5pct", "median", "p25", "p75", "p90"] as const;

/**
 * v2-09 brand name 정규화. 법인격/괄호/공백/구두점 모두 제거 후 lowercase.
 *  · "(주)오공김밥" → "오공김밥"
 *  · "주식회사 오공김밥" → "오공김밥"
 *  · "오공김밥(외식)" → "오공김밥"
 *  · "OGONG.KIMBAB" → "ogongkimbab"
 */
function normalizeBrandName(s: string): string {
  if (!s) return "";
  let n = s;
  // 괄호 + 안 내용 제거 (앞 (주) 등 포함)
  n = n.replace(/\([^)]*\)/g, "");
  n = n.replace(/（[^）]*）/g, "");
  // 법인격
  n = n.replace(/주식회사|유한회사|합자회사|합명회사|\(주\)|\（주\）/g, "");
  // 공백 / 점 / 따옴표 / 하이픈 / 언더스코어 / 슬래시
  n = n.replace(/[\s.,'"\-_/·•~`!@#$%^&*+=|\\<>?:;{}[\]]/g, "");
  return n.toLowerCase().trim();
}

type MatchTier = "exact" | "normalized" | "contains";
type MatchResult =
  | { id: string; tier: MatchTier; raw: string; matchedTo: string }
  | null;

/**
 * v2-09 다단계 brand 매칭.
 *  1. exact (raw trimmed) — fast path
 *  2. normalized — 법인격/괄호/공백 제거 후 비교
 *  3. contains — 3+자 normalized 가 부분 포함되면 hit (false positive 위험 → 콘솔 로그)
 */
function matchBrand(
  ftcName: string,
  geoList: Array<{ id: string; name: string; normalized: string }>,
  rawMap: Map<string, string>,
  normMap: Map<string, string>,
): MatchResult {
  const trimmed = ftcName.trim();
  if (!trimmed) return null;

  // 1) exact
  const exactId = rawMap.get(trimmed);
  if (exactId) return { id: exactId, tier: "exact", raw: trimmed, matchedTo: trimmed };

  // 2) normalized
  const norm = normalizeBrandName(trimmed);
  if (norm) {
    const normId = normMap.get(norm);
    if (normId) {
      const matchedTo = geoList.find((g) => g.id === normId)?.name ?? "?";
      return { id: normId, tier: "normalized", raw: trimmed, matchedTo };
    }
  }

  // 3) contains (3+자 — false positive 위험)
  if (norm.length >= 3) {
    // ftc norm 이 geo norm 에 포함 OR geo norm 이 ftc norm 에 포함
    const candidates = geoList.filter(
      (g) =>
        g.normalized.length >= 3 &&
        (g.normalized.includes(norm) || norm.includes(g.normalized)),
    );
    if (candidates.length === 1) {
      const c = candidates[0];
      console.log(
        `[match.contains] "${trimmed}" → "${c.name}" (norm: "${norm}" ↔ "${c.normalized}") — 수동 검증 권장`,
      );
      return { id: c.id, tier: "contains", raw: trimmed, matchedTo: c.name };
    } else if (candidates.length > 1) {
      console.log(
        `[match.contains] "${trimmed}" 다중 매칭 ${candidates.length}건 — skip (모호): ${candidates.map((c) => c.name).slice(0, 3).join(", ")}`,
      );
    }
  }

  return null;
}

/**
 * v2-09 frandoor.ftc_brands_2024 전수 조회 (.range 1000 row 단위 batch pagination).
 * supabase-js 는 기본 1000 row limit 이므로 명시적 .range() 반복 필수.
 */
async function fetchAllFtcBrands(
  fra: { from: (t: string) => unknown },
  selectCols: string,
  filter?: { industry?: string | null; limit?: number | null },
): Promise<Record<string, unknown>[]> {
  const PAGE = 1000;
  const all: Record<string, unknown>[] = [];
  for (let offset = 0; ; offset += PAGE) {
    const targetEnd = filter?.limit
      ? Math.min(offset + PAGE - 1, filter.limit - 1)
      : offset + PAGE - 1;
    if (filter?.limit && offset >= filter.limit) break;

    let q = (fra.from("ftc_brands_2024") as {
      select: (s: string) => {
        eq: (k: string, v: string) => unknown;
        range: (a: number, b: number) => Promise<{ data: unknown; error: { message: string } | null }>;
      };
    }).select(selectCols);
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
      console.error(`[ftc.fetchAll] batch range(${offset},${targetEnd}) 실패:`, error.message);
      throw new Error(error.message);
    }
    const batch = (data ?? []) as Record<string, unknown>[];
    all.push(...batch);
    process.stdout.write(`[ftc.fetchAll] batch range(${offset},${targetEnd}) → ${batch.length} row (누적 ${all.length})\n`);
    if (batch.length < PAGE) break; // 마지막 batch
  }
  return all;
}

function trimmedMean(values: number[], trimPct = 0.05): number | null {
  if (values.length === 0) return null;
  if (values.length < 10) {
    return values.reduce((s, v) => s + v, 0) / values.length;
  }
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

function percentile(values: number[], p: number): number | null {
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
      return percentile(values, 0.25);
    case "p75":
      return percentile(values, 0.75);
    case "p90":
      return percentile(values, 0.9);
  }
}

async function main() {
  const args = parseArgs();
  console.log(`\n=== LLM1 ingest ftc ===`);
  console.log(`옵션: dryRun=${args.dryRun} industry=${args.industry ?? "전체"} reset=${args.reset} limit=${args.limit ?? "-"}\n`);

  const { isFrandoorConfigured, createFrandoorClient } = await import("../utils/supabase/frandoor");
  const { createAdminClient } = await import("../utils/supabase/admin");
  const metricMod = await import("../lib/geo/v2/metric_ids");
  const METRIC_IDS = metricMod.METRIC_IDS;
  type TypedMetricId = keyof typeof METRIC_IDS;

  if (!isFrandoorConfigured()) {
    console.error("❌ FRANDOOR env 미설정");
    process.exit(1);
  }
  const fra = createFrandoorClient();
  const tns = createAdminClient();

  // (0) reset — v2-09: ftc + industry_facts 만 wipe, docx 보존
  if (args.reset && !args.dryRun) {
    console.log("[reset] brand_facts WHERE provenance IN ('ftc', 'frandoor_derived') 삭제 중...");
    const { error: rErr } = await fra
      .from("brand_facts")
      .delete()
      .in("provenance", ["ftc", "frandoor_derived"]);
    if (rErr) {
      console.error("[reset] brand_facts 실패:", rErr.message);
      process.exit(1);
    }
    console.log("[reset] industry_facts 전체 삭제 중...");
    const { error: iErr } = await fra.from("industry_facts").delete().not("id", "is", null);
    if (iErr) {
      console.error("[reset] industry_facts 실패:", iErr.message);
      process.exit(1);
    }
    console.log("[reset] ✓ ftc + industry_facts wipe (provenance='docx' 는 보존)\n");
  }

  // (1) tnsgroupware geo_brands → brand_id 매핑 (raw + normalized 두 키 동시 보유)
  const { data: geoBrands, error: gbErr } = await tns
    .from("geo_brands")
    .select("id, name");
  if (gbErr) {
    console.error("[geo_brands] 조회 실패:", gbErr.message);
    process.exit(1);
  }
  type GeoBrandEntry = { id: string; name: string; normalized: string };
  const geoBrandList: GeoBrandEntry[] = [];
  const geoBrandRawMap = new Map<string, string>();
  const geoBrandNormMap = new Map<string, string>();
  for (const b of geoBrands ?? []) {
    if (typeof b.name !== "string" || !b.name.trim()) continue;
    const trimmed = b.name.trim();
    const normalized = normalizeBrandName(trimmed);
    geoBrandList.push({ id: b.id, name: trimmed, normalized });
    geoBrandRawMap.set(trimmed, b.id);
    if (normalized) geoBrandNormMap.set(normalized, b.id);
  }
  console.log(`[geo_brands] ${geoBrandList.length} brand (raw=${geoBrandRawMap.size} norm=${geoBrandNormMap.size})`);

  // (2) ftc_brands_2024 fetch — v2-09: batch pagination 으로 전수 9552 read
  const ftcCols = Object.keys(FTC_COL_TO_METRIC).concat(["brand_nm"]);
  console.log(`[ftc_brands_2024] batch pagination 시작 (page=1000)...`);
  const rows = await fetchAllFtcBrands(fra as unknown as { from: (t: string) => unknown }, ftcCols.join(", "), {
    industry: args.industry,
    limit: args.limit,
  });
  console.log(`[ftc_brands_2024] ✓ 총 ${rows.length} row\n`);

  // (3) brand_facts 빌드 — v2-09: 다단계 matchBrand + 매칭 분포 추적
  const allFacts: BrandFactRow[] = [];
  let matchedBrands = 0;
  const matchTierCounts: Record<MatchTier, number> = { exact: 0, normalized: 0, contains: 0 };
  const matchedGeoBrandIds = new Set<string>();
  const ftcUnmatched: string[] = [];

  for (const row of rows) {
    const brandNmRaw = String(row.brand_nm ?? "").trim();
    if (!brandNmRaw) continue;
    const match = matchBrand(brandNmRaw, geoBrandList, geoBrandRawMap, geoBrandNormMap);
    if (!match) {
      // 우리 고객이 ftc 에 없는 case 와 ftc 에는 있지만 우리 고객 list 에 없는 case 가 섞임.
      // ftc 측에서 unmatched 로 뜨는 이름 = 우리 geo_brands 에 없는 brand → 90% 는 우리 고객 아님.
      // 진짜 알고 싶은 건 "우리 고객 중 ftc 에 없는 brand" → 별도 list (아래 (3z))
      ftcUnmatched.push(brandNmRaw);
      continue;
    }
    matchedBrands++;
    matchTierCounts[match.tier]++;
    matchedGeoBrandIds.add(match.id);
    const brandId = match.id;

    const localFacts: BrandFactRow[] = [];
    const metricsByCol: Record<MetricId, number | string | null> = {};

    // (3a) raw 매핑
    for (const [col, mapping] of Object.entries(FTC_COL_TO_METRIC)) {
      const raw = row[col];
      if (raw == null || raw === "") continue;
      const metricMeta = METRIC_IDS[mapping.metric_id as TypedMetricId];
      if (!metricMeta) continue;

      let value_num: number | null = null;
      let value_text: string | null = null;
      if (typeof raw === "string" && !/^-?[\d.,]+$/.test(raw)) {
        value_text = raw.trim();
        metricsByCol[mapping.metric_id] = value_text;
      } else {
        const n = typeof raw === "number" ? raw : Number(String(raw).replace(/,/g, ""));
        if (!Number.isFinite(n) || n === 0) continue;
        value_num = mapping.transform ? mapping.transform(n) : n;
        metricsByCol[mapping.metric_id] = value_num;
      }

      localFacts.push({
        brand_id: brandId,
        metric_id: mapping.metric_id,
        metric_label: metricMeta.label,
        value_num,
        value_text,
        unit: metricMeta.unit,
        period: PERIOD,
        provenance: "ftc",
        source_tier: "A",
        source_url: SOURCE_URL_FTC,
        source_label: SOURCE_LABEL_FTC,
        confidence: "high",
      });
    }

    // (3b) derived metric — annual_revenue / 12 = monthly_avg_revenue
    const annual = metricsByCol["annual_revenue"];
    if (typeof annual === "number" && annual > 0) {
      const monthly = Math.round(annual / 12);
      localFacts.push({
        brand_id: brandId,
        metric_id: "monthly_avg_revenue",
        metric_label: METRIC_IDS.monthly_avg_revenue.label,
        value_num: monthly,
        value_text: null,
        unit: METRIC_IDS.monthly_avg_revenue.unit,
        period: PERIOD,
        provenance: "frandoor_derived",
        source_tier: "A",
        source_url: SOURCE_URL_FTC,
        source_label: "frandoor 산출 (annual_revenue / 12)",
        confidence: "high",
        formula: "annual_revenue / 12",
        inputs: { annual_revenue: annual },
      });
    }

    // (3c) hq_op_margin_pct
    const hqRev = metricsByCol["hq_revenue"];
    const hqOp = metricsByCol["hq_op_profit"];
    if (typeof hqRev === "number" && hqRev > 0 && typeof hqOp === "number") {
      const margin = Math.round((hqOp / hqRev) * 1000) / 10;
      localFacts.push({
        brand_id: brandId,
        metric_id: "hq_op_margin_pct",
        metric_label: METRIC_IDS.hq_op_margin_pct.label,
        value_num: margin,
        value_text: null,
        unit: METRIC_IDS.hq_op_margin_pct.unit,
        period: PERIOD,
        provenance: "frandoor_derived",
        source_tier: "A",
        source_url: SOURCE_URL_FTC,
        source_label: "frandoor 산출 (hq_op_profit / hq_revenue × 100)",
        confidence: "high",
        formula: "(hq_op_profit / hq_revenue) * 100",
        inputs: { hq_op_profit: hqOp, hq_revenue: hqRev },
      });
    }

    // (3d) hq_debt_ratio_pct
    const hqDebt = metricsByCol["hq_total_debt"];
    const hqEquity = metricsByCol["hq_total_equity"];
    if (typeof hqDebt === "number" && typeof hqEquity === "number" && hqEquity > 0) {
      const ratio = Math.round((hqDebt / hqEquity) * 1000) / 10;
      localFacts.push({
        brand_id: brandId,
        metric_id: "hq_debt_ratio_pct",
        metric_label: METRIC_IDS.hq_debt_ratio_pct.label,
        value_num: ratio,
        value_text: null,
        unit: METRIC_IDS.hq_debt_ratio_pct.unit,
        period: PERIOD,
        provenance: "frandoor_derived",
        source_tier: "A",
        source_url: SOURCE_URL_FTC,
        source_label: "frandoor 산출 (hq_total_debt / hq_total_equity × 100)",
        confidence: "high",
        formula: "(hq_total_debt / hq_total_equity) * 100",
        inputs: { hq_total_debt: hqDebt, hq_total_equity: hqEquity },
      });
    }

    // (3e) hq_stores_per_employee
    const stores = metricsByCol["stores_total"];
    const employees = metricsByCol["hq_employees"];
    if (typeof stores === "number" && typeof employees === "number" && employees > 0) {
      const perEmp = Math.round((stores / employees) * 10) / 10;
      localFacts.push({
        brand_id: brandId,
        metric_id: "hq_stores_per_employee",
        metric_label: METRIC_IDS.hq_stores_per_employee.label,
        value_num: perEmp,
        value_text: null,
        unit: METRIC_IDS.hq_stores_per_employee.unit,
        period: PERIOD,
        provenance: "frandoor_derived",
        source_tier: "A",
        source_url: SOURCE_URL_FTC,
        source_label: "frandoor 산출 (stores_total / hq_employees)",
        confidence: "high",
        formula: "stores_total / hq_employees",
        inputs: { stores_total: stores, hq_employees: employees },
      });
    }

    // (3f) cost_per_pyung — interior_cost / (store_area / 3.3)
    const interiorCost = metricsByCol["cost_interior"];
    const storeArea = metricsByCol["cost_store_area"];
    if (typeof interiorCost === "number" && typeof storeArea === "number" && storeArea > 0) {
      const perPy = Math.round(interiorCost / (storeArea / 3.3));
      if (Number.isFinite(perPy) && perPy > 0) {
        localFacts.push({
          brand_id: brandId,
          metric_id: "cost_per_pyung",
          metric_label: METRIC_IDS.cost_per_pyung.label,
          value_num: perPy,
          value_text: null,
          unit: METRIC_IDS.cost_per_pyung.unit,
          period: PERIOD,
          provenance: "frandoor_derived",
          source_tier: "A",
          source_url: SOURCE_URL_FTC,
          source_label: "frandoor 산출 (cost_interior / (store_area / 3.3))",
          confidence: "high",
          formula: "cost_interior / (cost_store_area / 3.3)",
          inputs: { cost_interior: interiorCost, cost_store_area: storeArea },
        });
      }
    }

    allFacts.push(...localFacts);
  }

  // v2-09 진단 — 89 brand 매칭 분포 + 우리 고객 중 ftc 에 없는 brand list
  console.log(`\n=== 매칭 진단 ===`);
  console.log(
    `[brand_facts] 매칭 brand=${matchedBrands} (geo unique=${matchedGeoBrandIds.size}/${geoBrandList.length}) / ftc unmatched=${ftcUnmatched.length}/${rows.length}`,
  );
  console.log(
    `  매칭 tier 분포: exact=${matchTierCounts.exact} / normalized=${matchTierCounts.normalized} / contains=${matchTierCounts.contains}`,
  );
  // 우리 geo_brands 중 ftc 에서 매칭 안 된 brand list (재민이 직접 검토)
  const unmatchedGeoBrands = geoBrandList
    .filter((g) => !matchedGeoBrandIds.has(g.id))
    .map((g) => g.name);
  if (unmatchedGeoBrands.length > 0) {
    console.log(
      `\n  ⚠ 우리 고객 ${unmatchedGeoBrands.length}/${geoBrandList.length} brand 가 ftc 에 없음 (또는 표기 차이로 미매칭):`,
    );
    for (const n of unmatchedGeoBrands) console.log(`    - ${n}`);
  }
  // ftc unmatched (우리 고객 아닌 brand 일 가능성 높음 — 처음 10개만 샘플)
  if (ftcUnmatched.length > 0) {
    console.log(
      `\n  ftc unmatched 샘플 (총 ${ftcUnmatched.length}, 대부분 우리 고객 아님): ${ftcUnmatched.slice(0, 10).join(", ")}${ftcUnmatched.length > 10 ? " ..." : ""}`,
    );
  }
  console.log(
    `\n[brand_facts] 총 row=${allFacts.length} (brand 평균 ${(allFacts.length / matchedBrands || 0).toFixed(1)} metric)\n`,
  );

  // (4) industry_facts 빌드 — ALL ftc rows 기준 (우리 고객 한정 X, 전체 9552 brand 집계)
  const industryGroups = new Map<string, Map<MetricId, number[]>>();
  for (const row of rows) {
    const industry = String(row.induty_mlsfc ?? "").trim();
    if (!industry) continue;

    // raw 매핑값 산출 (brand 단위 fact 생성 로직과 동일하지만 industry 용으로 별도 압축)
    const localMetrics: Record<string, number> = {};
    for (const [col, mapping] of Object.entries(FTC_COL_TO_METRIC)) {
      const raw = row[col];
      if (raw == null || raw === "") continue;
      const n = typeof raw === "number" ? raw : Number(String(raw).replace(/,/g, ""));
      if (!Number.isFinite(n) || n === 0) continue;
      const v = mapping.transform ? mapping.transform(n) : n;
      localMetrics[mapping.metric_id] = v;
    }
    // derived (industry 평균에 포함될 monthly_avg / op_margin / debt_ratio)
    if (typeof localMetrics["annual_revenue"] === "number" && localMetrics["annual_revenue"] > 0) {
      localMetrics["monthly_avg_revenue"] = Math.round(localMetrics["annual_revenue"] / 12);
    }
    const rev = localMetrics["hq_revenue"];
    const op = localMetrics["hq_op_profit"];
    if (typeof rev === "number" && rev > 0 && typeof op === "number") {
      localMetrics["hq_op_margin_pct"] = Math.round((op / rev) * 1000) / 10;
    }
    const debt = localMetrics["hq_total_debt"];
    const equity = localMetrics["hq_total_equity"];
    if (typeof debt === "number" && typeof equity === "number" && equity > 0) {
      localMetrics["hq_debt_ratio_pct"] = Math.round((debt / equity) * 1000) / 10;
    }
    const stores = localMetrics["stores_total"];
    const interior = localMetrics["cost_interior"];
    const area = localMetrics["cost_store_area"];
    if (typeof interior === "number" && typeof area === "number" && area > 0) {
      const perPy = Math.round(interior / (area / 3.3));
      if (Number.isFinite(perPy) && perPy > 0) localMetrics["cost_per_pyung"] = perPy;
    }
    void stores;

    if (!industryGroups.has(industry)) industryGroups.set(industry, new Map());
    const m = industryGroups.get(industry)!;
    for (const mid of INDUSTRY_AGG_METRICS) {
      const v = localMetrics[mid];
      if (typeof v !== "number" || !Number.isFinite(v) || v <= 0) continue;
      if (!m.has(mid)) m.set(mid, []);
      m.get(mid)!.push(v);
    }
  }

  const industryFactRows: Array<{
    industry: string;
    metric_id: string;
    metric_label: string;
    value_num: number;
    unit: string;
    period: string;
    n: number;
    agg_method: (typeof AGG_METHODS)[number];
    source_label: string;
  }> = [];
  for (const [industry, metricMap] of industryGroups.entries()) {
    for (const [mid, values] of metricMap.entries()) {
      if (values.length === 0) continue;
      const meta = METRIC_IDS[mid as TypedMetricId];
      if (!meta) continue;
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
  console.log(`[industry_facts] ${industryFactRows.length} row (${industryGroups.size} 업종)\n`);

  // 업종 목록 미리보기
  const industriesPreview = [...industryGroups.keys()].slice(0, 15);
  console.log(`  업종: ${industriesPreview.join(", ")}\n`);

  if (args.dryRun) {
    console.log("✓ dry-run 모드 — 적재 skip\n");
    process.exit(0);
  }

  // (5) brand_facts 적재 (배치 1000)
  console.log("[brand_facts] upsert 시작...");
  const BATCH = 1000;
  let upserted = 0;
  for (let i = 0; i < allFacts.length; i += BATCH) {
    const slice = allFacts.slice(i, i + BATCH);
    const { error: insErr } = await fra
      .from("brand_facts")
      .upsert(slice, { onConflict: "brand_id,metric_id,period,provenance" });
    if (insErr) {
      console.error(`[brand_facts] batch ${i}: ${insErr.message}`);
      process.exit(1);
    }
    upserted += slice.length;
    if ((i / BATCH) % 10 === 0) console.log(`  ${upserted}/${allFacts.length}`);
  }
  console.log(`✓ brand_facts ${upserted} row upsert 완료\n`);

  // (6) industry_facts 적재
  console.log("[industry_facts] upsert 시작...");
  for (let i = 0; i < industryFactRows.length; i += BATCH) {
    const slice = industryFactRows.slice(i, i + BATCH);
    const { error: ifErr } = await fra
      .from("industry_facts")
      .upsert(slice, { onConflict: "industry,metric_id,period,agg_method" });
    if (ifErr) {
      console.error(`[industry_facts] batch ${i}: ${ifErr.message}`);
      process.exit(1);
    }
  }
  console.log(`✓ industry_facts ${industryFactRows.length} row upsert 완료\n`);

  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
