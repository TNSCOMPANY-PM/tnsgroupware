/**
 * v4-09 — LLM2 (haiku c_facts 정제) 폐기 → 코드 매칭으로 대체.
 *
 * docx_facts_raw (brand_fact_data) → a_facts.fact_groups 와 매칭:
 *   1. mapFactLabelToMetricId 으로 docx_fact.label → metric_id 변환
 *   2. metric_id 가 a_facts 에 있으면 fact_groups[metric_id] = { C, ac_diff_analysis }
 *   3. 없으면 c_only_facts 에 추가 (free-form narrative)
 *
 * 응답 ~5s (LLM 호출 없음). JSON parse 실패 0건. 비용 0.
 */

import { mapFactLabelToMetricId } from "../v2/factLabelMap";
import { formatToDisplay, computeAcDiff } from "../v3/plan_format";
import type { FactLabel, FactSourceType } from "@/types/factSchema";
import type { AFactsResult, CFactsResult } from "./types";

/**
 * docx_facts_raw 한 row 의 shape — Step 2 가 brand_fact_data 에서 SELECT 한 그대로.
 */
type DocxFactRaw = {
  label?: string | null;
  value?: string | null;
  value_normalized?: number | null;
  unit?: string | null;
  source_note?: string | null;
  source_type?: string | null;
};

export type MatchAndDiffResult = CFactsResult;

/**
 * 결정론 매칭 — A vs C 묶음 + ac_diff_analysis 한 줄.
 * a_facts.fact_groups[metric_id].A 가 있으면 차이 분석. 없으면 c_only_facts.
 */
export function matchAndDiff(args: {
  a_facts: AFactsResult;
  docx_facts_raw: DocxFactRaw[];
}): MatchAndDiffResult {
  const { a_facts, docx_facts_raw } = args;
  const fact_groups: MatchAndDiffResult["fact_groups"] = {};
  const c_only_facts: MatchAndDiffResult["c_only_facts"] = [];

  for (const docxFact of docx_facts_raw) {
    const label = (docxFact.label ?? "").trim();
    if (!label) continue;

    // mapFactLabelToMetricId 재사용 (v2 의 docx_label → v2 metric_id 매핑).
    // v4 의 a_facts metric_id 는 ftc_brands_2024 컬럼명이라 매핑 키가 다를 수 있음 →
    // a_facts.fact_groups 의 key 와 v2 metric_id 모두 후보로 매칭.
    const v2MetricId = mapFactLabelToMetricId(label as FactLabel, docxFact.source_type as FactSourceType);

    // 매칭 후보 — v2 metric_id + label 정규화 양쪽 시도
    const candidates = [v2MetricId, normalizeLabelForMatch(label)].filter(
      (x): x is string => !!x,
    );

    let matchedAGroup: AFactsResult["fact_groups"][string] | null = null;
    let matchedKey: string | null = null;

    for (const cand of candidates) {
      // 1. 정확 매칭
      if (a_facts.fact_groups[cand]) {
        matchedAGroup = a_facts.fact_groups[cand];
        matchedKey = cand;
        break;
      }
      // 2. fuzzy — a_facts 의 fact_groups key 가 cand 를 포함하거나 그 반대
      const fuzzy = Object.entries(a_facts.fact_groups).find(([k, g]) => {
        const gLabel = g.label ?? "";
        return (
          k.includes(cand) ||
          cand.includes(k) ||
          gLabel.includes(label) ||
          label.includes(gLabel)
        );
      });
      if (fuzzy) {
        matchedAGroup = fuzzy[1];
        matchedKey = fuzzy[0];
        break;
      }
    }

    const valueNum =
      typeof docxFact.value_normalized === "number" && Number.isFinite(docxFact.value_normalized)
        ? docxFact.value_normalized
        : null;
    const valueText = (docxFact.value ?? null) as string | null;
    const unit = (docxFact.unit ?? null) as string | null;
    const sourceLabel = docxFact.source_note ?? "본사 발표 자료";

    if (matchedAGroup && matchedKey && matchedAGroup.A && valueNum != null && unit) {
      // A + C 묶음 + 차이 분석
      const cDisplay = formatToDisplay(valueNum, unit);
      const aData = matchedAGroup.A;
      const acDiff = computeAcDiff(
        { raw_value: aData.raw_value, unit: aData.unit },
        { raw_value: valueNum, unit },
      );
      fact_groups[matchedKey] = {
        label: matchedAGroup.label,
        C: {
          display: cDisplay,
          raw_value: valueNum,
          value_text: valueText,
          unit,
          source: sourceLabel,
        },
        ac_diff_analysis: acDiff,
      };
    } else {
      // A 매칭 안 됨 또는 numeric 없음 → c_only_facts
      c_only_facts.push({
        label,
        value_num: valueNum,
        value_text: valueText,
        unit,
        source: sourceLabel,
      });
    }
  }

  // ac_diff_summary — 매칭된 fact_groups 갯수 + c_only 갯수 요약
  const acDiffCount = Object.keys(fact_groups).length;
  const cOnlyCount = c_only_facts.length;
  const ac_diff_summary =
    acDiffCount > 0
      ? `A 와 매칭된 본사 metric ${acDiffCount}건 (각 ac_diff_analysis 포함). C 단독 narrative ${cOnlyCount}건.`
      : `A 와 매칭된 본사 metric 0건. C 단독 narrative ${cOnlyCount}건 (수상/대출지원/차별점 등).`;

  return {
    fact_groups,
    c_only_facts,
    ac_diff_summary,
  };
}

/**
 * docx label 정규화 (휴리스틱 — fuzzy 매칭 보조).
 *  · 공백/괄호/숫자 제거
 *  · 흔한 매핑 (월평균매출 → monthly_avg_revenue 같은 경우는 mapFactLabelToMetricId 가 처리)
 */
function normalizeLabelForMatch(label: string): string {
  return label
    .replace(/\s+/g, "")
    .replace(/[()0-9]/g, "")
    .toLowerCase();
}
