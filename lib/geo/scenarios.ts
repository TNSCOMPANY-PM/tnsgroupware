/**
 * PR062 — topic 시나리오 카탈로그 (34개) + 라우터.
 *
 * 시나리오 = topic 키워드 + 활성 영역 + H2 골격 + 핵심 ftc 컬럼 + lede·결론 패턴.
 * D3.ts 가 topic → 시나리오 ID 매칭 → H2 골격 결정 → sonnet 본문 다양화.
 *
 * 카테고리: compare 5 / cost 5 / revenue 5 / frcs 5 / hq 5 / ops 3 / trust 3
 *           regional 3 / market 3 / default 1 = 34 시나리오.
 */

import type { AreaKey } from "@/lib/geo/prefetch/frandoorDocx";

export type ScenarioId =
  // 비교·차이 (5)
  | "compare_official_vs_brochure"
  | "compare_vs_industry_avg"
  | "compare_vs_top_n"
  | "compare_year_over_year"
  | "compare_regional_gap"
  // 창업비용 (5)
  | "cost_breakdown"
  | "cost_interior_per_pyung"
  | "cost_total_investment"
  | "cost_payback_period"
  | "cost_percentile"
  // 매출·수익성 (5)
  | "revenue_monthly_avg"
  | "revenue_regional_gap"
  | "revenue_per_area"
  | "revenue_hq_3y_trend"
  | "revenue_margin_estimate"
  // 가맹점 현황 (5)
  | "frcs_3y_trend"
  | "frcs_new_open_pace"
  | "frcs_closure_breakdown"
  | "frcs_ownership_change"
  | "frcs_expansion_speed"
  // 본사 재무 (5)
  | "hq_balance_sheet"
  | "hq_op_margin"
  | "hq_revenue_cagr"
  | "hq_org_size"
  | "hq_vs_franchise_revenue"
  // 운영·계약 (3)
  | "ops_contract_terms"
  | "ops_marketing_cost"
  | "ops_royalty_breakdown"
  // 신뢰성 (3)
  | "trust_law_violations"
  | "trust_business_history"
  | "trust_zero_disputes"
  // 입지·지역 (3)
  | "regional_distribution"
  | "regional_metro_vs_local"
  | "regional_new_entry_pattern"
  // 업종 시장 (3)
  | "market_industry_overview"
  | "market_top_vs_bottom"
  | "market_new_vs_established"
  // fallback
  | "default_brand_overview";

export type ScenarioCategory =
  | "compare" | "cost" | "revenue" | "frcs" | "hq" | "ops"
  | "trust" | "regional" | "market" | "default";

export type ScenarioH2 = {
  /** 본문 H2 텍스트 ({brand}·{industry}·{n} 등 변수 포함 가능). */
  heading: string;
  /** 섹션 의도 (sonnet 프롬프트 가이드). */
  intent: string;
  /** STANDARD_METRICS.id 또는 ftc 컬럼명. */
  required_metrics: string[];
  optional_metrics?: string[];
};

export type ScenarioLedeFocus = "compare" | "metric" | "trend" | "insight";

export type Scenario = {
  id: ScenarioId;
  category: ScenarioCategory;
  /** 제목 패턴 (interpolate 변수 포함). */
  title_template: string;
  /** topic 매칭 정규식 (longest match 우선). */
  topic_keywords: RegExp[];
  /** PR052 영역 라우터 활성 영역 — primary 처리. */
  active_areas: AreaKey[];
  /** H2 골격 (3~6개). */
  h2_sections: ScenarioH2[];
  lede_focus: ScenarioLedeFocus;
  /** 결론 1문장 템플릿. */
  conclusion_pattern: string;
  /** share-line 업종 특화 (선택). */
  share_focus?: string;
  /** 본 시나리오에서 핵심 활용 ftc 컬럼. */
  ftc_columns_used: string[];
};

