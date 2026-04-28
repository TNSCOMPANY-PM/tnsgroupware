/**
 * v2-10 ftc_brands_2024 컬럼 → 한글 라벨 + 단위 + transform 매핑.
 *
 * 정책:
 * 1. skip 컬럼: 식별자 / 코드 / 일자 등 fact 가치 없는 메타.
 * 2. 명시 매핑: 의미 명확한 컬럼은 직접 정의 (label + unit + transform).
 * 3. fallback heuristic: 정의 안 된 컬럼은 inferColumnMeta() 가 패턴 기반 자동 추론.
 *    · `_cnt`, `_count`, `_n` 으로 끝남 → 단위 "개"
 *    · `_pct`, `_rate`, `_ratio` 로 끝남 → 단위 "%"
 *    · `_fee`, `_cost`, `revenue`, `profit`, `asset`, `equity`, `debt`, `income`, `_amt`, `_total`
 *      + `_원` / 천원 의도 → 단위 "만원" + transform v/10 (천원 단위 가정)
 *    · `_date`, `_dt`, `_year`, `_yr` → skip (period 메타)
 *    · `_yn`, `_flag`, `_is_*` → skip (boolean)
 *    · 기타 → 단위 "" + raw value 그대로
 *
 * 152 컬럼 모두 fact 화 보장. fallback 도 자동 ingest.
 */

export type FtcColumnMeta = {
  label: string;
  unit: string;
  transform?: (v: number) => number;
  skip?: boolean;
};

const KW = (v: number) => Math.round(v / 10); // 천원 → 만원

