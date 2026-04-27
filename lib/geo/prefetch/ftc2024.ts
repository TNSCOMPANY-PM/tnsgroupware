/**
 * PR056 — frandoor ftc_brands_2024 connector.
 *
 * 별도 supabase 프로젝트(felaezeqnoskkowoqsja) 의 ftc_brands_2024 테이블 (9,552 brand × 150 컬럼).
 * env 미설정 시 silent skip (호출자가 isFtc2024Configured 로 사전 점검 권장).
 */

import "server-only";
import { isFrandoorConfigured, createFrandoorClient } from "@/utils/supabase/frandoor";

export type FtcBrand2024 = Record<string, unknown>;

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
    let q = sb.from("ftc_brands_2024").select("*").limit(1);
    if (input.reg_no) q = q.eq("reg_no", input.reg_no);
    else if (input.brand_nm) q = q.eq("brand_nm", input.brand_nm);
    else if (input.corp_nm) q = q.eq("corp_nm", input.corp_nm);
    else return null;
    const { data, error } = await q.maybeSingle();
    if (error) {
      console.warn("[ftc2024] fetchFtcBrand error:", error.message);
      return null;
    }
    return data;
  } catch (e) {
    console.warn("[ftc2024] fetchFtcBrand 실패:", e instanceof Error ? e.message : e);
    return null;
  }
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
