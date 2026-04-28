/**
 * PR058 — docx 비교표 + ftc 정규화 데이터를 표준 metric ID 로 통합.
 *
 * docx 양식 차이에 robust 한 cross-check + 본문 빌더용 단일 진실.
 * (현재 PR 에서는 cross-check 강화 + 진단용. 본문 빌더 전면 교체는 후속 PR.)
 */

import type { ComparisonRow, FrandoorDocx } from "@/lib/geo/prefetch/frandoorDocx";
import type { StandardFtcBrand } from "@/lib/geo/prefetch/ftc2024";
import {
  STANDARD_METRICS,
  metricLabel,
  type StandardMetricId,
} from "@/lib/geo/standardSchema";

export type UnifiedSource = {
  value: number | string | null;
  source: string;
  year_or_period?: string | null;
};

export type UnifiedFact = {
  metric_id: StandardMetricId;
  metric_label: string;
  /** 공정위 정보공개서 (docx 비교표 official_value 또는 ftc raw). */
  source_a: UnifiedSource | null;
  /** 본사 브로셔/홈페이지 (docx 비교표 brochure_value). */
  source_c: UnifiedSource | null;
  /** ftc 업종 평균 (별도 호출, 본 함수 입력 외). */
  source_b_industry_avg: number | null;
};

/** "5,210만원" / "21개" / "12.3%" → 숫자. 실패 시 null. */
export function parseNumeric(v: unknown): number | null {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v !== "string") return null;
  const cleaned = v.replace(/[,\s만원천원원호점개건배년개월㎡%]/g, "");
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

/**
 * docx 비교표 + ftc 정규화 데이터 → metric_id 별 UnifiedFact 배열.
 * 같은 metric_id 가 여러 비교표에 등장할 경우 confidence 우선 (high > medium > low).
 */
export function buildUnifiedFacts(input: {
  docx: FrandoorDocx | null;
  ftc: StandardFtcBrand | null;
  sourceYear?: string;
}): UnifiedFact[] {
  const { docx, ftc } = input;
  const sourceYear = input.sourceYear ?? "2024";
  const byMetric = new Map<
    StandardMetricId,
    { row: ComparisonRow; sectionKey: string }
  >();

  const confidenceRank: Record<string, number> = { high: 3, medium: 2, low: 1, unmapped: 0 };

  if (docx) {
    for (const tbl of docx.comparison_tables) {
      for (const row of tbl.rows) {
        const id = row.metric_id;
        if (!id) continue;
        const prev = byMetric.get(id);
        const prevConf = prev?.row.confidence ?? "unmapped";
        const curConf = row.confidence ?? "unmapped";
        if (!prev || (confidenceRank[curConf] ?? 0) > (confidenceRank[prevConf] ?? 0)) {
          byMetric.set(id, { row, sectionKey: tbl.section });
        }
      }
    }
  }

  const result: UnifiedFact[] = [];
  const seen = new Set<StandardMetricId>();

  for (const [id, { row }] of byMetric.entries()) {
    seen.add(id);
    const source_a: UnifiedSource | null = row.official_value
      ? {
          value: row.official_value,
          source: `공정위 정보공개서 ${sourceYear} (docx)`,
          year_or_period: `${sourceYear}-12`,
        }
      : null;
    const source_c: UnifiedSource | null = row.brochure_value
      ? {
          value: row.brochure_value,
          source: "본사 공개 자료",
          year_or_period: null,
        }
      : null;
    result.push({
      metric_id: id,
      metric_label: metricLabel(id),
      source_a,
      source_c,
      source_b_industry_avg: null,
    });
  }

  // ftc 에만 있고 docx 에 없는 metric 도 별도 등록 (source_a fallback).
  if (ftc) {
    for (const [id, val] of Object.entries(ftc.metrics) as [StandardMetricId, unknown][]) {
      if (seen.has(id)) {
        // 이미 docx 기반 행 있음 → 보강하지 않음 (cross-check 는 별도 함수에서).
        continue;
      }
      if (val == null) continue;
      const meta = STANDARD_METRICS[id];
      if (!meta) continue;
      result.push({
        metric_id: id,
        metric_label: meta.ko,
        source_a: {
          value: val as number | string,
          source: `공정위 정보공개서 ${sourceYear} (ftc 적재)`,
          year_or_period: `${sourceYear}-12`,
        },
        source_c: null,
        source_b_industry_avg: null,
      });
    }
  }

  return result;
}

export type CrossCheckConflict = {
  metric_id: StandardMetricId;
  metric_label: string;
  docx_value: number;
  ftc_value: number;
  diff_pct: number;
};

/**
 * 같은 metric_id 의 docx 값 vs ftc 정규화 값 cross-check.
 * 30% 이상 차이 시 conflict 반환. L72 lint 입력으로 사용.
 */
export function crossCheckDocxVsFtc(input: {
  docx: FrandoorDocx | null;
  ftc: StandardFtcBrand | null;
  thresholdPct?: number;
}): CrossCheckConflict[] {
  const { docx, ftc } = input;
  const threshold = input.thresholdPct ?? 30;
  if (!docx || !ftc) return [];

  const conflicts: CrossCheckConflict[] = [];
  const docxByMetric = new Map<StandardMetricId, ComparisonRow>();
  for (const tbl of docx.comparison_tables) {
    for (const row of tbl.rows) {
      const id = row.metric_id;
      if (!id) continue;
      if (!docxByMetric.has(id)) docxByMetric.set(id, row);
    }
  }

  for (const [id, row] of docxByMetric.entries()) {
    const docxNum = parseNumeric(row.official_value);
    const ftcNum = parseNumeric(ftc.metrics[id]);
    if (docxNum == null || ftcNum == null || docxNum === 0) continue;
    const diffPct = Math.abs(((docxNum - ftcNum) / docxNum) * 100);
    if (diffPct >= threshold) {
      conflicts.push({
        metric_id: id,
        metric_label: metricLabel(id),
        docx_value: docxNum,
        ftc_value: ftcNum,
        diff_pct: Math.round(diffPct * 10) / 10,
      });
    }
  }
  return conflicts;
}

/**
 * docx 비교표 metric_id 매핑률 통계. L75 lint 입력.
 */
export function mappingStats(docx: FrandoorDocx | null): {
  total: number;
  high: number;
  medium: number;
  low: number;
  unmapped: number;
  high_pct: number;
  unmapped_pct: number;
} {
  const stats = { total: 0, high: 0, medium: 0, low: 0, unmapped: 0, high_pct: 0, unmapped_pct: 0 };
  if (!docx) return stats;
  for (const tbl of docx.comparison_tables) {
    for (const row of tbl.rows) {
      stats.total++;
      const c = row.confidence ?? "unmapped";
      if (c === "high") stats.high++;
      else if (c === "medium") stats.medium++;
      else if (c === "low") stats.low++;
      else stats.unmapped++;
    }
  }
  if (stats.total > 0) {
    stats.high_pct = Math.round((stats.high / stats.total) * 1000) / 10;
    stats.unmapped_pct = Math.round((stats.unmapped / stats.total) * 1000) / 10;
  }
  return stats;
}