export const FTC_COLUMN_META: Record<string, FtcColumnMeta> = {
  // ─── 식별 / 메타 (skip — fact 아님) ───────────────
  id: { label: "내부 ID", unit: "", skip: true },
  brand_nm: { label: "브랜드명", unit: "", skip: true },
  corp_nm: { label: "본부명", unit: "", skip: true },
  reg_no: { label: "정보공개서 등록번호", unit: "", skip: true },
  induty_lclas: { label: "업종 대분류", unit: "", skip: true },
  induty_mlsfc: { label: "업종 중분류", unit: "", skip: true },
  induty_smlas: { label: "업종 소분류", unit: "", skip: true },
  ftc_first_registered_date: { label: "정보공개서 최초등록일", unit: "", skip: true },
  corp_founded_date: { label: "법인 설립일", unit: "", skip: true },
  biz_start_dt: { label: "가맹사업 개시일", unit: "", skip: true },
  corp_reg_dt: { label: "법인 등록일", unit: "", skip: true },
  homepage_url: { label: "홈페이지 URL", unit: "", skip: true },
  contact_phone: { label: "대표 전화", unit: "", skip: true },
  hq_address: { label: "본사 주소", unit: "", skip: true },
  source_first_registered_at: { label: "최초 등록 시점", unit: "", skip: true },
  created_at: { label: "적재 시각", unit: "", skip: true },
  updated_at: { label: "갱신 시각", unit: "", skip: true },

  // ─── 가맹점 수 (개) ────────────────────────────
  frcs_cnt_2024_total: { label: "전체 가맹점수 (2024)", unit: "개" },
  frcs_cnt_2023_total: { label: "전체 가맹점수 (2023)", unit: "개" },
  frcs_cnt_2022_total: { label: "전체 가맹점수 (2022)", unit: "개" },
  stores_2024_franchise: { label: "가맹점수 (2024)", unit: "개" },
  stores_2023_franchise: { label: "가맹점수 (2023)", unit: "개" },
  stores_2022_franchise: { label: "가맹점수 (2022)", unit: "개" },
  stores_2024_direct: { label: "직영점수 (2024)", unit: "개" },
  stores_2023_direct: { label: "직영점수 (2023)", unit: "개" },
  stores_2022_direct: { label: "직영점수 (2022)", unit: "개" },

  // ─── 가맹점 변동 (건/개) ────────────────────────
  chg_2024_new_open: { label: "신규 개점 (2024)", unit: "개" },
  chg_2024_contract_end: { label: "계약 종료 (2024)", unit: "건" },
  chg_2024_contract_cancel: { label: "계약 해지 (2024)", unit: "건" },
  chg_2024_name_change: { label: "명의 변경 (2024)", unit: "건" },
  chg_2023_new_open: { label: "신규 개점 (2023)", unit: "개" },
  chg_2023_contract_end: { label: "계약 종료 (2023)", unit: "건" },
  chg_2023_contract_cancel: { label: "계약 해지 (2023)", unit: "건" },
  chg_2023_name_change: { label: "명의 변경 (2023)", unit: "건" },
  chg_2022_new_open: { label: "신규 개점 (2022)", unit: "개" },
  chg_2022_contract_end: { label: "계약 종료 (2022)", unit: "건" },
  chg_2022_contract_cancel: { label: "계약 해지 (2022)", unit: "건" },
  chg_2022_name_change: { label: "명의 변경 (2022)", unit: "건" },

  // ─── 매출 (천원/연 → 만원/연) ────────────────────
  // 17 지역 + 전체 = 18 × 1년 = 18 컬럼
  avg_sales_2024_total: { label: "가맹점 평균 연매출 — 전체 (2024)", unit: "만원", transform: KW },
  avg_sales_2024_seoul: { label: "서울 가맹점 평균 연매출 (2024)", unit: "만원", transform: KW },
  avg_sales_2024_busan: { label: "부산 가맹점 평균 연매출 (2024)", unit: "만원", transform: KW },
  avg_sales_2024_daegu: { label: "대구 가맹점 평균 연매출 (2024)", unit: "만원", transform: KW },
  avg_sales_2024_incheon: { label: "인천 가맹점 평균 연매출 (2024)", unit: "만원", transform: KW },
  avg_sales_2024_gwangju: { label: "광주 가맹점 평균 연매출 (2024)", unit: "만원", transform: KW },
  avg_sales_2024_daejeon: { label: "대전 가맹점 평균 연매출 (2024)", unit: "만원", transform: KW },
  avg_sales_2024_ulsan: { label: "울산 가맹점 평균 연매출 (2024)", unit: "만원", transform: KW },
  avg_sales_2024_sejong: { label: "세종 가맹점 평균 연매출 (2024)", unit: "만원", transform: KW },
  avg_sales_2024_gyeonggi: { label: "경기 가맹점 평균 연매출 (2024)", unit: "만원", transform: KW },
  avg_sales_2024_gangwon: { label: "강원 가맹점 평균 연매출 (2024)", unit: "만원", transform: KW },
  avg_sales_2024_chungbuk: { label: "충북 가맹점 평균 연매출 (2024)", unit: "만원", transform: KW },
  avg_sales_2024_chungnam: { label: "충남 가맹점 평균 연매출 (2024)", unit: "만원", transform: KW },
  avg_sales_2024_jeonbuk: { label: "전북 가맹점 평균 연매출 (2024)", unit: "만원", transform: KW },
  avg_sales_2024_jeonnam: { label: "전남 가맹점 평균 연매출 (2024)", unit: "만원", transform: KW },
  avg_sales_2024_gyeongbuk: { label: "경북 가맹점 평균 연매출 (2024)", unit: "만원", transform: KW },
  avg_sales_2024_gyeongnam: { label: "경남 가맹점 평균 연매출 (2024)", unit: "만원", transform: KW },
  avg_sales_2024_jeju: { label: "제주 가맹점 평균 연매출 (2024)", unit: "만원", transform: KW },

  // 단위면적당 매출
  sales_per_area_2024_total: { label: "단위면적당 매출 — 전체 (2024)", unit: "만원", transform: KW },
  sales_per_area_2024_seoul: { label: "서울 단위면적당 매출 (2024)", unit: "만원", transform: KW },
  sales_per_area_2024_busan: { label: "부산 단위면적당 매출 (2024)", unit: "만원", transform: KW },
  sales_per_area_2024_gyeonggi: { label: "경기 단위면적당 매출 (2024)", unit: "만원", transform: KW },

  // ─── 창업비용 (천원 → 만원) ─────────────────────
  startup_cost_total: { label: "창업비용 총액", unit: "만원", transform: KW },
  startup_fee: { label: "가맹비", unit: "만원", transform: KW },
  joining_fee: { label: "가맹비 (alias)", unit: "만원", transform: KW },
  education_fee: { label: "교육비", unit: "만원", transform: KW },
  deposit: { label: "보증금", unit: "만원", transform: KW },
  deposit_fee: { label: "보증금 (alias)", unit: "만원", transform: KW },
  other_fee: { label: "기타비용", unit: "만원", transform: KW },
  interior_cost_total: { label: "인테리어 총액", unit: "만원", transform: KW },
  interior_cost_per_sqm: { label: "평당 인테리어 단가", unit: "만원", transform: KW },
  interior_std_area: { label: "기준 점포 면적", unit: "㎡" },
  store_area_sqm: { label: "기준 점포 면적 (alias)", unit: "㎡" },
  escrow_amount: { label: "예치 가맹금", unit: "만원", transform: KW },

  // ─── 본사 재무 3년 (천원 → 만원) ──────────────────
  fin_2024_revenue: { label: "본사 매출 (2024)", unit: "만원", transform: KW },
  fin_2024_op_profit: { label: "본사 영업이익 (2024)", unit: "만원", transform: KW },
  fin_2024_net_income: { label: "본사 당기순이익 (2024)", unit: "만원", transform: KW },
  fin_2024_total_asset: { label: "본사 자산총계 (2024)", unit: "만원", transform: KW },
  fin_2024_total_equity: { label: "본사 자본총계 (2024)", unit: "만원", transform: KW },
  fin_2024_total_debt: { label: "본사 부채총계 (2024)", unit: "만원", transform: KW },
  fin_2023_revenue: { label: "본사 매출 (2023)", unit: "만원", transform: KW },
  fin_2023_op_profit: { label: "본사 영업이익 (2023)", unit: "만원", transform: KW },
  fin_2023_net_income: { label: "본사 당기순이익 (2023)", unit: "만원", transform: KW },
  fin_2023_total_asset: { label: "본사 자산총계 (2023)", unit: "만원", transform: KW },
  fin_2023_total_equity: { label: "본사 자본총계 (2023)", unit: "만원", transform: KW },
  fin_2023_total_debt: { label: "본사 부채총계 (2023)", unit: "만원", transform: KW },
  fin_2022_revenue: { label: "본사 매출 (2022)", unit: "만원", transform: KW },
  fin_2022_op_profit: { label: "본사 영업이익 (2022)", unit: "만원", transform: KW },
  fin_2022_net_income: { label: "본사 당기순이익 (2022)", unit: "만원", transform: KW },
  fin_2022_total_asset: { label: "본사 자산총계 (2022)", unit: "만원", transform: KW },
  fin_2022_total_equity: { label: "본사 자본총계 (2022)", unit: "만원", transform: KW },
  fin_2022_total_debt: { label: "본사 부채총계 (2022)", unit: "만원", transform: KW },

  // ─── 광고/판촉 (천원 → 만원) ─────────────────────
  ad_cost_2024: { label: "광고비 (2024)", unit: "만원", transform: KW },
  promo_cost_2024: { label: "판촉비 (2024)", unit: "만원", transform: KW },
  ad_total_2024: { label: "광고비 총액 (2024)", unit: "만원", transform: KW },
  ad_tv_2024: { label: "TV 광고비 (2024)", unit: "만원", transform: KW },
  ad_online_2024: { label: "온라인 광고비 (2024)", unit: "만원", transform: KW },
  ad_print_2024: { label: "지면 광고비 (2024)", unit: "만원", transform: KW },
  ad_other_2024: { label: "기타 광고비 (2024)", unit: "만원", transform: KW },

  // ─── 운영·계약 ──────────────────────────────
  contract_initial_years: { label: "최초 계약기간", unit: "년" },
  contract_renewal_years: { label: "갱신 계약기간", unit: "년" },

  // ─── 본사 조직 ──────────────────────────────
  staff_cnt: { label: "본사 임직원수", unit: "명" },
  exec_cnt: { label: "본사 임원수", unit: "명" },
  brand_cnt: { label: "본사 브랜드수", unit: "개" },
  affiliate_cnt: { label: "본사 계열사수", unit: "개" },

  // ─── 컴플라이언스 ───────────────────────────
  violation_correction: { label: "공정위 시정조치 건수", unit: "건" },
  violation_civil: { label: "민사 분쟁 건수", unit: "건" },
  violation_criminal: { label: "형사 분쟁 건수", unit: "건" },
  law_violation_cnt: { label: "법위반 건수 (alias)", unit: "건" },
  dispute_cnt: { label: "분쟁 건수 (alias)", unit: "건" },
  haccp_cert: { label: "HACCP 인증", unit: "" },
  business_year_cnt: { label: "본사 업력", unit: "년" },
};

