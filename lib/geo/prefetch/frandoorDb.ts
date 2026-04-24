import "server-only";
import { createAdminClient } from "@/utils/supabase/admin";

export type PosMonth = {
  year_month: string;
  store_count: number;
  total_sales: number;
  per_store_avg: number;
  top3_stores?: Array<{ name: string; sales: number }>;
  bottom3_stores?: Array<{ name: string; sales: number }>;
};

export type FrandoorStoreRecord = {
  display_label: string;
  revenue_tier: "A" | "B" | "C";
  region_major: string | null;
  location_type: string | null;
  area_tier: string | null;
  opened_at: string | null;
  closed_at: string | null;
  monthly_series: Array<{ year_month: string; sales: number }>;
};

export type FrandoorFact = {
  brand_id: string;
  brand_name: string;
  ftc_first_registered: string | null;
  stores_latest: number | null;
  stores_latest_as_of: string | null;
  pos_monthly: PosMonth[];
  corporation_founded_year: number | null;
  // PR033 v2 파생지표
  seasonal_peak_month: string | null;
  seasonal_trough_month: string | null;
  seasonal_ratio: number | null;
  yoy_growth: number | null;
  qoq_growth: number | null;
  survival_rate_12m: number | null;
  survival_rate_24m: number | null;
  multi_store_owner_pct: number | null;
  // PR033 v2 점포 익명 레코드
  stores: FrandoorStoreRecord[];
  raw: Record<string, unknown>;
};

function pickNum(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

export async function fetchFrandoorBrandFact(brandId: string): Promise<FrandoorFact | null> {
  if (!brandId) return null;
  try {
    const supabase = createAdminClient();
    const { data, error } = await supabase
      .from("frandoor_brand_facts")
      .select("*")
      .eq("brand_id", brandId)
      .maybeSingle();
    if (error || !data) return null;
    const row = data as Record<string, unknown>;
    const posRaw = row.pos_monthly;
    const pos: PosMonth[] = Array.isArray(posRaw) ? (posRaw as PosMonth[]) : [];

    let stores: FrandoorStoreRecord[] = [];
    try {
      const { data: sr } = await supabase
        .from("frandoor_store_records")
        .select("*")
        .eq("brand_id", brandId);
      if (Array.isArray(sr)) {
        stores = (sr as Record<string, unknown>[]).map((r) => ({
          display_label: String(r.display_label ?? ""),
          revenue_tier: (r.revenue_tier as FrandoorStoreRecord["revenue_tier"]) ?? "B",
          region_major: (r.region_major as string | null) ?? null,
          location_type: (r.location_type as string | null) ?? null,
          area_tier: (r.area_tier as string | null) ?? null,
          opened_at: (r.opened_at as string | null) ?? null,
          closed_at: (r.closed_at as string | null) ?? null,
          monthly_series: Array.isArray(r.monthly_series)
            ? (r.monthly_series as Array<{ year_month: string; sales: number }>)
            : [],
        }));
      }
    } catch { stores = []; }

    return {
      brand_id: String(row.brand_id),
      brand_name: String(row.brand_name ?? ""),
      ftc_first_registered: (row.ftc_first_registered as string | null) ?? null,
      stores_latest: pickNum(row.stores_latest),
      stores_latest_as_of: (row.stores_latest_as_of as string | null) ?? null,
      pos_monthly: pos,
      corporation_founded_year: pickNum(row.corporation_founded_year),
      seasonal_peak_month: (row.seasonal_peak_month as string | null) ?? null,
      seasonal_trough_month: (row.seasonal_trough_month as string | null) ?? null,
      seasonal_ratio: pickNum(row.seasonal_ratio),
      yoy_growth: pickNum(row.yoy_growth),
      qoq_growth: pickNum(row.qoq_growth),
      survival_rate_12m: pickNum(row.survival_rate_12m),
      survival_rate_24m: pickNum(row.survival_rate_24m),
      multi_store_owner_pct: pickNum(row.multi_store_owner_pct),
      stores,
      raw: (row.raw as Record<string, unknown>) ?? {},
    };
  } catch {
    return null;
  }
}
