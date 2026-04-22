import "server-only";
import { createAdminClient } from "@/utils/supabase/admin";
import type {
  GeoBrandAlias,
  GeoBrandContentMatrix,
  MatrixRule,
} from "@/types/geo";

export type BrandLite = { id: string; name: string; category: string | null };

async function resolveBrandId(brandKey: string): Promise<string | null> {
  const supa = createAdminClient();
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(brandKey)) {
    return brandKey;
  }
  const { data } = await supa
    .from("geo_brands")
    .select("id,name")
    .eq("name", brandKey)
    .maybeSingle();
  return (data as { id?: string } | null)?.id ?? null;
}

export async function getMatrixRule(
  brand: string,
  contentType: string,
): Promise<MatrixRule | null> {
  const brandId = await resolveBrandId(brand);
  if (!brandId) return null;
  const supa = createAdminClient();
  const { data } = await supa
    .from("geo_brand_content_matrix")
    .select("rule")
    .eq("brand_id", brandId)
    .eq("content_type", contentType)
    .maybeSingle();
  return ((data as { rule?: MatrixRule } | null)?.rule) ?? null;
}

export async function getAllowedBrands(contentType: string): Promise<BrandLite[]> {
  const supa = createAdminClient();
  const { data } = await supa
    .from("geo_brand_content_matrix")
    .select("brand_id, rule, geo_brands(id,name,category)")
    .eq("content_type", contentType)
    .in("rule", ["INCLUDE", "CONDITIONAL"]);
  const rows = (data as Array<{ geo_brands: BrandLite | BrandLite[] | null }> | null) ?? [];
  const out: BrandLite[] = [];
  for (const r of rows) {
    const b = Array.isArray(r.geo_brands) ? r.geo_brands[0] : r.geo_brands;
    if (b?.id && b?.name) out.push({ id: b.id, name: b.name, category: b.category ?? null });
  }
  return out;
}

export async function getBrandAliases(brand: string): Promise<GeoBrandAlias[]> {
  const brandId = await resolveBrandId(brand);
  if (!brandId) return [];
  const supa = createAdminClient();
  const { data } = await supa
    .from("geo_brand_alias")
    .select("*")
    .eq("brand_id", brandId)
    .order("is_canonical", { ascending: false });
  return (data as GeoBrandAlias[] | null) ?? [];
}

export async function getExcludeReason(
  brand: string,
  contentType: string,
): Promise<string | null> {
  const brandId = await resolveBrandId(brand);
  if (!brandId) return null;
  const supa = createAdminClient();
  const { data } = await supa
    .from("geo_brand_content_matrix")
    .select("rule, reason")
    .eq("brand_id", brandId)
    .eq("content_type", contentType)
    .maybeSingle();
  const row = data as { rule?: MatrixRule; reason?: string | null } | null;
  if (!row || row.rule === "INCLUDE") return null;
  return row.reason ?? null;
}

export async function getMatrixRowsByType(
  contentType: string,
): Promise<GeoBrandContentMatrix[]> {
  const supa = createAdminClient();
  const { data } = await supa
    .from("geo_brand_content_matrix")
    .select("*")
    .eq("content_type", contentType);
  return (data as GeoBrandContentMatrix[] | null) ?? [];
}
