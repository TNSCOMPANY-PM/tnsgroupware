/**
 * v4-01 Step 0 — Column Selector (haiku).
 * 토픽 + brand + industry → ftc_brands_2024 의 152 컬럼 중 ~15~30개 동적 선별.
 * 응답 ~3s. sonnet input 폭발 방지.
 */

import "server-only";
import { callHaiku, extractJson } from "../claude";
import {
  ALWAYS_INCLUDE_COLUMNS,
  buildFtcColumnCatalog,
  getKnownColumns,
} from "../ftc_column_catalog";

export type SelectColumnsResult = {
  columns: string[];
  rationale: string;
};

const SYSPROMPT = `당신은 ftc_brands_2024 (152 컬럼) 에서 사용자 토픽에 필요한 컬럼만 선별합니다.

# 규칙
1. 토픽 키워드와 직접 관련된 컬럼만 선택
   - "폐점률" → chg_*_contract_cancel, chg_*_contract_end, chg_*_name_change, chg_*_new_open, frcs_cnt_*, stores_*
   - "본사 차별점" → fin_2024_revenue, fin_2024_op_profit, fin_2024_op_margin_pct, fin_2024_total_asset, fin_2024_total_debt, hq_*
   - "매출 분포" → avg_sales_*, sales_per_area_*, monthly_avg_revenue, annual_revenue
   - "창업비용" → startup_cost_total, startup_fee, joining_fee, education_fee, deposit, interior_cost_total
2. 항상 포함 (강제): id, brand_nm, corp_nm, induty_lclas, induty_mlsfc, biz_start_dt
3. 토픽이 분포 비교면 매출/창업비용 핵심 컬럼 추가
4. 토픽이 본사 차별점이면 본사 재무 (fin_*) 추가
5. 일반 brand 분석이면 매출·비용·재무·네트워크 4개 카테고리 핵심 ~25개

❌ 금지: 152개 모두 선택 (token 폭발), 카탈로그에 없는 컬럼명
✅ 권장: 15~30개 선별

# 카탈로그
${buildFtcColumnCatalog()}

# 출력 형식 (JSON 만, 마크다운 fence 금지)
{
  "columns": ["brand_nm", "induty_lclas", "frcs_cnt_2024_total", ...],
  "rationale": "토픽 '폐점률' 에 직접 관련 + 메타 컬럼 + 분포 비교용 매출 컬럼"
}`;

export async function selectColumns(args: {
  topic: string;
  brand_label: string;
  industry: string;
}): Promise<SelectColumnsResult> {
  const user = `토픽: "${args.topic}"\nbrand: ${args.brand_label}\n업종: ${args.industry}\n\n위 토픽에 필요한 컬럼만 선별하세요. JSON 만 출력.`;

  let raw: string;
  try {
    raw = await callHaiku({
      system: SYSPROMPT,
      user,
      maxTokens: 1500,
    });
  } catch (e) {
    // haiku 실패 시 fallback — 기본 핵심 컬럼 25개
    console.warn(`[v4-01] selectColumns haiku 실패: ${(e as Error).message} — fallback 사용`);
    return { columns: defaultFallbackColumns(), rationale: "haiku 실패 — fallback 25개 컬럼" };
  }

  let parsed: SelectColumnsResult;
  try {
    parsed = extractJson(raw) as SelectColumnsResult;
  } catch (e) {
    console.warn(`[v4-01] selectColumns JSON parse 실패: ${(e as Error).message} — fallback 사용`);
    return { columns: defaultFallbackColumns(), rationale: "JSON parse 실패 — fallback 25개 컬럼" };
  }

  if (!Array.isArray(parsed.columns) || parsed.columns.length === 0) {
    return { columns: defaultFallbackColumns(), rationale: "columns 비어있음 — fallback 25개 컬럼" };
  }

  // 카탈로그에 없는 컬럼 무시 + 항상 포함 강제
  const known = getKnownColumns();
  const filtered = parsed.columns.filter((c) => known.has(c));
  const finalSet = new Set([...filtered, ...ALWAYS_INCLUDE_COLUMNS]);
  return {
    columns: Array.from(finalSet),
    rationale: typeof parsed.rationale === "string" ? parsed.rationale : "",
  };
}

/** haiku 실패 시 기본 25개 컬럼 (매출·비용·재무·네트워크 핵심). */
function defaultFallbackColumns(): string[] {
  return [
    ...ALWAYS_INCLUDE_COLUMNS,
    "frcs_cnt_2024_total",
    "frcs_cnt_2023_total",
    "stores_2024_franchise",
    "chg_2024_new_open",
    "chg_2024_contract_cancel",
    "chg_2024_contract_end",
    "avg_sales_2024_total",
    "sales_per_area_2024_total",
    "startup_cost_total",
    "startup_fee",
    "education_fee",
    "deposit",
    "interior_cost_total",
    "fin_2024_revenue",
    "fin_2024_op_profit",
    "fin_2024_net_income",
    "fin_2024_total_asset",
    "fin_2024_total_debt",
    "fin_2024_total_equity",
    "violation_correction",
    "business_year_cnt",
  ];
}
