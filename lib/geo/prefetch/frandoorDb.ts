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

export type FrandoorFact = {
  brand_id: string;
  brand_name: string;
  ftc_first_registered: string | null;
  stores_latest: number | null;
  stores_latest_as_of: string | null;
  pos_monthly: PosMonth[];
  corporation_founded_year: number | null;
  raw: Record<string, unknown>;
};

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
    return {
      brand_id: String(row.brand_id),
      brand_name: String(row.brand_name ?? ""),
      ftc_first_registered: (row.ftc_first_registered as string | null) ?? null,
      stores_latest: typeof row.stores_latest === "number" ? row.stores_latest : null,
      stores_latest_as_of: (row.stores_latest_as_of as string | null) ?? null,
      pos_monthly: pos,
      corporation_founded_year:
        typeof row.corporation_founded_year === "number" ? row.corporation_founded_year : null,
      raw: (row.raw as Record<string, unknown>) ?? {},
    };
  } catch {
    return null;
  }
}
