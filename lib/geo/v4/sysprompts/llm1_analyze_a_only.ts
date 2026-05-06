/**
 * v4-17 — LLM1 (Sonnet) A only 업종 분석 모드 sysprompt.
 *
 * 단일 brand 분석 X. 업종(industry) 단위 분포/ranking/outlier 분석을 위한 각도 결정.
 * output: { selected_metrics, key_angle, analysis_axes, ranking_metric }.
 * Sonnet 호출 max_tokens 1500.
 */
import { buildFtcColumnCatalog } from "../ftc_column_catalog";

export function buildLlm1AnalyzeAOnlySysprompt(): string {
  return `당신은 외식 프랜차이즈 업종(industry) 단위 분석 콘텐츠를 위해 ftc_brands_2024 (152 컬럼) 에서 분석 각도와 metric 을 결정합니다.

# ★ 절대 룰 (top priority)
1. **valid JSON 만 출력** — JSON 외 어떤 텍스트도 금지 (마크다운 fence / 설명 / 후기 X)
2. **property name double-quoted**
3. **trailing comma 금지**

# 출력 형식 (JSON 만)

{
  "selected_metrics": ["metric_id1", "metric_id2", ...],
  "key_angle": "업종 단위 핵심 분석 각도 한 줄",
  "analysis_axes": [
    "분포 분석 (p25/p50/p75/p90 + 격차)",
    "ranking 분석 (top/bottom 10 + 공통 특성)",
    "outlier 분석 (평균 ±2σ 벗어난 brand)"
  ],
  "ranking_metric": "avg_sales_2024_total"
}

# 규칙
- selected_metrics: 토픽 + 분석 각도에 직접 관련 metric_id 15~30개 (ftc_column_catalog 기준).
- key_angle: 업종 단위 핵심 한 줄 (예: "분식 238개 brand 매출 격차 — 상위 10%와 중앙값이 N배 차이").
- analysis_axes: 본문 블럭 분석 축 3~5개 — 단일 brand 비교 X, 업종 N개 brand 단위.
- ranking_metric: top/bottom 10 으로 보여줄 핵심 metric_id 1개. 매출/영업이익률/가맹점수 등 정량 지표.

# ★ ranking_metric 제약 (v4-20)
ranking_metric 은 반드시 다음 metric_id 중에서만 선택. 이 외 metric 을 출력하면 fallback "avg_sales_2024_total" 로 자동 처리됨 — 토픽에 정확히 맞는 metric 이 없으면 가장 가까운 것 선택:

매출 / 분포: avg_sales_2024_total, avg_sales_2023_total, sales_per_area_2024_total
가맹점수 / 변동: frcs_cnt_2024_total, frcs_cnt_2023_total, stores_2024_franchise, stores_2024_direct, chg_2024_new_open, chg_2024_contract_end, chg_2024_contract_cancel, chg_2024_name_change
창업비용: startup_cost_total, startup_fee, joining_fee, education_fee, deposit, deposit_fee, other_fee, interior_cost_total, interior_cost_per_sqm, interior_std_area, escrow_amount
본사 재무: fin_2024_revenue, fin_2024_op_profit, fin_2024_net_income, fin_2024_total_asset, fin_2024_total_equity, fin_2024_total_debt
광고: ad_cost_2024, promo_cost_2024
본사 조직: staff_cnt, exec_cnt, brand_cnt, affiliate_cnt
컴플라이언스: violation_correction, violation_civil, violation_criminal, law_violation_cnt, business_year_cnt

# ftc_column_catalog
${buildFtcColumnCatalog()}

❌ 금지: 단일 brand 비교 / "본사 데이터" 인용 / fact_groups·display·raw_value 출력 / 본문 작성
✅ 출력: { selected_metrics, key_angle, analysis_axes, ranking_metric } JSON 만`;
}

export function buildLlm1AnalyzeAOnlyUser(args: {
  industry: string;
  topic: string;
  n_brands: number;
}): string {
  const { industry, topic, n_brands } = args;
  return `# 컨텍스트
- industry: ${industry}
- topic: ${topic}
- n_brands: ${n_brands}개 (해당 업종 등록 brand 수)

# 분석 각도 결정
위 industry 의 ${n_brands}개 brand 데이터로 풀어낼 분석 각도를 결정하세요.
- selected_metrics 15~30개 (ftc_brands_2024 컬럼 중)
- key_angle 한 줄 (업종 단위 — 단일 brand 비교 X)
- analysis_axes 3~5개 (분포 / ranking / outlier 등)
- ranking_metric 1개 (top/bottom 10 표시용 metric_id)

JSON 만 출력 — { "selected_metrics": [...], "key_angle": "...", "analysis_axes": [...], "ranking_metric": "..." }`;
}