export const SCENARIOS: Record<ScenarioId, Scenario> = {
  // ─── A. 비교·차이 (5) ────────────────────────────────────────
  compare_official_vs_brochure: {
    id: "compare_official_vs_brochure",
    category: "compare",
    title_template: "{brand} 2024 — 공정위 vs 본사 발표, 어떻게 다를까",
    topic_keywords: [
      /공정위.*(vs|대비|비교).*본사/,
      /본사.*(vs|대비|비교).*공정위/,
      /자료.*(다른|비교|차이)/,
    ],
    active_areas: ["brand_basic", "frcs_status", "avg_revenue", "startup_cost"],
    h2_sections: [
      { heading: "두 자료, 무엇이 다를까요?", intent: "공정위 vs 본사 갭 핵심 1단락", required_metrics: ["stores_total"] },
      { heading: "가맹점 수와 매출 — 시점이 다르면 결과도 다릅니다", intent: "비교표 + 시점 갭 설명", required_metrics: ["stores_total", "monthly_avg_sales"] },
      { heading: "창업비용 — 두 자료의 합계는 일치할까요?", intent: "창업비용 항목별 비교", required_metrics: ["cost_total", "franchise_fee"] },
      { heading: "갭의 원인은 어디서 올까요?", intent: "시점/표본/산정 차이 가능성", required_metrics: [] },
    ],
    lede_focus: "compare",
    conclusion_pattern: "공정위 자료와 본사 발표는 기준 시점·산정 방식이 달라 직접 비교가 어렵습니다. {brand}의 두 자료를 모두 공개해 드렸습니다.",
    ftc_columns_used: ["frcs_cnt_2024_total", "avg_sales_2024_total", "startup_cost_total"],
  },

  compare_vs_industry_avg: {
    id: "compare_vs_industry_avg",
    category: "compare",
    title_template: "{brand} vs {industry} {n}개 평균 — 매출·창업비용·점포수 위치",
    topic_keywords: [/업종.*평균.*비교/, /평균.*대비/, /\bvs\b.*평균/, /업종.*위치/, /평균.*비교/],
    active_areas: ["avg_revenue", "startup_cost", "frcs_status"],
    h2_sections: [
      { heading: "{industry} 업종 {n}개 평균과 어떻게 다를까요?", intent: "핵심 3지표 차이 한눈에", required_metrics: ["monthly_avg_sales", "cost_total", "stores_total"] },
      { heading: "월평균매출 — 업종 평균의 몇 배 수준?", intent: "매출 percentile + 배수", required_metrics: ["monthly_avg_sales"] },
      { heading: "창업비용 — 업종 평균보다 높을까요, 낮을까요?", intent: "창업비용 차이 + 항목별", required_metrics: ["cost_total", "franchise_fee", "interior_cost"] },
      { heading: "가맹점수 — 평균 대비 규모", intent: "stores percentile", required_metrics: ["stores_total"] },
    ],
    lede_focus: "metric",
    conclusion_pattern: "{brand}은 {industry} 업종 {n}개 중 매출 {ratio}배 / 창업비용 {cost_diff}만원 {direction} 수준입니다.",
    ftc_columns_used: ["avg_sales_2024_total", "startup_cost_total", "frcs_cnt_2024_total"],
  },

  compare_vs_top_n: {
    id: "compare_vs_top_n",
    category: "compare",
    title_template: "{brand} — {industry} TOP {n} 매출 brand 와 직접 비교",
    topic_keywords: [/\b(top|상위|순위|랭킹)\b/i, /1위|2위|3위|4위|5위/],
    active_areas: ["avg_revenue", "frcs_status"],
    h2_sections: [
      { heading: "{industry} TOP {n} brand 와 비교하면?", intent: "상위 N개 brand vs 본 브랜드", required_metrics: ["monthly_avg_sales", "stores_total"] },
      { heading: "매출 1위 brand와의 격차", intent: "TOP1 vs 본 브랜드", required_metrics: ["monthly_avg_sales"] },
      { heading: "매출 효율 — 점포당 매출", intent: "매출/점포수 비율", required_metrics: ["monthly_avg_sales", "stores_total"] },
    ],
    lede_focus: "compare",
    conclusion_pattern: "{brand}은 {industry} TOP {n} 중 {rank}위 수준입니다.",
    ftc_columns_used: ["avg_sales_2024_total", "frcs_cnt_2024_total"],
  },

  compare_year_over_year: {
    id: "compare_year_over_year",
    category: "compare",
    title_template: "{brand} 2022·2023·2024 — 본사 재무 3년 추이",
    topic_keywords: [/3년|연도별|추이|성장|\bcagr\b/i, /2022.*2024|2024.*2022/],
    active_areas: ["brand_basic"],
    h2_sections: [
      { heading: "3년 사이 본사 매출은 어떻게 변했나요?", intent: "fin_*_revenue 3년치", required_metrics: ["hq_revenue"] },
      { heading: "수익성 — 영업이익률 추이", intent: "op_profit/revenue 3년", required_metrics: ["hq_op_profit", "hq_revenue"] },
      { heading: "재무 안정성 — 부채비율 변화", intent: "debt/equity 3년", required_metrics: ["hq_total_debt", "hq_total_equity"] },
    ],
    lede_focus: "trend",
    conclusion_pattern: "{brand} 본사는 2022~2024 사이 매출 {growth}배 성장했습니다.",
    ftc_columns_used: ["fin_2024_revenue", "fin_2023_revenue", "fin_2022_revenue", "fin_2024_op_profit", "fin_2024_total_debt", "fin_2024_total_equity"],
  },

  compare_regional_gap: {
    id: "compare_regional_gap",
    category: "compare",
    title_template: "{brand} 17개 지역 매출 격차 분석",
    topic_keywords: [/지역.*격차|지역.*분포/, /17.*지역/],
    active_areas: ["revenue_detail", "frcs_status"],
    h2_sections: [
      { heading: "지역별 점포 분포는 어떻게 되어있나요?", intent: "frcs_cnt 지역별", required_metrics: ["stores_total"] },
      { heading: "지역별 매출 격차 — 서울 vs 지방", intent: "avg_sales 지역별 TOP 3", required_metrics: ["monthly_avg_sales"] },
      { heading: "단위면적당 매출 — 입지 효율", intent: "sales_per_area 지역별", required_metrics: [] },
    ],
    lede_focus: "compare",
    conclusion_pattern: "{brand}은 17개 지역 중 {top_region} 매출이 가장 높고 {bottom_region}과 {ratio}배 격차가 있습니다.",
    ftc_columns_used: ["avg_sales_2024_seoul", "avg_sales_2024_busan", "frcs_cnt_2024_seoul", "sales_per_area_2024_total"],
  },

  // ─── B. 창업비용 (5) ─────────────────────────────────────────
  cost_breakdown: {
    id: "cost_breakdown",
    category: "cost",
    title_template: "{brand} 창업비용 분해 — 가맹비·교육비·인테리어 어디서 어디까지",
    topic_keywords: [/창업비용|투자금|실투자|초기.*비용/],
    active_areas: ["startup_cost"],
    h2_sections: [
      { heading: "창업비용 총액과 항목별 분해", intent: "5항목 + 합계", required_metrics: ["cost_total", "franchise_fee", "education_fee", "deposit", "other_cost"] },
      { heading: "인테리어 — 평당 단가와 기준 면적", intent: "interior_cost + per_sqm", required_metrics: ["interior_cost", "interior_per_pyung", "ref_store_area"] },
      { heading: "업종 평균과 비교하면 어느 수준?", intent: "cost_total vs 업종 평균", required_metrics: ["cost_total"] },
      { heading: "예치 가맹금 — 창업비용 외 추가 부담", intent: "escrow_amount", required_metrics: ["escrow_amount"] },
    ],
    lede_focus: "metric",
    conclusion_pattern: "{brand} 창업비용 총액 {cost_total}만원 + 예치 가맹금 {escrow}만원, 업종 평균 대비 {direction}.",
    ftc_columns_used: ["startup_fee", "education_fee", "deposit_fee", "other_fee", "startup_cost_total", "interior_cost_total", "interior_cost_per_sqm", "interior_std_area", "escrow_amount"],
  },

  cost_interior_per_pyung: {
    id: "cost_interior_per_pyung",
    category: "cost",
    title_template: "{brand} 인테리어 평당 {price}만원 — 업종 평균 대비",
    topic_keywords: [/인테리어/, /평당|단가/],
    active_areas: ["startup_cost"],
    h2_sections: [
      { heading: "평당 인테리어 단가", intent: "interior_cost_per_sqm", required_metrics: ["interior_per_pyung"] },
      { heading: "기준 점포 면적", intent: "interior_std_area", required_metrics: ["ref_store_area"] },
      { heading: "업종 평균 인테리어 단가와 비교", intent: "vs 업종 평균", required_metrics: [] },
    ],
    lede_focus: "metric",
    conclusion_pattern: "{brand} 인테리어 평당 {price}만원, 기준 면적 {area}㎡ 기준 총 {total}만원 수준.",
    ftc_columns_used: ["interior_cost_per_sqm", "interior_std_area", "interior_cost_total"],
  },

  cost_total_investment: {
    id: "cost_total_investment",
    category: "cost",
    title_template: "{brand} 실투자금 분석 — 창업비용·예치금·옵션비용",
    topic_keywords: [/실투자금|총.*투자|초기.*자본/],
    active_areas: ["startup_cost"],
    h2_sections: [
      { heading: "공정위 공시 창업비용 총액", intent: "cost_total", required_metrics: ["cost_total"] },
      { heading: "예치 가맹금 — 별도 부담 항목", intent: "escrow_amount", required_metrics: ["escrow_amount"] },
      { heading: "추가 옵션비용·운영자금 — 본사 확인 필요", intent: "공개 자료 외 항목", required_metrics: [] },
    ],
    lede_focus: "metric",
    conclusion_pattern: "{brand} 공정위 공시 실투자금 합계 {sum}만원 (창업비용 + 예치금).",
    ftc_columns_used: ["startup_cost_total", "escrow_amount"],
  },

  cost_payback_period: {
    id: "cost_payback_period",
    category: "cost",
    title_template: "{brand} 투자회수 기간 추정 — 매출·창업비용·순마진",
    topic_keywords: [/회수|payback|손익분기/i],
    active_areas: ["startup_cost", "avg_revenue"],
    h2_sections: [
      { heading: "공정위 자료로 추정한 회수기간", intent: "cost_total / annual_sales × margin / 12", required_metrics: ["cost_total", "annual_avg_sales"] },
      { heading: "본사 발표 회수기간과의 갭", intent: "본사 발표 vs frandoor 산출", required_metrics: [] },
      { heading: "순마진 가정에 따른 회수기간 변동폭", intent: "10%/20%/30% 시뮬", required_metrics: [] },
    ],
    lede_focus: "metric",
    conclusion_pattern: "{brand} 공정위 자료 기반 회수기간 {months}개월 (순마진 10% 가정).",
    ftc_columns_used: ["startup_cost_total", "avg_sales_2024_total"],
  },

  cost_percentile: {
    id: "cost_percentile",
    category: "cost",
    title_template: "{brand} 창업비용 — {industry} {n}개 중 상위 {pct}%",
    topic_keywords: [/창업비용.*(순위|위치|상위|비교)/],
    active_areas: ["startup_cost"],
    h2_sections: [
      { heading: "{industry} {n}개 brand 중 창업비용 순위", intent: "percentile + rank", required_metrics: ["cost_total"] },
      { heading: "고가/저가 brand 의 차이는 어디서 오나요?", intent: "TOP/Bottom 비교", required_metrics: [] },
    ],
    lede_focus: "metric",
    conclusion_pattern: "{brand} 창업비용 {cost}만원, {industry} {n}개 중 상위 {pct}%.",
    ftc_columns_used: ["startup_cost_total"],
  },

  // ─── C. 매출·수익성 (5) ──────────────────────────────────────
  revenue_monthly_avg: {
    id: "revenue_monthly_avg",
    category: "revenue",
    title_template: "{brand} 월평균매출 {value}만원 — 업종 평균의 {ratio}배",
    topic_keywords: [/월매출|월평균매출|월수익/],
    active_areas: ["avg_revenue"],
    h2_sections: [
      { heading: "공정위 공시 월평균매출", intent: "monthly_avg_sales", required_metrics: ["monthly_avg_sales"] },
      { heading: "업종 평균과의 격차 — 배수와 차이", intent: "vs 업종 평균", required_metrics: ["monthly_avg_sales"] },
      { heading: "업종 내 percentile — 상위 몇%?", intent: "rank/total × 100", required_metrics: ["monthly_avg_sales"] },
    ],
    lede_focus: "metric",
    conclusion_pattern: "{brand} 월평균매출 {value}만원, {industry} {n}개 평균의 {ratio}배 / 상위 {pct}%.",
    ftc_columns_used: ["avg_sales_2024_total"],
  },

  revenue_regional_gap: {
    id: "revenue_regional_gap",
    category: "revenue",
    title_template: "{brand} 지역별 매출 분포 — 서울 vs 지방",
    topic_keywords: [/지역.*매출|매출.*지역|서울.*매출/],
    active_areas: ["revenue_detail"],
    h2_sections: [
      { heading: "지역별 매출 — TOP 3 지역", intent: "avg_sales 지역별 sort desc", required_metrics: [] },
      { heading: "수도권 vs 지방 격차", intent: "서울+경기+인천 vs 그외", required_metrics: [] },
      { heading: "지역별 점포수 분포", intent: "frcs_cnt 지역별", required_metrics: [] },
    ],
    lede_focus: "metric",
    conclusion_pattern: "{brand} 지역별 매출 격차 {top_region} {top}만원 vs {bottom_region} {bottom}만원.",
    ftc_columns_used: ["avg_sales_2024_seoul", "avg_sales_2024_busan", "avg_sales_2024_gyeonggi", "frcs_cnt_2024_seoul"],
  },

  revenue_per_area: {
    id: "revenue_per_area",
    category: "revenue",
    title_template: "{brand} 평당 매출 효율 분석",
    topic_keywords: [/평당|면적당|매출\s*효율/],
    active_areas: ["revenue_detail"],
    h2_sections: [
      { heading: "단위면적당 매출 — 평당 얼마?", intent: "sales_per_area_total", required_metrics: [] },
      { heading: "지역별 평당 매출 격차", intent: "sales_per_area 지역별", required_metrics: [] },
    ],
    lede_focus: "metric",
    conclusion_pattern: "{brand} 평당 매출 {value}만원, 업종 평균 {avg}만원 대비 {ratio}배.",
    ftc_columns_used: ["sales_per_area_2024_total", "sales_per_area_2024_seoul"],
  },

  revenue_hq_3y_trend: {
    id: "revenue_hq_3y_trend",
    category: "revenue",
    title_template: "{brand} 본사 매출 3년 추이 — 2022~2024",
    topic_keywords: [/본사.*매출|본사.*성장/],
    active_areas: ["brand_basic"],
    h2_sections: [
      { heading: "본사 매출 3년 변화", intent: "fin_*_revenue 3년", required_metrics: ["hq_revenue"] },
      { heading: "성장률 — CAGR 산출", intent: "(2024/2022)^(1/2)-1", required_metrics: [] },
      { heading: "신생 본사 vs 안정 본사 패턴", intent: "신생 시 변동폭 큼", required_metrics: [] },
    ],
    lede_focus: "trend",
    conclusion_pattern: "{brand} 본사 매출 2022 {y2022}억 → 2024 {y2024}억, {growth}배 성장.",
    ftc_columns_used: ["fin_2022_revenue", "fin_2023_revenue", "fin_2024_revenue"],
  },

  revenue_margin_estimate: {
    id: "revenue_margin_estimate",
    category: "revenue",
    title_template: "{brand} 가맹점 추정 순마진 — 본사 발표 vs frandoor 산출",
    topic_keywords: [/순마진|마진율|수익률/],
    active_areas: ["avg_revenue"],
    h2_sections: [
      { heading: "본사 발표 순마진", intent: "docx 홈페이지 데이터", required_metrics: [] },
      { heading: "본사 영업이익률과 가맹점 순마진의 관계", intent: "본사 OP vs 가맹점 마진 차이", required_metrics: ["hq_op_margin_pct"] },
      { heading: "산정 방식 — 원가/임대료 포함 여부", intent: "공개 자료로 특정 불가", required_metrics: [] },
    ],
    lede_focus: "metric",
    conclusion_pattern: "{brand} 본사 영업이익률 {margin}%, 가맹점 순마진은 본사 발표 {pub}% (산정 기준 차이).",
    ftc_columns_used: ["fin_2024_op_profit", "fin_2024_revenue"],
  },

  // ─── D. 가맹점 현황 (5) ──────────────────────────────────────
  frcs_3y_trend: {
    id: "frcs_3y_trend",
    category: "frcs",
    title_template: "{brand} 가맹점 3년 추이 — 2022·2023·2024",
    topic_keywords: [/가맹점.*추이|가맹점.*변화|연도별.*점포/],
    active_areas: ["frcs_status"],
    h2_sections: [
      { heading: "연도별 가맹점수", intent: "stores_2022/2023/2024", required_metrics: [] },
      { heading: "신규개점 추세", intent: "chg_*_new_open 3년", required_metrics: [] },
      { heading: "확장 속도 — 1년 변화율", intent: "(2024-2023)/2023", required_metrics: [] },
    ],
    lede_focus: "trend",
    conclusion_pattern: "{brand} 가맹점 2022 {y2022}개 → 2024 {y2024}개, {x}배 확장.",
    ftc_columns_used: ["stores_2022_franchise", "stores_2023_franchise", "stores_2024_franchise", "chg_2022_new_open", "chg_2023_new_open", "chg_2024_new_open"],
  },

  frcs_new_open_pace: {
    id: "frcs_new_open_pace",
    category: "frcs",
    title_template: "{brand} 신규개점 속도 — 연 {n}개점",
    topic_keywords: [/신규.*개점|개점.*속도|확장.*속도/],
    active_areas: ["frcs_status"],
    h2_sections: [
      { heading: "최근 1년 신규개점", intent: "chg_2024_new_open", required_metrics: [] },
      { heading: "기존 점포 대비 확장 비율", intent: "new/total × 100", required_metrics: [] },
      { heading: "업종 평균 신규개점 페이스와 비교", intent: "ftc 업종 평균", required_metrics: [] },
    ],
    lede_focus: "metric",
    conclusion_pattern: "{brand} 2024년 신규개점 {n}개, 기존 점포 대비 {ratio}배 확장.",
    ftc_columns_used: ["chg_2024_new_open", "frcs_cnt_2024_total"],
  },

  frcs_closure_breakdown: {
    id: "frcs_closure_breakdown",
    category: "frcs",
    title_template: "{brand} 폐점·해지 분석 — 공시 폐점률 {rate}%",
    topic_keywords: [/폐점|계약.*종료|계약.*해지/],
    active_areas: ["frcs_status"],
    h2_sections: [
      { heading: "공정위 공시 폐점률", intent: "(end+cancel)/base", required_metrics: [] },
      { heading: "계약종료 vs 계약해지 — 의미가 다릅니다", intent: "두 항목 분리 설명", required_metrics: [] },
      { heading: "업종 평균 폐점률과 비교", intent: "업종 평균", required_metrics: [] },
    ],
    lede_focus: "metric",
    conclusion_pattern: "{brand} 공시 폐점률 {rate}%, 업종 평균 {avg}% 대비 {direction}.",
    ftc_columns_used: ["chg_2024_contract_end", "chg_2024_contract_cancel", "frcs_cnt_2024_total"],
  },

  frcs_ownership_change: {
    id: "frcs_ownership_change",
    category: "frcs",
    title_template: "{brand} 명의변경 {n}건 — 양도양수 패턴",
    topic_keywords: [/명의.*변경|양도|양수/],
    active_areas: ["frcs_status"],
    h2_sections: [
      { heading: "명의변경 — 폐점이 아닌 운영자 변경", intent: "양도양수 의미", required_metrics: [] },
      { heading: "최근 1년 명의변경 건수", intent: "chg_2024_name_change", required_metrics: [] },
      { heading: "업종 평균 명의변경 건수와 비교", intent: "ftc 평균", required_metrics: [] },
    ],
    lede_focus: "metric",
    conclusion_pattern: "{brand} 2024년 명의변경 {n}건, 운영자 변경(양도양수) 사례.",
    ftc_columns_used: ["chg_2024_name_change", "frcs_cnt_2024_total"],
  },

  frcs_expansion_speed: {
    id: "frcs_expansion_speed",
    category: "frcs",
    title_template: "{brand} 확장 속도 — 업종 {n}개 중 상위 {pct}%",
    topic_keywords: [/확장.*속도|성장.*속도|점포.*증가율/],
    active_areas: ["frcs_status"],
    h2_sections: [
      { heading: "1년 점포 증가율", intent: "(2024-2023)/2023", required_metrics: [] },
      { heading: "업종 N개 brand 중 확장 속도 순위", intent: "percentile by growth rate", required_metrics: [] },
      { heading: "확장 속도 패턴 — 신생 vs 안정", intent: "업력별 차이", required_metrics: [] },
    ],
    lede_focus: "metric",
    conclusion_pattern: "{brand} 1년 확장률 {growth}%, {industry} {n}개 중 상위 {pct}%.",
    ftc_columns_used: ["stores_2023_franchise", "stores_2024_franchise"],
  },

  // ─── E. 본사 재무 (5) ────────────────────────────────────────
  hq_balance_sheet: {
    id: "hq_balance_sheet",
    category: "hq",
    title_template: "{brand} 본사 재무 분석 — 자산·부채·자본",
    topic_keywords: [/본사.*재무|재무.*건전|자산.*부채/],
    active_areas: ["brand_basic"],
    h2_sections: [
      { heading: "본사 자산·부채·자본 구조", intent: "balance sheet", required_metrics: ["hq_total_assets", "hq_total_debt", "hq_total_equity"] },
      { heading: "부채비율 — 업종 평균과 비교", intent: "debt/equity", required_metrics: ["hq_debt_ratio_pct"] },
      { heading: "재무 건전성 신호", intent: "fact 만, 판단 금지", required_metrics: [] },
    ],
    lede_focus: "metric",
    conclusion_pattern: "{brand} 본사 부채비율 {ratio}%, {industry} 평균 {avg}% 대비 {direction}.",
    ftc_columns_used: ["fin_2024_total_asset", "fin_2024_total_debt", "fin_2024_total_equity"],
  },

  hq_op_margin: {
    id: "hq_op_margin",
    category: "hq",
    title_template: "{brand} 본사 영업이익률 {margin}% — 업종 평균 대비 {diff}%p",
    topic_keywords: [/영업이익률|영업.*마진/, /op.*margin/i],
    active_areas: ["brand_basic"],
    h2_sections: [
      { heading: "본사 영업이익률", intent: "op_profit/revenue", required_metrics: ["hq_op_margin_pct"] },
      { heading: "업종 평균 영업이익률과의 격차", intent: "vs ftc 업종 평균", required_metrics: [] },
      { heading: "본사 매출 규모와의 관계", intent: "revenue 규모별 OP", required_metrics: ["hq_revenue"] },
    ],
    lede_focus: "metric",
    conclusion_pattern: "{brand} 본사 영업이익률 {margin}%, {industry} 평균 {avg}% 대비 {diff}%p.",
    ftc_columns_used: ["fin_2024_op_profit", "fin_2024_revenue"],
  },

  hq_revenue_cagr: {
    id: "hq_revenue_cagr",
    category: "hq",
    title_template: "{brand} 본사 매출 성장률 CAGR {growth}%",
    topic_keywords: [/cagr|성장률|연.*평균.*성장/i],
    active_areas: ["brand_basic"],
    h2_sections: [
      { heading: "3년 본사 매출 — 2022·2023·2024", intent: "fin_*_revenue", required_metrics: [] },
      { heading: "CAGR — 연평균 성장률", intent: "(2024/2022)^(1/2)-1", required_metrics: [] },
    ],
    lede_focus: "trend",
    conclusion_pattern: "{brand} 본사 매출 CAGR {growth}% (2022~2024).",
    ftc_columns_used: ["fin_2022_revenue", "fin_2023_revenue", "fin_2024_revenue"],
  },

  hq_org_size: {
    id: "hq_org_size",
    category: "hq",
    title_template: "{brand} 본사 조직 — 임직원·계열사·브랜드",
    topic_keywords: [/임직원|본사.*규모|계열사|brand_cnt/],
    active_areas: ["brand_basic"],
    h2_sections: [
      { heading: "본사 임원·직원 수", intent: "exec_cnt + staff_cnt", required_metrics: ["hq_executives", "hq_employees"] },
      { heading: "계열사·브랜드 수", intent: "brand_cnt + affiliate_cnt", required_metrics: [] },
      { heading: "직원 1인당 가맹점 비율", intent: "stores / staff", required_metrics: [] },
    ],
    lede_focus: "metric",
    conclusion_pattern: "{brand} 본사 임원 {exec}명·직원 {staff}명·브랜드 {brands}개·계열사 {affs}개.",
    ftc_columns_used: ["exec_cnt", "staff_cnt", "brand_cnt", "affiliate_cnt"],
  },

  hq_vs_franchise_revenue: {
    id: "hq_vs_franchise_revenue",
    category: "hq",
    title_template: "{brand} 본사 매출 vs 가맹점 매출 합산",
    topic_keywords: [/본사.*가맹점.*매출|매출.*비중/],
    active_areas: ["brand_basic", "avg_revenue"],
    h2_sections: [
      { heading: "본사 매출 vs 가맹점 매출 합산 추정", intent: "hq_revenue vs avg×stores", required_metrics: [] },
      { heading: "본사 매출 비중 — 가맹사업 의존도", intent: "본사 매출 / (본사+가맹점)", required_metrics: [] },
    ],
    lede_focus: "metric",
    conclusion_pattern: "{brand} 본사 매출 {hq}억 vs 가맹점 매출 합산 추정 {franchise}억.",
    ftc_columns_used: ["fin_2024_revenue", "avg_sales_2024_total", "frcs_cnt_2024_total"],
  },

  // ─── F. 운영·계약 (3) ───────────────────────────────────────
  ops_contract_terms: {
    id: "ops_contract_terms",
    category: "ops",
    title_template: "{brand} 가맹 계약 조건 — 최초 {init}년·연장 {ext}년",
    topic_keywords: [/계약기간|계약.*조건|연장/],
    active_areas: ["operation"],
    h2_sections: [
      { heading: "공정위 공시 계약기간", intent: "contract_initial+renewal", required_metrics: [] },
      { heading: "업종 평균 계약기간과 비교", intent: "ftc 평균", required_metrics: [] },
    ],
    lede_focus: "metric",
    conclusion_pattern: "{brand} 최초 계약 {init}년·연장 {ext}년, 업종 평균과 {direction}.",
    ftc_columns_used: ["contract_initial_years", "contract_renewal_years"],
  },

  ops_marketing_cost: {
    id: "ops_marketing_cost",
    category: "ops",
    title_template: "{brand} 광고비 {ad}만원·판촉비 {promo}만원",
    topic_keywords: [/광고비|판촉|마케팅비/],
    active_areas: ["operation"],
    h2_sections: [
      { heading: "본사 광고·판촉비 규모", intent: "ad+promo", required_metrics: [] },
      { heading: "가맹점당 광고비 환산", intent: "ad/stores", required_metrics: [] },
      { heading: "업종 평균과 비교", intent: "ftc 평균", required_metrics: [] },
    ],
    lede_focus: "metric",
    conclusion_pattern: "{brand} 광고비 {ad}만원, 가맹점당 {per}만원.",
    ftc_columns_used: ["ad_cost_2024", "promo_cost_2024", "frcs_cnt_2024_total"],
  },

  ops_royalty_breakdown: {
    id: "ops_royalty_breakdown",
    category: "ops",
    title_template: "{brand} 가맹비·교육비·보증금·기타 분해",
    topic_keywords: [/로열티|royalty/i, /가맹비.*분해/],
    active_areas: ["startup_cost"],
    h2_sections: [
      { heading: "가맹비·교육비·보증금·기타 항목별 금액", intent: "4 항목", required_metrics: ["franchise_fee", "education_fee", "deposit"] },
      { heading: "업종 평균과 항목별 비교", intent: "vs ftc 업종 평균", required_metrics: [] },
    ],
    lede_focus: "metric",
    conclusion_pattern: "{brand} 가맹비 {fee}만원·교육비 {edu}만원·보증금 {dep}만원.",
    ftc_columns_used: ["startup_fee", "education_fee", "deposit_fee", "other_fee"],
  },

  // ─── G. 신뢰성 (3) ──────────────────────────────────────────
  trust_law_violations: {
    id: "trust_law_violations",
    category: "trust",
    title_template: "{brand} 법위반 이력 — 공정위 시정조치·민사·형사",
    topic_keywords: [/법위반|시정조치|분쟁|민사|형사|소송/],
    active_areas: ["cert_compliance"],
    h2_sections: [
      { heading: "공정위 시정조치·민사·형사 분쟁 건수", intent: "violation 3종", required_metrics: [] },
      { heading: "업종 평균 분쟁 건수와 비교", intent: "ftc 업종 평균", required_metrics: [] },
    ],
    lede_focus: "metric",
    conclusion_pattern: "{brand} 시정조치 {a}건·민사 {b}건·형사 {c}건, 업종 평균 대비 {direction}.",
    ftc_columns_used: ["violation_correction", "violation_civil", "violation_criminal"],
  },

  trust_business_history: {
    id: "trust_business_history",
    category: "trust",
    title_template: "{brand} 본사 업력 — 법인 설립 {year}, 가맹사업 {y2}",
    topic_keywords: [/업력|연혁|개시일|설립.*년/],
    active_areas: ["brand_basic"],
    h2_sections: [
      { heading: "법인 설립 + 가맹사업 개시 시점", intent: "corp_reg_dt + biz_start_dt", required_metrics: [] },
      { heading: "업력별 신뢰성 신호", intent: "신생 vs 안정 패턴", required_metrics: [] },
    ],
    lede_focus: "metric",
    conclusion_pattern: "{brand} 법인 {year}년 설립·가맹사업 {y2}년 개시, 업력 {n}년.",
    ftc_columns_used: ["corp_reg_dt", "biz_start_dt"],
  },

  trust_zero_disputes: {
    id: "trust_zero_disputes",
    category: "trust",
    title_template: "{brand} 분쟁·법위반 0건 — 신뢰성 지표",
    topic_keywords: [/분쟁.*0|법위반.*0|클린/],
    active_areas: ["cert_compliance"],
    h2_sections: [
      { heading: "공시 분쟁·법위반 — 모두 0건", intent: "violation 3종 0", required_metrics: [] },
      { heading: "업종 평균 — 0건 brand 비율", intent: "ftc 업종 0건 비율", required_metrics: [] },
    ],
    lede_focus: "insight",
    conclusion_pattern: "{brand} 공시 분쟁·법위반 0건, {industry} 0건 brand 중 {n}%.",
    ftc_columns_used: ["violation_correction", "violation_civil", "violation_criminal"],
  },

  // ─── H. 입지·지역 (3) ───────────────────────────────────────
  regional_distribution: {
    id: "regional_distribution",
    category: "regional",
    title_template: "{brand} 지역별 점포 분포 — TOP 3 지역",
    topic_keywords: [/지역.*분포|입지|점포.*지역/],
    active_areas: ["frcs_status", "revenue_detail"],
    h2_sections: [
      { heading: "17개 지역 중 점포가 있는 지역", intent: "frcs_cnt 지역별 nonzero", required_metrics: [] },
      { heading: "TOP 3 지역의 점포·매출", intent: "TOP 3 by frcs_cnt", required_metrics: [] },
      { heading: "신규 진출 지역 패턴", intent: "최근 1년 신규지역", required_metrics: [] },
    ],
    lede_focus: "metric",
    conclusion_pattern: "{brand} 17개 지역 중 {n}개 지역 진출, {top_region} 가장 많음.",
    ftc_columns_used: ["frcs_cnt_2024_seoul", "frcs_cnt_2024_busan", "frcs_cnt_2024_gyeonggi", "frcs_cnt_2024_incheon"],
  },

  regional_metro_vs_local: {
    id: "regional_metro_vs_local",
    category: "regional",
    title_template: "{brand} 수도권 vs 지방 — 매출·점포 격차",
    topic_keywords: [/수도권|지방|metro/i],
    active_areas: ["revenue_detail", "frcs_status"],
    h2_sections: [
      { heading: "수도권(서울·경기·인천) vs 지방", intent: "수도권 sum vs 지방 sum", required_metrics: [] },
      { heading: "매출 vs 점포 비례 — 입지 효율", intent: "매출/점포 지역별", required_metrics: [] },
    ],
    lede_focus: "compare",
    conclusion_pattern: "{brand} 수도권 매출 {a}만원·점포 {a_n}개 vs 지방 {b}·{b_n}, 격차 {ratio}배.",
    ftc_columns_used: ["avg_sales_2024_seoul", "avg_sales_2024_gyeonggi", "frcs_cnt_2024_seoul"],
  },

  regional_new_entry_pattern: {
    id: "regional_new_entry_pattern",
    category: "regional",
    title_template: "{brand} 신규 진출 지역 패턴",
    topic_keywords: [/신규.*진출|진출.*지역/],
    active_areas: ["frcs_status"],
    h2_sections: [
      { heading: "지역별 신규개점 분포", intent: "chg new_open 지역 추정", required_metrics: [] },
      { heading: "수도권 vs 지방 진출 페이스", intent: "최근 1년", required_metrics: [] },
    ],
    lede_focus: "trend",
    conclusion_pattern: "{brand} 최근 1년 신규개점 {n}개, {top_region} 중심 진출.",
    ftc_columns_used: ["frcs_cnt_2024_seoul", "frcs_cnt_2023_seoul"],
  },

  // ─── I. 업종 시장 (3) ───────────────────────────────────────
  market_industry_overview: {
    id: "market_industry_overview",
    category: "market",
    title_template: "{industry} 프랜차이즈 {n}개 시장 분석 — 평균·중앙값·격차",
    topic_keywords: [/시장|업종.*분석|업종.*개요|백서/],
    active_areas: ["avg_revenue", "startup_cost", "frcs_status"],
    h2_sections: [
      { heading: "{industry} {n}개 brand 시장 규모", intent: "ftc 업종 통계", required_metrics: [] },
      { heading: "평균 vs 중앙값 — 격차", intent: "avg vs median", required_metrics: [] },
      { heading: "TOP 5 brand", intent: "ftc 매출 정렬", required_metrics: [] },
    ],
    lede_focus: "insight",
    conclusion_pattern: "{industry} {n}개 brand 평균 매출 {avg}만원·창업비용 {cost}만원.",
    ftc_columns_used: ["avg_sales_2024_total", "startup_cost_total", "frcs_cnt_2024_total"],
  },

  market_top_vs_bottom: {
    id: "market_top_vs_bottom",
    category: "market",
    title_template: "{industry} 매출 TOP 10 vs 하위 10 — {n}배 격차",
    topic_keywords: [/top.*bottom|top.*하위|상위.*하위/i],
    active_areas: ["avg_revenue"],
    h2_sections: [
      { heading: "TOP 10 brand 평균 매출", intent: "상위 10 평균", required_metrics: [] },
      { heading: "하위 10 brand 평균 매출", intent: "하위 10 평균", required_metrics: [] },
      { heading: "격차의 의미", intent: "fact, 판단 금지", required_metrics: [] },
    ],
    lede_focus: "insight",
    conclusion_pattern: "{industry} TOP 10 평균 {top}만원 vs 하위 10 {bottom}만원, {ratio}배 격차.",
    ftc_columns_used: ["avg_sales_2024_total"],
  },

  market_new_vs_established: {
    id: "market_new_vs_established",
    category: "market",
    title_template: "{industry} 신규 brand vs 기존 brand — 업력별 차이",
    topic_keywords: [/신규.*brand|신생|기존.*brand|업력별/],
    active_areas: ["avg_revenue", "frcs_status"],
    h2_sections: [
      { heading: "신생(<3년) vs 기존(≥5년) brand 매출 격차", intent: "biz_start_dt 기준 분류", required_metrics: [] },
      { heading: "신생 brand 의 평균 점포수", intent: "신생 frcs 평균", required_metrics: [] },
    ],
    lede_focus: "insight",
    conclusion_pattern: "{industry} 신생 brand 평균 매출 {a}만원 vs 기존 {b}만원.",
    ftc_columns_used: ["biz_start_dt", "avg_sales_2024_total"],
  },

  // ─── default fallback ───────────────────────────────────────
  default_brand_overview: {
    id: "default_brand_overview",
    category: "default",
    title_template: "{brand} 2024 브랜드 분석",
    topic_keywords: [],
    active_areas: ["brand_basic", "avg_revenue", "startup_cost", "frcs_status"],
    h2_sections: [
      { heading: "{brand} 핵심 수치, 한눈에 보면", intent: "core stats", required_metrics: [] },
      { heading: "창업비용, 뭐뭐 들어가는 건가요?", intent: "cost breakdown", required_metrics: [] },
      { heading: "이 본사, 재무 체력은 어느 정도일까요?", intent: "hq finance", required_metrics: [] },
      { heading: "가맹점 현황, 어떻게 변해왔을까요?", intent: "frcs status", required_metrics: [] },
    ],
    lede_focus: "metric",
    conclusion_pattern: "{brand} 핵심 수치 요약 — 가맹점 {n}개·월매출 {rev}만원·창업비용 {cost}만원.",
    ftc_columns_used: [],
  },
};

