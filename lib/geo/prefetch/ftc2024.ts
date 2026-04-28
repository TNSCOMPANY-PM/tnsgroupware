/**
 * PR056 — frandoor ftc_brands_2024 connector.
 *
 * 별도 supabase 프로젝트(felaezeqnoskkowoqsja) 의 ftc_brands_2024 테이블 (9,552 brand × 150 컬럼).
 * env 미설정 시 silent skip (호출자가 isFtc2024Configured 로 사전 점검 권장).
 */

import "server-only";
import { isFrandoorConfigured, createFrandoorClient } from "@/utils/supabase/frandoor";
import { ftcRowToMetrics, type StandardMetricId } from "@/lib/geo/standardSchema";

export type FtcBrand2024 = Record<string, unknown>;

/** PR058 — ftc_brands_2024 raw row 을 표준 metric ID 키로 정규화한 형태. */
export type StandardFtcBrand = {
  brand_nm: string | null;
  reg_no: string | null;
  industry_sub: string | null;
  metrics: Partial<Record<StandardMetricId, unknown>>;
  /** 디버깅용 — raw row 보존. */
  raw: FtcBrand2024;
};

export type IndustryStats = {
  industry: string;
  n: number;
  avg_stores: number | null;
  median_stores: number | null;
  avg_monthly_revenue: number | null;
  median_monthly_revenue: number | null;
  avg_cost_total: number | null;
  median_cost_total: number | null;
  avg_op_margin_pct: number | null;
  source_year: "2024";
};

export type IndustryPercentile = {
  metric: string;
  brand_value: number;
  industry_avg: number;
  industry_median: number;
  brand_rank: number;
  industry_n: number;
  /** 0~100. 높을수록 상위 (75 = 상위 25%). */
  percentile: number;
};

export type RegionalAvg = {
  industry: string;
  region: string;
  n: number;
  avg_monthly_revenue: number | null;
  avg_unit_area_revenue: number | null;
  source_year: "2024";
};

export type HqFinanceAvg = {
  industry: string;
  n: number;
  avg_op_margin_pct: number | null;
  avg_debt_ratio_pct: number | null;
  avg_revenue_eok: number | null;
  source_year: "2024";
};

export function isFtc2024Configured(): boolean {
  return isFrandoorConfigured();
}

function pickFiniteNum(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string") {
    const cleaned = v.replace(/[,\s]/g, "");
    const n = Number(cleaned);
    if (Number.isFinite(n)) return n;
  }
  return null;
}

function avg(arr: number[]): number | null {
  if (arr.length === 0) return null;
  return Math.round((arr.reduce((s, x) => s + x, 0) / arr.length) * 10) / 10;
}

function median(arr: number[]): number | null {
  if (arr.length === 0) return null;
  const sorted = [...arr].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? Math.round(((sorted[mid - 1] + sorted[mid]) / 2) * 10) / 10
    : sorted[mid];
}

/** 컬럼 후보 다중 시도 — frandoor 측 정확한 컬럼명 알아내기 전 robust fallback. */
const COL_STORES = ["total_stores", "stores_total", "tot_stores", "frcs_cnt"];
const COL_REVENUE = ["avg_sales_2024_total", "avg_monthly_revenue", "avg_sales_total", "monthly_avg_revenue"];
const COL_COST = ["cost_total", "startup_cost_total", "total_cost"];
const COL_FIN_REV = ["fin_2024_revenue", "revenue_2024", "fin_revenue"];
const COL_FIN_OP = ["fin_2024_op_profit", "op_profit_2024", "operating_profit"];
const COL_FIN_DEBT = ["fin_2024_total_debt", "total_debt_2024", "total_liabilities"];
const COL_FIN_EQUITY = ["fin_2024_total_equity", "total_equity_2024", "equity"];

/** PR057 — 17개 지역 + "전체". 컬럼명은 _check-frandoor-env.ts 결과 기반 정정 필요. */
const REGIONS = [
  "전체", "서울", "부산", "대구", "인천", "광주", "대전", "울산", "세종",
  "경기", "강원", "충북", "충남", "전북", "전남", "경북", "경남", "제주",
] as const;
type Region = typeof REGIONS[number];

