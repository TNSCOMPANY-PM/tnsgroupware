/**
 * v2-03: docx FactLabel → v2 metric_id 매핑.
 * 존재하지 않는 매핑은 null — brand_facts 적재 시 skip.
 */

import type { MetricId } from "./metric_ids";
import type { FactLabel, FactSourceType } from "@/types/factSchema";

/**
 * label → metric_id. source_type 에 따라 다르게 매핑하는 경우 (가맹점수_전체) 도 처리.
 * 매핑 없으면 null (해당 fact 는 brand_fact_data 에만 남고 brand_facts 적재 안 함).
 */
export function mapFactLabelToMetricId(
  label: FactLabel,
  source_type: FactSourceType,
): MetricId | null {
  switch (label) {
    case "연평균매출":
      return "annual_revenue";
    case "월평균매출":
      return "monthly_avg_revenue";
    case "영업이익률":
      // 공정위/정부 통계 출처면 본사 영업이익률, 본사 출처면 본사 발표 마진율
      return source_type === "공정위" || source_type === "정부_통계"
        ? "hq_op_margin_pct"
        : "hq_announced_net_margin_pct";
    case "순마진율":
      return "hq_announced_net_margin_pct";
    case "당기순이익":
      return "hq_net_profit";
    case "창업비용총액":
      return "cost_total";
    case "가맹비":
      return "cost_franchise_fee";
    case "교육비":
      return "cost_education_fee";
    case "보증금":
      return "cost_deposit";
    case "인테리어비":
      return "cost_interior";
    case "기타창업비용":
      return "cost_other";
    case "가맹점수_전체":
      // 공정위 출처 → A급 stores_total, 본사 출처 → C급 stores_total_hq_announced
      return source_type === "공정위" ? "stores_total" : "stores_total_hq_announced";
    case "신규개점수":
      return "stores_new_open";
    case "계약해지수":
      return "stores_close_cancel";
    case "자산":
      return "hq_total_asset";
    case "부채":
      return "hq_total_debt";
    case "자본":
      return "hq_total_equity";
    case "매출액_본사":
      return "hq_revenue";
    case "투자회수기간":
      return "hq_announced_payback_months";
    default:
      return null;
  }
}

/**
 * provenance + source_tier 결정.
 * docx 출처면 항상 C급. public_fetch (공정위/정부_통계) 면 A or B.
 */
export function decideProvenance(
  provenance: "docx" | "public_fetch",
  source_type: FactSourceType,
): { provenance: "ftc" | "docx" | "kosis"; source_tier: "A" | "B" | "C" } {
  if (provenance === "docx") {
    // docx 안 데이터는 본사 자체 또는 인용. 모두 C급.
    return { provenance: "docx", source_tier: "C" };
  }
  // public_fetch
  if (source_type === "공정위") return { provenance: "ftc", source_tier: "A" };
  if (source_type === "정부_통계") return { provenance: "kosis", source_tier: "B" };
  return { provenance: "docx", source_tier: "C" };
}
