import "server-only";
import { createAdminClient } from "@/utils/supabase/admin";

/** A급 공정위 정보공개서 (프랜도어 업로드) — v2 스키마 (master + timeseries + regional). */
export type FrandoorOfficialMaster = {
  brand_id: string;
  brand_name: string;
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
  latest_avg_annual_revenue: number | null;
  latest_avg_revenue_per_unit_area: number | null;
  avg_monthly_revenue: number | null;
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
  source_ingest_method: string | null;
  sources: string[];
};

export type FrandoorOfficialTimeseries = {
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

export type FrandoorOfficialRegional = {
  year: number;
  region: string;
  stores_franchise: number | null;
  stores_direct: number | null;
  avg_annual_revenue: number | null;
};

export type FrandoorOfficial = {
  master: FrandoorOfficialMaster;
  timeseries: FrandoorOfficialTimeseries[];
  regional: FrandoorOfficialRegional[];
};

type Row = Record<string, unknown>;

function pickStr(r: Row, k: string): string | null {
  const v = r[k];
  return typeof v === "string" && v.length > 0 ? v : null;
}
function pickNum(r: Row, k: string): number | null {
  const v = r[k];
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

export async function fetchFrandoorOfficial(brandId: string): Promise<FrandoorOfficial | null> {
  if (!brandId) return null;
  try {
    const sb = createAdminClient();
    const { data: m, error: mErr } = await sb
      .from("frandoor_ftc_facts")
      .select("*")
      .eq("brand_id", brandId)
      .maybeSingle();
    if (mErr || !m) return null;
    const row = m as Row;

    const master: FrandoorOfficialMaster = {
      brand_id: String(row.brand_id),
      brand_name: String(row.brand_name ?? ""),
      corp_name: pickStr(row, "corp_name"),
      representative: pickStr(row, "representative"),
      industry_main: pickStr(row, "industry_main"),
      industry_sub: pickStr(row, "industry_sub"),
      corp_founded_date: pickStr(row, "corp_founded_date"),
      biz_registered_date: pickStr(row, "biz_registered_date"),
      ftc_first_registered_date: pickStr(row, "ftc_first_registered_date") ?? pickStr(row, "source_first_registered_at"),
      ftc_latest_registered_date: pickStr(row, "ftc_latest_registered_date") ?? pickStr(row, "source_registered_at"),
      source_year: pickStr(row, "source_year") ?? pickStr(row, "latest_year"),
      source_registered_at: pickStr(row, "source_registered_at"),
      source_first_registered_at: pickStr(row, "source_first_registered_at"),
      hq_address: pickStr(row, "hq_address"),
      biz_type: pickStr(row, "biz_type"),
      franchise_started_date: pickStr(row, "franchise_started_date"),
      brand_count: pickNum(row, "brand_count"),
      affiliate_count: pickNum(row, "affiliate_count"),
      regional_hq_count: pickNum(row, "regional_hq_count"),
      latest_year: pickStr(row, "latest_year") ?? pickStr(row, "source_year"),
      stores_total: pickNum(row, "stores_total"),
      latest_avg_annual_revenue: pickNum(row, "latest_avg_annual_revenue"),
      latest_avg_revenue_per_unit_area: pickNum(row, "latest_avg_revenue_per_unit_area"),
      avg_monthly_revenue: pickNum(row, "avg_monthly_revenue"),
      franchise_fee: pickNum(row, "franchise_fee"),
      education_fee: pickNum(row, "education_fee"),
      deposit: pickNum(row, "deposit"),
      other_cost: pickNum(row, "other_cost"),
      cost_total: pickNum(row, "cost_total"),
      interior_per_unit_area: pickNum(row, "interior_per_unit_area"),
      reference_area: pickNum(row, "reference_area"),
      interior_total: pickNum(row, "interior_total"),
      contract_initial_years: pickNum(row, "contract_initial_years") ?? pickNum(row, "contract_years"),
      contract_extension_years: pickNum(row, "contract_extension_years"),
      violations_ftc: pickNum(row, "violations_ftc"),
      violations_civil: pickNum(row, "violations_civil"),
      violations_criminal: pickNum(row, "violations_criminal"),
      violations_total: pickNum(row, "violations_total"),
      closure_rate: pickNum(row, "closure_rate"),
      industry_avg_revenue: pickNum(row, "industry_avg_revenue"),
      source_ingest_method: pickStr(row, "source_ingest_method"),
      sources: Array.isArray(row.sources) ? (row.sources as string[]) : [],
    };

    const { data: ts } = await sb
      .from("frandoor_ftc_timeseries")
      .select("*")
      .eq("brand_id", brandId)
      .order("year", { ascending: false })
      .limit(5);
    const timeseries: FrandoorOfficialTimeseries[] = (ts ?? []).map((r: Row) => ({
      year: Number(r.year),
      assets: pickNum(r, "assets"),
      liabilities: pickNum(r, "liabilities"),
      equity: pickNum(r, "equity"),
      revenue: pickNum(r, "revenue"),
      operating_profit: pickNum(r, "operating_profit"),
      net_profit: pickNum(r, "net_profit"),
      executives: pickNum(r, "executives"),
      employees: pickNum(r, "employees"),
      opening_balance: pickNum(r, "opening_balance"),
      new_opens: pickNum(r, "new_opens"),
      contract_end: pickNum(r, "contract_end"),
      contract_terminate: pickNum(r, "contract_terminate"),
      name_change: pickNum(r, "name_change"),
      closing_balance: pickNum(r, "closing_balance"),
      stores_total: pickNum(r, "stores_total"),
      stores_franchise: pickNum(r, "stores_franchise"),
      stores_direct: pickNum(r, "stores_direct"),
      advertising: pickNum(r, "advertising"),
      promotion: pickNum(r, "promotion"),
      avg_annual_revenue: pickNum(r, "avg_annual_revenue"),
      avg_revenue_per_unit_area: pickNum(r, "avg_revenue_per_unit_area"),
    }));

    const { data: rg } = await sb
      .from("frandoor_ftc_regional")
      .select("*")
      .eq("brand_id", brandId)
      .order("year", { ascending: false });
    const regional: FrandoorOfficialRegional[] = (rg ?? []).map((r: Row) => ({
      year: Number(r.year),
      region: String(r.region ?? ""),
      stores_franchise: pickNum(r, "stores_franchise"),
      stores_direct: pickNum(r, "stores_direct"),
      avg_annual_revenue: pickNum(r, "avg_annual_revenue"),
    }));

    return { master, timeseries, regional };
  } catch {
    return null;
  }
}