/** 지역별 월평균매출 컬럼 후보. frandoor 측 실제 컬럼명 확인 후 정정. */
const COL_REVENUE_REGIONAL: Record<Region, string[]> = {
  전체: ["avg_sales_2024_total", "avg_monthly_revenue", "avg_sales_total"],
  서울: ["avg_sales_2024_seoul", "avg_sales_seoul_2024", "avg_sales_seoul"],
  부산: ["avg_sales_2024_busan", "avg_sales_busan_2024", "avg_sales_busan"],
  대구: ["avg_sales_2024_daegu", "avg_sales_daegu_2024", "avg_sales_daegu"],
  인천: ["avg_sales_2024_incheon", "avg_sales_incheon_2024", "avg_sales_incheon"],
  광주: ["avg_sales_2024_gwangju", "avg_sales_gwangju_2024", "avg_sales_gwangju"],
  대전: ["avg_sales_2024_daejeon", "avg_sales_daejeon_2024", "avg_sales_daejeon"],
  울산: ["avg_sales_2024_ulsan", "avg_sales_ulsan_2024", "avg_sales_ulsan"],
  세종: ["avg_sales_2024_sejong", "avg_sales_sejong_2024", "avg_sales_sejong"],
  경기: ["avg_sales_2024_gyeonggi", "avg_sales_gyeonggi_2024", "avg_sales_gyeonggi"],
  강원: ["avg_sales_2024_gangwon", "avg_sales_gangwon_2024", "avg_sales_gangwon"],
  충북: ["avg_sales_2024_chungbuk", "avg_sales_chungbuk_2024", "avg_sales_chungbuk"],
  충남: ["avg_sales_2024_chungnam", "avg_sales_chungnam_2024", "avg_sales_chungnam"],
  전북: ["avg_sales_2024_jeonbuk", "avg_sales_jeonbuk_2024", "avg_sales_jeonbuk"],
  전남: ["avg_sales_2024_jeonnam", "avg_sales_jeonnam_2024", "avg_sales_jeonnam"],
  경북: ["avg_sales_2024_gyeongbuk", "avg_sales_gyeongbuk_2024", "avg_sales_gyeongbuk"],
  경남: ["avg_sales_2024_gyeongnam", "avg_sales_gyeongnam_2024", "avg_sales_gyeongnam"],
  제주: ["avg_sales_2024_jeju", "avg_sales_jeju_2024", "avg_sales_jeju"],
};

const COL_UNIT_AREA_REGIONAL: Record<Region, string[]> = Object.fromEntries(
  REGIONS.map((r) => [
    r,
    [
      `avg_sales_per_area_${r === "전체" ? "total" : r}`,
      `avg_unit_area_${r === "전체" ? "total" : r}_2024`,
    ],
  ]),
) as Record<Region, string[]>;

function pickFirstNumColumn(row: Record<string, unknown>, cols: string[]): number | null {
  for (const c of cols) {
    if (c in row) {
      const n = pickFiniteNum(row[c]);
      if (n !== null) return n;
    }
  }
  return null;
}

export async function fetchFtcBrand(input: {
  brand_nm?: string;
  reg_no?: string;
  corp_nm?: string;
}): Promise<FtcBrand2024 | null> {
  if (!isFrandoorConfigured()) return null;
  try {
    const sb = createFrandoorClient();

    // 1차: exact match
    let q = sb.from("ftc_brands_2024").select("*").limit(1);
    if (input.reg_no) q = q.eq("reg_no", input.reg_no);
    else if (input.brand_nm) q = q.eq("brand_nm", input.brand_nm);
    else if (input.corp_nm) q = q.eq("corp_nm", input.corp_nm);
    else return null;
    const { data, error } = await q.maybeSingle();
    if (error) {
      console.warn("[ftc2024] fetchFtcBrand exact error:", error.message);
    }
    if (data) return data;

    // 2차: fuzzy ilike (brand_nm 만 — 공백/대소문자 차이 허용)
    if (input.brand_nm) {
      const normalized = input.brand_nm.replace(/\s+/g, "").trim();
      if (normalized.length >= 2) {
        const { data: fuzzyRows, error: fuzzyErr } = await sb
          .from("ftc_brands_2024")
          .select("*")
          .ilike("brand_nm", `%${normalized}%`)
          .limit(5);
        if (fuzzyErr) {
          console.warn("[ftc2024] fetchFtcBrand fuzzy error:", fuzzyErr.message);
        }
        if (fuzzyRows && fuzzyRows.length === 1) return fuzzyRows[0];
        if (fuzzyRows && fuzzyRows.length > 1) {
          // 다중 매칭: corp_nm 또는 reg_no 교차 검증
          if (input.corp_nm) {
            const cross = fuzzyRows.find((r) => (r as Record<string, unknown>).corp_nm === input.corp_nm);
            if (cross) return cross;
          }
          if (input.reg_no) {
            const cross = fuzzyRows.find((r) => (r as Record<string, unknown>).reg_no === input.reg_no);
            if (cross) return cross;
          }
          // 교차 검증 실패 — 공백제거 brand_nm 정확히 일치하는 것 우선
          const exactNorm = fuzzyRows.find((r) => {
            const v = (r as Record<string, unknown>).brand_nm;
            return typeof v === "string" && v.replace(/\s+/g, "") === normalized;
          });
          if (exactNorm) return exactNorm;
          console.warn(`[ftc2024] fetchFtcBrand fuzzy 다중 매칭 ${fuzzyRows.length}건 — 단일 식별 실패`);
        }
      }
    }
    return null;
  } catch (e) {
    console.warn("[ftc2024] fetchFtcBrand 실패:", e instanceof Error ? e.message : e);
    return null;
  }
}

