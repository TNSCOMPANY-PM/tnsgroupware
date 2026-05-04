/**
 * v4-16 — A only 분석 모드 코드 결정론.
 * buildAFactsFromMetrics 재사용 + analysis_axes 보존 + timeseries (전년도 대비) 분석.
 */
import { getColumnMeta } from "../v2/ftc_column_labels";
import { buildAFactsFromMetrics } from "./build_a_facts";
import { formatToDisplay } from "../v3/plan_format";
import type { AFactsResult } from "./types";

export type TimeseriesEntry = {
  label: string;
  unit: string;
  current: number | null;
  prev: number | null;
  current_display: string;
  prev_display: string;
  delta: number | null;
  delta_display: string | null;
  pct: number | null;
  direction: "up" | "down" | "flat" | "n/a";
};

export type AOnlyFactsResult = AFactsResult & {
  analysis_axes: string[];
  timeseries: Record<string, TimeseriesEntry>;
};

/**
 * ftc_brands_2024 의 (current, prev) 쌍 — 전년 대비 변화 계산용.
 * KW transform 은 buildAFactsFromMetrics 와 동일 룰 (FTC_COLUMN_META.transform) 적용.
 */
const TIMESERIES_PAIRS: Array<[current: string, prev: string]> = [
  ["frcs_cnt_2024_total", "frcs_cnt_2023_total"],
  ["chg_2024_new_open", "chg_2023_new_open"],
  ["chg_2024_contract_end", "chg_2023_contract_end"],
  ["chg_2024_contract_cancel", "chg_2023_contract_cancel"],
  ["chg_2024_name_change", "chg_2023_name_change"],
  ["fin_2024_revenue", "fin_2023_revenue"],
  ["fin_2024_op_profit", "fin_2023_op_profit"],
  ["fin_2024_net_income", "fin_2023_net_income"],
  ["fin_2024_total_asset", "fin_2023_total_asset"],
  ["fin_2024_total_equity", "fin_2023_total_equity"],
  ["fin_2024_total_debt", "fin_2023_total_debt"],
];

export function buildAOnlyFacts(input: {
  brand_label: string;
  industry: string;
  industry_sub: string | null;
  topic: string;
  ftc_brand_id: string;
  selected_metrics: string[];
  key_angle: string;
  analysis_axes: string[];
  ftc_row: Record<string, unknown>;
  industry_facts: Array<Record<string, unknown>>;
}): AOnlyFactsResult {
  const baseAFacts = buildAFactsFromMetrics({
    brand_label: input.brand_label,
    industry: input.industry,
    industry_sub: input.industry_sub,
    topic: input.topic,
    ftc_brand_id: input.ftc_brand_id,
    selected_metrics: input.selected_metrics,
    key_angle: input.key_angle,
    ftc_row: input.ftc_row,
    industry_facts: input.industry_facts,
  });

  const timeseries: AOnlyFactsResult["timeseries"] = {};
  for (const [currentId, prevId] of TIMESERIES_PAIRS) {
    if (!input.selected_metrics.includes(currentId)) continue;
    const meta = getColumnMeta(currentId);
    if (meta.skip) continue;

    const currentRaw = toFiniteNumber(input.ftc_row[currentId]);
    const prevRaw = toFiniteNumber(input.ftc_row[prevId]);
    if (currentRaw == null && prevRaw == null) continue;

    const current = currentRaw != null && meta.transform ? meta.transform(currentRaw) : currentRaw;
    const prev = prevRaw != null && meta.transform ? meta.transform(prevRaw) : prevRaw;

    const delta = current != null && prev != null ? current - prev : null;
    const pct =
      delta != null && prev != null && prev !== 0 ? (delta / Math.abs(prev)) * 100 : null;
    const direction: TimeseriesEntry["direction"] =
      delta == null ? "n/a" : delta > 0 ? "up" : delta < 0 ? "down" : "flat";

    timeseries[currentId] = {
      label: meta.label,
      unit: meta.unit,
      current,
      prev,
      current_display: current != null ? formatToDisplay(current, meta.unit) : "데이터 없음",
      prev_display: prev != null ? formatToDisplay(prev, meta.unit) : "데이터 없음",
      delta,
      delta_display: delta != null ? formatToDisplay(Math.abs(delta), meta.unit) : null,
      pct,
      direction,
    };
  }

  return {
    ...baseAFacts,
    analysis_axes: input.analysis_axes,
    timeseries,
  };
}

function toFiniteNumber(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim() !== "") {
    const n = Number(v.replace(/,/g, ""));
    return Number.isFinite(n) ? n : null;
  }
  return null;
}