/**
 * topic → 시나리오 ID. longest match 우선 (specificity).
 * topic 부재 또는 매칭 실패 시 default_brand_overview.
 *
 * 매칭 방식: 모든 시나리오 × 모든 키워드 정규식 시도 → 매칭된 패턴 중
 * 개별 source 길이가 가장 긴 패턴의 시나리오 채택 (specificity 우선).
 * 동률 시 카테고리 우선순위: trust > regional > market > frcs > hq > cost > revenue > compare > ops > default.
 */
const CATEGORY_PRIORITY: Record<ScenarioCategory, number> = {
  trust: 9,
  regional: 8,
  market: 7,
  frcs: 6,
  hq: 5,
  cost: 4,
  revenue: 3,
  compare: 2,
  ops: 1,
  default: 0,
};

export function pickScenario(input: {
  topic?: string | null;
  depth?: "D0" | "D1" | "D2" | "D3";
}): ScenarioId {
  if (!input.topic || !input.topic.trim()) return "default_brand_overview";
  const topic = input.topic;

  type Match = { id: ScenarioId; patternLen: number; categoryRank: number };
  const matches: Match[] = [];

  for (const sc of Object.values(SCENARIOS)) {
    if (sc.id === "default_brand_overview") continue;
    for (const re of sc.topic_keywords) {
      if (re.test(topic)) {
        matches.push({
          id: sc.id,
          patternLen: re.source.length,
          categoryRank: CATEGORY_PRIORITY[sc.category],
        });
        break; // 시나리오 1개당 1번만 카운트
      }
    }
  }

  if (matches.length === 0) return "default_brand_overview";

  matches.sort((a, b) => {
    if (b.patternLen !== a.patternLen) return b.patternLen - a.patternLen;
    return b.categoryRank - a.categoryRank;
  });

  return matches[0].id;
}

/** 시나리오 ID → Scenario. 미정의 시 default. */
export function getScenario(id: ScenarioId): Scenario {
  return SCENARIOS[id] ?? SCENARIOS.default_brand_overview;
}