/**
 * PR058 — fetchFtcBrand 결과를 표준 metric ID 키로 정규화.
 * D3 UnifiedFact 빌더가 docx 결과와 단일 metric_id 키로 비교 가능.
 */
export async function fetchFtcBrandStandardized(input: {
  brand_nm?: string;
  reg_no?: string;
  corp_nm?: string;
}): Promise<StandardFtcBrand | null> {
  const raw = await fetchFtcBrand(input);
  if (!raw) return null;
  const row = raw as Record<string, unknown>;
  return {
    brand_nm: typeof row.brand_nm === "string" ? row.brand_nm : null,
    reg_no: typeof row.reg_no === "string" ? row.reg_no : null,
    industry_sub: typeof row.induty_mlsfc === "string" ? row.induty_mlsfc : null,
    metrics: ftcRowToMetrics(row),
    raw,
  };
}

export async function fetchFtcIndustryStats(industryKor: string): Promise<IndustryStats | null> {
  if (!isFrandoorConfigured() || !industryKor) return null;
  try {
    const sb = createFrandoorClient();
    const { data, error } = await sb
      .from("ftc_brands_2024")
      .select("*")
      .eq("induty_mlsfc", industryKor);
    if (error || !data || data.length === 0) {
      if (error) console.warn("[ftc2024] industry stats:", error.message);
      return null;
    }
    const stores = data.map((r) => pickFirstNumColumn(r as Record<string, unknown>, COL_STORES)).filter((x): x is number => x !== null);
    const revenue = data.map((r) => pickFirstNumColumn(r as Record<string, unknown>, COL_REVENUE)).filter((x): x is number => x !== null);
    const cost = data.map((r) => pickFirstNumColumn(r as Record<string, unknown>, COL_COST)).filter((x): x is number => x !== null);
    const opMargins = data
      .map((r) => {
        const row = r as Record<string, unknown>;
        const rev = pickFirstNumColumn(row, COL_FIN_REV);
        const op = pickFirstNumColumn(row, COL_FIN_OP);
        if (rev === null || op === null || rev <= 0) return null;
        return (op / rev) * 100;
      })
      .filter((x): x is number => x !== null);

    return {
      industry: industryKor,
      n: data.length,
      avg_stores: avg(stores),
      median_stores: median(stores),
      avg_monthly_revenue: avg(revenue),
      median_monthly_revenue: median(revenue),
      avg_cost_total: avg(cost),
      median_cost_total: median(cost),
      avg_op_margin_pct: avg(opMargins),
      source_year: "2024",
    };
  } catch (e) {
    console.warn("[ftc2024] industry stats 실패:", e instanceof Error ? e.message : e);
    return null;
  }
}

