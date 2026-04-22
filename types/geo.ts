export type MatrixRule = "INCLUDE" | "CONDITIONAL" | "EXCLUDE";

export interface GeoBrandAlias {
  id: string;
  brand_id: string;
  alias: string;
  is_canonical: boolean;
  created_at: string;
}

export interface GeoSearchVolumeMonthly {
  id: string;
  brand_id: string;
  alias_used: string;
  year_month: string;
  pc_volume: number;
  mobile_volume: number;
  total_volume: number;
  comp_index: string | null;
  measurement_floor: boolean;
  source: string;
  created_at: string;
}

export interface GeoBrandContentMatrix {
  id: string;
  brand_id: string;
  content_type: string;
  rule: MatrixRule;
  reason: string | null;
  updated_by: string | null;
  updated_at: string;
}

export interface GeoInterestRankingCacheItem {
  rank: number;
  brand: string;
  category: string;
  total_volume: number;
  pc_volume: number;
  mobile_volume: number;
  comp_index: string | null;
  used_alias: string;
  measurement_floor: boolean;
  matrix_rule?: MatrixRule;
  matrix_reason?: string | null;
}

export interface GeoInterestRankingCachePayload {
  year_month: string;
  generated_at: string;
  source: string;
  method: string;
  items: GeoInterestRankingCacheItem[];
  meta: {
    total_brands: number;
    include_count: number;
    conditional_count: number;
    exclude_count: number;
  };
}

export interface GeoInterestRankingCache {
  id: string;
  year_month: string;
  category: string | null;
  payload: GeoInterestRankingCachePayload;
  generated_at: string;
}
