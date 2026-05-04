/**
 * v4-17 — A only 모드 업종 단위 분석 facts 코드 결정론.
 * 단일 brand 비교 X. 업종 N개 brand 의 분포 / ranking / outlier.
 *
 * input:
 *  - industry, selected_metrics, key_angle, analysis_axes, ranking_metric
 *  - brands: 해당 industry 의 ftc_brands_2024 row 모두
 *  - industry_facts: industry_facts 테이블 row (metric_id × agg_method)
 *
 * output: IndustryAnalysisFacts
 */
import { getColumnMeta } from "../v2/ftc_column_labels";
import { formatToDisplay } from "../v3/plan_format";
import type { IndustryAnalysisFacts, IndustryDistribution } from "./types";

type Row = Record<string, unknown>;

const PERCENTILE_KEYS = ["p25", "p50", "p75", "p90", "p95", "mean"] as const;

export const DEFAULT_RANKING_METRIC = "avg_sales_2024_total";

export function buildIndustryAnalysisFacts(input: {
  industry: string;
  topic: string;
  selected_metrics: string[];
  key_angle: string;
  analysis_axes: string[];
  ranking_metric: string;
  brands: Row[];
  industry_facts: Row[];
}): IndustryAnalysisFacts {
  const distributions = buildDistributions(input.selected_metrics, input.industry_facts);
  const ranking = buildRanking(input.ranking_metric, input.brands);
  const outliers = buildOutliers(input.ranking_metric, input.brands);

  return {
    industry: input.industry,
    n_brands: input.brands.length,
    topic: input.topic,
    key_angle: input.key_angle,
    analysis_axes: input.analysis_axes,
    selected_metrics: input.selected_metrics,
    ranking_metric: input.ranking_metric,
    distributions,
    ranking,
    outliers,
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

/**
 * industry_facts 를 metric_id 단위로 그룹화 (agg_method × value_num).
 * percentile 별 display 작성.
 */
function buildDistributions(
  selected_metrics: string[],
  industry_facts: Row[],
): Record<string, IndustryDistribution> {
  const byMetric = new Map<string, Row[]>();
  for (const r of industry_facts) {
    const id = r.metric_id;
    if (typeof id !== "string" || id.length === 0) continue;
    const arr = byMetric.get(id) ?? [];
    arr.push(r);
    byMetric.set(id, arr);
  }

  const result: Record<string, IndustryDistribution> = {};
  for (const metric_id of selected_metrics) {
    if (typeof metric_id !== "string" || !metric_id) continue;
    const meta = getColumnMeta(metric_id);
    if (meta.skip) continue;

    const bucket = byMetric.get(metric_id);
    if (!bucket || bucket.length === 0) continue;

    const stats: Partial<Record<(typeof PERCENTILE_KEYS)[number], number>> = {};
    let nPop = 0;
    for (const row of bucket) {
      const agg = ((row.agg_method as string | null) ?? "").toLowerCase();
      const value = toFiniteNumber(row.value_num);
      const n = toFiniteNumber(row.n);
      if (n != null && n > nPop) nPop = n;
      if (!agg || value == null) continue;
      if ((PERCENTILE_KEYS as readonly string[]).includes(agg)) {
        stats[agg as (typeof PERCENTILE_KEYS)[number]] = value;
      }
    }

    // 한 개도 없으면 분포 의미 없음
    const hasAny = PERCENTILE_KEYS.some((k) => stats[k] != null);
    if (!hasAny) continue;

    const fmt = (k: (typeof PERCENTILE_KEYS)[number]) => {
      const v = stats[k];
      return v != null
        ? { display: formatToDisplay(v, meta.unit), raw: v }
        : { display: "데이터 없음", raw: null };
    };

    result[metric_id] = {
      label: meta.label,
      unit: meta.unit,
      n_population: nPop > 0 ? nPop : null,
      p25: fmt("p25"),
      p50: fmt("p50"),
      p75: fmt("p75"),
      p90: fmt("p90"),
      p95: fmt("p95"),
      mean: fmt("mean"),
    };
  }
  return result;
}

/** ranking_metric 기준 top 10 / bottom 10 정렬. */
function buildRanking(
  ranking_metric: string,
  brands: Row[],
): IndustryAnalysisFacts["ranking"] {
  const meta = getColumnMeta(ranking_metric);
  const transform = meta.transform;

  const candidates = brands
    .map((b) => {
      const raw = toFiniteNumber(b[ranking_metric]);
      if (raw == null || raw === 0) return null;
      const transformed = transform ? transform(raw) : raw;
      const brand_label =
        (typeof b.brand_nm === "string" && b.brand_nm.trim()) ||
        (typeof b.corp_nm === "string" && b.corp_nm.trim()) ||
        "?";
      return { brand_label, raw: transformed };
    })
    .filter((x): x is { brand_label: string; raw: number } => x != null)
    .sort((a, b) => b.raw - a.raw);

  const top10 = candidates.slice(0, 10).map((b) => ({
    brand_label: b.brand_label,
    value: { display: formatToDisplay(b.raw, meta.unit), raw: b.raw },
  }));
  // bottom 10 — 가장 작은 값 10개를 작은 → 큰 순으로
  const bottom10 = candidates
    .slice(Math.max(0, candidates.length - 10))
    .reverse()
    .map((b) => ({
      brand_label: b.brand_label,
      value: { display: formatToDisplay(b.raw, meta.unit), raw: b.raw },
    }));

  return {
    metric_id: ranking_metric,
    label: meta.label,
    unit: meta.unit,
    top10,
    bottom10,
  };
}

/** ranking_metric 기준 ±2σ 벗어난 brand 추출. */
function buildOutliers(
  ranking_metric: string,
  brands: Row[],
): IndustryAnalysisFacts["outliers"] {
  const meta = getColumnMeta(ranking_metric);
  const transform = meta.transform;

  const values: Array<{ brand_label: string; raw: number }> = [];
  for (const b of brands) {
    const raw = toFiniteNumber(b[ranking_metric]);
    if (raw == null || raw === 0) continue;
    const transformed = transform ? transform(raw) : raw;
    const brand_label =
      (typeof b.brand_nm === "string" && b.brand_nm.trim()) ||
      (typeof b.corp_nm === "string" && b.corp_nm.trim()) ||
      "?";
    values.push({ brand_label, raw: transformed });
  }

  if (values.length < 6) return [];

  const mean = values.reduce((s, v) => s + v.raw, 0) / values.length;
  const variance = values.reduce((s, v) => s + (v.raw - mean) ** 2, 0) / values.length;
  const stdev = Math.sqrt(variance);
  if (!Number.isFinite(stdev) || stdev <= 0) return [];

  const outliers: IndustryAnalysisFacts["outliers"] = [];
  for (const v of values) {
    const sigma = (v.raw - mean) / stdev;
    if (Math.abs(sigma) < 2) continue;
    outliers.push({
      brand_label: v.brand_label,
      metric_id: ranking_metric,
      value: { display: formatToDisplay(v.raw, meta.unit), raw: v.raw },
      deviation: sigma > 0 ? "상단" : "하단",
      sigma: Math.round(sigma * 10) / 10,
    });
  }
  // 더 큰 |sigma| 부터 정렬
  outliers.sort((a, b) => Math.abs(b.sigma) - Math.abs(a.sigma));
  return outliers.slice(0, 10);
}
