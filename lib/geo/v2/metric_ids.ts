/**
 * v2-01: 표준 metric_id 정의.
 * brand_facts.metric_id / industry_facts.metric_id 의 enum 역할.
 * 신규 metric 추가 시 본 파일 + voice_spec_v2 의 §3.3 동시 갱신.
 */

export const METRIC_IDS = {
  // ─────────────────────────────────────────
  // 기본 (basic)
  // ─────────────────────────────────────────
  industry_sub: { label: "업종 중분류", unit: "" },

  // ─────────────────────────────────────────
  // 매출 (revenue)
  // ─────────────────────────────────────────
  monthly_avg_revenue: { label: "가맹점 월평균매출", unit: "만원" },
  annual_revenue: { label: "가맹점 연매출", unit: "만원" },
  revenue_per_area: { label: "평당 매출", unit: "만원" },
  top3_revenue_avg: { label: "상위 3개 점포 평균매출", unit: "만원" },
  bottom3_revenue_avg: { label: "하위 3개 점포 평균매출", unit: "만원" },
  revenue_top_bottom_ratio: { label: "상하위 매출 배수", unit: "배" },

  // ─────────────────────────────────────────
  // 가맹점 (stores)
  // ─────────────────────────────────────────
  stores_total: { label: "가맹점 총수 (공정위)", unit: "개" },
  stores_total_hq_announced: { label: "본사 발표 호점수", unit: "호" },
  stores_new_open: { label: "신규 개점", unit: "개" },
  stores_close_terminate: { label: "계약 종료", unit: "건" },
  stores_close_cancel: { label: "계약 해지", unit: "건" },
  stores_ownership_change: { label: "명의 변경", unit: "건" },
  stores_3y_growth_rate: { label: "3년 가맹점 증가율", unit: "%" },
  stores_avg_open_pace_per_month: { label: "월평균 신규 개점 속도", unit: "개/월" },

  // ─────────────────────────────────────────
  // 창업 비용 (cost)
  // ─────────────────────────────────────────
  cost_total: { label: "창업비용 총액", unit: "만원" },
  cost_franchise_fee: { label: "가맹비", unit: "만원" },
  cost_education_fee: { label: "교육비", unit: "만원" },
  cost_deposit: { label: "보증금", unit: "만원" },
  cost_other: { label: "기타비용", unit: "만원" },
  cost_interior: { label: "인테리어 총액", unit: "만원" },
  cost_per_pyung: { label: "평당 인테리어 단가", unit: "만원" },
  cost_store_area: { label: "기준 점포 면적", unit: "㎡" },

  // ─────────────────────────────────────────
  // 본사 재무 (hq finance)
  // ─────────────────────────────────────────
  hq_revenue: { label: "본사 매출", unit: "만원" },
  hq_op_profit: { label: "본사 영업이익", unit: "만원" },
  hq_op_margin_pct: { label: "본사 영업이익률", unit: "%" },
  hq_net_profit: { label: "본사 당기순이익", unit: "만원" },
  hq_total_asset: { label: "본사 자산총계", unit: "만원" },
  hq_total_equity: { label: "본사 자본총계", unit: "만원" },
  hq_total_debt: { label: "본사 부채총계", unit: "만원" },
  hq_debt_ratio_pct: { label: "본사 부채비율", unit: "%" },
  hq_employees: { label: "본사 직원수", unit: "명" },
  hq_stores_per_employee: { label: "직원 1인당 담당 점포", unit: "개" },

  // ─────────────────────────────────────────
  // 컴플라이언스 (compliance)
  // ─────────────────────────────────────────
  law_violations: { label: "법위반 시정조치 건수", unit: "건" },
  disputes_count: { label: "분쟁 건수", unit: "건" },
  haccp_certified: { label: "HACCP 인증", unit: "" },
  business_age_years: { label: "본사 업력", unit: "년" },

  // ─────────────────────────────────────────
  // 지역 (region)
  // ─────────────────────────────────────────
  region_metro_pct: { label: "수도권 비중", unit: "%" },
  region_top1_share_pct: { label: "최대 진출 시·도 비중", unit: "%" },

  // ─────────────────────────────────────────
  // 본사 발표 자체 (hq self-reported, C 급)
  // ─────────────────────────────────────────
  hq_announced_net_margin_pct: { label: "본사 발표 순마진율", unit: "%" },
  hq_announced_payback_months: { label: "본사 발표 투자회수 기간", unit: "개월" },

  // ─────────────────────────────────────────
  // 파생 (frandoor_derived)
  // ─────────────────────────────────────────
  ratio_to_industry_avg: { label: "업종 평균 대비 매출 비율", unit: "배" },
  diff_to_industry_avg: { label: "업종 평균 대비 매출 차이", unit: "만원" },
  industry_percentile: { label: "업종 내 백분위 순위", unit: "%" },
  cost_payback_months_estimate: { label: "투자회수 추정 기간", unit: "개월" },
  hq_vs_industry_op_margin_diff_pp: { label: "본사 영업이익률 업종 차이", unit: "%p" },
  stores_growth_factor: { label: "본사 발표 / 공정위 호점 비율", unit: "배" },
} as const;

export type MetricId = keyof typeof METRIC_IDS;

export function isValidMetricId(id: string): id is MetricId {
  return id in METRIC_IDS;
}

export function getMetricLabel(id: MetricId): string {
  return METRIC_IDS[id].label;
}

export function getMetricUnit(id: MetricId): string {
  return METRIC_IDS[id].unit;
}