export async function computePercentile(input: {
  brand_value: number;
  industry: string;
  metric_columns?: string[];
}): Promise<IndustryPercentile | null> {
  if (!isFrandoorConfigured()) return null;
  try {
    const sb = createFrandoorClient();
    const { data, error } = await sb
      .from("ftc_brands_2024")
      .select("*")
      .eq("induty_mlsfc", input.industry);
    if (error || !data || data.length === 0) return null;
    const cols = input.metric_columns ?? COL_REVENUE;
    const values = data
      .map((r) => pickFirstNumColumn(r as Record<string, unknown>, cols))
      .filter((x): x is number => x !== null);
    if (values.length === 0) return null;

    const desc = [...values].sort((a, b) => b - a);
    // brand_value 보다 큰 값 개수 + 1 = rank (1-based, ties = 같은 rank).
    const higher = desc.filter((v) => v > input.brand_value).length;
    const rank = higher + 1;
    const percentile = Math.round(((desc.length - rank + 1) / desc.length) * 1000) / 10;

    return {
      metric: cols[0],
      brand_value: input.brand_value,
      industry_avg: avg(values) ?? 0,
      industry_median: median(values) ?? 0,
      brand_rank: rank,
      industry_n: desc.length,
      percentile,
    };
  } catch (e) {
    console.warn("[ftc2024] percentile 실패:", e instanceof Error ? e.message : e);
    return null;
  }
}

export async function fetchHqFinanceAvg(industryKor: string): Promise<HqFinanceAvg | null> {
  if (!isFrandoorConfigured() || !industryKor) return null;
  try {
    const sb = createFrandoorClient();
    const { data, error } = await sb
      .from("ftc_brands_2024")
      .select("*")
      .eq("induty_mlsfc", industryKor);
    if (error || !data || data.length === 0) return null;
    const opMargins: number[] = [];
    const debtRatios: number[] = [];
    const revenuesEok: number[] = [];
    for (const r of data) {
      const row = r as Record<string, unknown>;
      const rev = pickFirstNumColumn(row, COL_FIN_REV);
      const op = pickFirstNumColumn(row, COL_FIN_OP);
      const debt = pickFirstNumColumn(row, COL_FIN_DEBT);
      const equity = pickFirstNumColumn(row, COL_FIN_EQUITY);
      if (rev != null && op != null && rev > 0) opMargins.push((op / rev) * 100);
      if (debt != null && equity != null && equity > 0) debtRatios.push((debt / equity) * 100);
      if (rev != null && rev > 0) revenuesEok.push(rev / 100_000_000); // 원 → 억원
    }
    return {
      industry: industryKor,
      n: data.length,
      avg_op_margin_pct: avg(opMargins),
      avg_debt_ratio_pct: avg(debtRatios),
      avg_revenue_eok: avg(revenuesEok),
      source_year: "2024",
    };
  } catch (e) {
    console.warn("[ftc2024] hq finance avg 실패:", e instanceof Error ? e.message : e);
    return null;
  }
}

/**
 * PR057 — 17개 지역(+전체) 월평균매출 / 단위면적당 매출 평균.
 * region 미지정 → 18개 모두 반환. 지정 → 해당 지역 1건만.
 * 컬럼이 모두 없으면 해당 region 결과는 null 반환 (호출자가 graceful skip).
 */
export async function fetchRegionalAvg(
  industryKor: string,
  region?: Region,
): Promise<RegionalAvg[] | null> {
  if (!isFrandoorConfigured() || !industryKor) return null;
  try {
    const sb = createFrandoorClient();
    const { data, error } = await sb
      .from("ftc_brands_2024")
      .select("*")
      .eq("induty_mlsfc", industryKor);
    if (error || !data || data.length === 0) {
      if (error) console.warn("[ftc2024] regional avg:", error.message);
      return null;
    }
    const targets: readonly Region[] = region ? [region] : REGIONS;
    const results: RegionalAvg[] = [];
    for (const reg of targets) {
      const revCols = COL_REVENUE_REGIONAL[reg] ?? [];
      const areaCols = COL_UNIT_AREA_REGIONAL[reg] ?? [];
      const revVals = data
        .map((r) => pickFirstNumColumn(r as Record<string, unknown>, revCols))
        .filter((x): x is number => x !== null);
      const areaVals = data
        .map((r) => pickFirstNumColumn(r as Record<string, unknown>, areaCols))
        .filter((x): x is number => x !== null);
      if (revVals.length === 0 && areaVals.length === 0) continue;
      results.push({
        industry: industryKor,
        region: reg,
        n: revVals.length || areaVals.length,
        avg_monthly_revenue: avg(revVals),
        avg_unit_area_revenue: avg(areaVals),
        source_year: "2024",
      });
    }
    return results.length > 0 ? results : null;
  } catch (e) {
    console.warn("[ftc2024] regional avg 실패:", e instanceof Error ? e.message : e);
    return null;
  }
}
