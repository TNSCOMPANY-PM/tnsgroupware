import "server-only";

export type FrandoorFact = {
  brand_id: string;
  brand_name: string;
  year: string;
  raw: Record<string, unknown>;
};

export async function fetchFrandoorBrandFact(_brandId: string): Promise<FrandoorFact | null> {
  // TODO(T-later): 공정위 엑셀 수령 후 Supabase frandoor_brand_facts 테이블 연결
  return null;
}
