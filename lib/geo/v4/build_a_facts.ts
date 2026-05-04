/**
 * v4-10 — selected_metrics + key_angle (LLM1) → a_facts (코드 후처리).
 *
 * LLM1 output 단순화 (Sonnet, ~500 token) 와 짝.
 *  · ftc_row[metric_id] → raw_value (FTC_COLUMN_META.transform 적용)
 *  · industry_facts row (metric_id × agg_method) → distribution.p25/p50/p75/p90/p95
 *  · formatToDisplay → A.display + distribution.{p}.display
 *  · computeBrandPosition → distribution.brand_position
 *
 * LLM 자연어 판단 (selected_metrics 선별 + key_angle) 만 받고, 데이터 처리는 100% 코드.
 */
import { getColumnMeta } from "../v2/ftc_column_labels";
import { formatToDisplay, computeBrandPosition } from "../v3/plan_format";
import type { AFactsResult } from "./types";

type IndustryFactRow = Record<string, unknown>;

type FactGroup = AFactsResult["fact_groups"][string];
type DistributionT = NonNullable<FactGroup["distribution"]>;

const PERCENTILE_KEYS = ["p25", "p50", "p75", "p90", "p95"] as const;

export function buildAFactsFromMetrics(input: {
  brand_label: string;
  industry: string;
  industry_sub: string | null;
  topic: string;
  ftc_brand_id: string;
  selected_metrics: string[];
  key_angle: string;
  ftc_row: Record<string, unknown>;
  industry_facts: IndustryFactRow[];
}): AFactsResult {
  const fact_groups: AFactsResult["fact_groups"] = {};
  const period = (input.ftc_row.period as string | null) ?? "2024-12";
  const sourceLabel = `공정위 정보공개서(${period})`;

  // industry_facts 를 metric_id 단위로 그룹화 (agg_method × value_num).
  const industryByMetric = groupIndustryByMetric(input.industry_facts);

  for (const metric_id of input.selected_metrics) {
    if (!metric_id || typeof metric_id !== "string") continue;

    const meta = getColumnMeta(metric_id);
    if (meta.skip) continue;

    const rawCell = input.ftc_row[metric_id];
    const rawNum = toFiniteNumber(rawCell);
    if (rawNum == null) continue;

    const transformed = meta.transform ? meta.transform(rawNum) : rawNum;

    const A: NonNullable<FactGroup["A"]> = {
      display: formatToDisplay(transformed, meta.unit),
      raw_value: transformed,
      unit: meta.unit,
      period,
      source: sourceLabel,
    };

    const distribution = buildDistribution({
      bucket: industryByMetric.get(metric_id),
      brandRaw: transformed,
      refUnit: meta.unit,
    });

    const group: FactGroup = {
      label: meta.label,
      A,
    };
    if (distribution) group.distribution = distribution;

    fact_groups[metric_id] = group;
  }

  const population_info = derivePopulationInfo(industryByMetric);

  return {
    brand_label: input.brand_label,
    industry: input.industry,
    industry_sub: input.industry_sub,
    topic: input.topic,
    ftc_brand_id: input.ftc_brand_id,
    selected_metrics: input.selected_metrics,
    key_angle: input.key_angle,
    fact_groups,
    population_info,
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

function groupIndustryByMetric(rows: IndustryFactRow[]): Map<string, IndustryFactRow[]> {
  const m = new Map<string, IndustryFactRow[]>();
  for (const r of rows ?? []) {
    const id = r.metric_id;
    if (typeof id !== "string" || id.length === 0) continue;
    const arr = m.get(id) ?? [];
    arr.push(r);
    m.set(id, arr);
  }
  return m;
}

function buildDistribution(args: {
  bucket: IndustryFactRow[] | undefined;
  brandRaw: number;
  refUnit: string;
}): DistributionT | null {
  const bucket = args.bucket;
  if (!bucket || bucket.length === 0) return null;

  const dist: Partial<DistributionT> = {};
  let nPop = 0;

  for (const row of bucket) {
    const agg = (row.agg_method as string | null) ?? null;
    const value = toFiniteNumber(row.value_num);
    const n = toFiniteNumber(row.n);
    if (n != null && n > nPop) nPop = n;
    if (!agg || value == null) continue;
    const key = agg.toLowerCase();
    if ((PERCENTILE_KEYS as readonly string[]).includes(key)) {
      dist[key as (typeof PERCENTILE_KEYS)[number]] = {
        display: formatToDisplay(value, args.refUnit),
        raw: value,
      };
    }
  }

  // percentile 한 개도 없으면 분포 비교 의미 없음
  const hasAny = PERCENTILE_KEYS.some((k) => dist[k]);
  if (!hasAny) return null;

  const out: DistributionT = {
    ...dist,
    n_population: nPop,
  };
  out.brand_position = computeBrandPosition(args.brandRaw, {
    ...dist,
    n_population: nPop,
    brand_position: "",
  });
  return out;
}

function derivePopulationInfo(byMetric: Map<string, IndustryFactRow[]>): Record<string, number> {
  const info: Record<string, number> = {};
  for (const [metricId, rows] of byMetric.entries()) {
    let maxN = 0;
    for (const r of rows) {
      const n = toFiniteNumber(r.n);
      if (n != null && n > maxN) maxN = n;
    }
    if (maxN > 0) info[metricId] = maxN;
  }
  return info;
}
