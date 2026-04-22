import "server-only";
import {
  getMatrixRule,
  getAllowedBrands as queryAllowedBrands,
  getExcludeReason as queryExcludeReason,
  type BrandLite,
} from "@/lib/supabase/geo-queries";
import type { MatrixRule } from "@/types/geo";

export async function isAllowed(brand: string, contentType: string): Promise<boolean> {
  const rule = await getMatrixRule(brand, contentType);
  return rule === "INCLUDE" || rule === "CONDITIONAL";
}

export async function getRule(brand: string, contentType: string): Promise<MatrixRule | null> {
  return getMatrixRule(brand, contentType);
}

export async function getAllowedBrands(contentType: string): Promise<BrandLite[]> {
  return queryAllowedBrands(contentType);
}

export async function getExcludeReason(brand: string, contentType: string): Promise<string | null> {
  return queryExcludeReason(brand, contentType);
}
