import "server-only";
import { createAdminClient } from "@/utils/supabase/admin";

/** 공정위 정보공개서 (프랜도어 업로드) A급 팩트.
 * FTC OpenAPI 와 **무관**. frandoor_ftc_facts 테이블 단일 경로.
 */
export type FrandoorOfficial = {
  brand_id: string;
  brand_name: string;
  source_year: string | null;
  source_registered_at: string | null;
  source_first_registered_at: string | null;
  stores_total: number | null;
  new_stores: number | null;
  closed_stores: number | null;
  terminated_stores: number | null;
  avg_monthly_revenue: number | null;   // 만원
  area_unit_revenue: number | null;     // 만원
  cost_total: number | null;             // 만원
  franchise_fee: number | null;          // 만원
  education_fee: number | null;          // 만원
  deposit: number | null;                // 만원
  closure_rate: number | null;           // %
  industry_avg_revenue: number | null;   // 만원
  violations_total: number | null;
  contract_years: number | null;
  corp_name: string | null;
  source_ingest_method: string | null;   // "html_parse_mvp" | "excel_batch" | "manual"
  sources: string[];
  raw: Record<string, unknown>;
};

export async function fetchFrandoorOfficial(brandId: string): Promise<FrandoorOfficial | null> {
  if (!brandId) return null;
  try {
    const sb = createAdminClient();
    const { data, error } = await sb
      .from("frandoor_ftc_facts")
      .select("*")
      .eq("brand_id", brandId)
      .maybeSingle();
    if (error || !data) return null;
    return data as FrandoorOfficial;
  } catch {
    return null;
  }
}