/**
 * 정의 안 된 컬럼에 대한 heuristic fallback.
 * skip 인지 / unit 무엇인지 / transform 필요한지 자동 추론.
 */
export function inferColumnMeta(col: string): FtcColumnMeta {
  const lower = col.toLowerCase();

  // skip — 식별자/코드/일자/플래그
  if (
    /^(id|uuid|hash|key|code|.*_id|.*_no|.*_dt|.*_date|.*_yr|.*_year)$/.test(lower) ||
    /^(.*_yn|.*_flag|is_.*|has_.*)$/.test(lower) ||
    /^(brand_nm|corp_nm|.*_url|.*_address|.*_phone|.*_email|.*_name)$/.test(lower) ||
    /^(created_at|updated_at|registered_at)$/.test(lower)
  ) {
    return { label: col, unit: "", skip: true };
  }

  // % 비율
  if (/_pct$|_rate$|_ratio$|_percent$/.test(lower)) {
    return { label: col, unit: "%" };
  }

  // 개수
  if (/_cnt$|_count$|_n$|_num$/.test(lower)) {
    return { label: col, unit: "개" };
  }

  // 금액 (만원, 천원 → ÷10 transform)
  if (
    /_fee$|_cost$|_total$|_revenue$|_profit$|_income$|_asset$|_equity$|_debt$|_amt$|_amount$|sales_|fin_/.test(
      lower,
    )
  ) {
    return { label: col, unit: "만원", transform: KW };
  }

  // 면적
  if (/_sqm$|_area$|_pyung$/.test(lower)) {
    return { label: col, unit: "㎡" };
  }

  // 기간
  if (/_years?$|_yr_?cnt|period_year|업력|year_cnt/.test(lower)) {
    return { label: col, unit: "년" };
  }
  if (/_months?$|_mo_?cnt|period_month/.test(lower)) {
    return { label: col, unit: "개월" };
  }

  // 기본 — 단위 없음, raw 값 그대로
  return { label: col, unit: "" };
}

/** 명시 매핑 우선, 없으면 heuristic. skip 컬럼은 false. */
export function isIngestibleColumn(col: string): boolean {
  const meta = FTC_COLUMN_META[col] ?? inferColumnMeta(col);
  return !meta.skip;
}

export function getColumnMeta(col: string): FtcColumnMeta {
  return FTC_COLUMN_META[col] ?? inferColumnMeta(col);
}
