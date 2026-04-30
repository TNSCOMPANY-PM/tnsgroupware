/**
 * v4-01 — ftc_brands_2024 152 컬럼 카탈로그.
 * Step 0 (Column Selector haiku) sysprompt 에 주입.
 *
 * v2 의 FTC_COLUMN_META 활용 (skip 컬럼은 메타로만 표기).
 * 카테고리 그룹화 → haiku 가 토픽 매칭 시 의미 있는 컬럼만 선별.
 */

import { FTC_COLUMN_META } from "../v2/ftc_column_labels";

/** 항상 포함되어야 하는 메타 컬럼 (Step 0 가 빠뜨려도 강제 포함). */
export const ALWAYS_INCLUDE_COLUMNS = [
  "id",
  "brand_nm",
  "corp_nm",
  "induty_lclas",
  "induty_mlsfc",
  "biz_start_dt",
] as const;

/** 카테고리별 컬럼 그룹 — 토픽 매칭에 도움. */
const CATEGORY_GROUPS: Array<{ name: string; pattern: RegExp; description: string }> = [
  {
    name: "[메타]",
    pattern: /^(id|brand_nm|corp_nm|induty_|biz_start_dt|reg_no)$/,
    description: "브랜드 식별 / 업종 / 가맹사업 개시일",
  },
  {
    name: "[가맹점 수 / 변동]",
    pattern: /^(frcs_cnt|stores_|chg_)/,
    description: "전체·직영·연도별 가맹점수, 신규개점/계약해지/명의변경",
  },
  {
    name: "[가맹점 매출]",
    pattern: /^(avg_sales|sales_per_area|monthly_avg|annual_revenue|max_monthly|monthly_revenue|annual_)/,
    description: "지역별·연도별 평균매출, 단위면적당 매출",
  },
  {
    name: "[창업비용]",
    pattern: /^(startup|joining_fee|education_fee|deposit|other_fee|interior|cost_|escrow_|store_area)/,
    description: "총액·가맹비·교육비·보증금·인테리어",
  },
  {
    name: "[본사 재무]",
    pattern: /^(fin_|hq_)/,
    description: "본사 매출·영업이익·당기순이익·자산·부채·자본 (3년)",
  },
  {
    name: "[광고/판촉]",
    pattern: /^(ad_|promo_)/,
    description: "광고비·판촉비",
  },
  {
    name: "[계약]",
    pattern: /^(contract_|announced_payback)/,
    description: "최초/갱신 계약기간, 본사 발표 투자회수",
  },
  {
    name: "[본사 조직]",
    pattern: /^(staff_cnt|exec_cnt|brand_cnt|affiliate_cnt)/,
    description: "임직원수·임원수·브랜드수·계열사수",
  },
  {
    name: "[컴플라이언스]",
    pattern: /^(violation|law_violation|dispute|haccp|business_year)/,
    description: "법위반·분쟁·HACCP·본사 업력",
  },
];

/**
 * Step 0 sysprompt 용 카탈로그 텍스트.
 *  · 카테고리별 그룹화
 *  · 각 컬럼: "{col_name} (단위) — 한글 라벨"
 *  · skip 컬럼 제외 (id/brand_nm 같은 메타는 항상 포함 안내)
 */
export function buildFtcColumnCatalog(): string {
  const cols = Object.entries(FTC_COLUMN_META);
  const grouped = CATEGORY_GROUPS.map((g) => {
    const matched = cols
      .filter(([col]) => g.pattern.test(col))
      .filter(([col, meta]) => !meta.skip || ALWAYS_INCLUDE_COLUMNS.includes(col as never))
      .map(([col, meta]) => {
        const unit = meta.unit ? ` (${meta.unit})` : "";
        return `  - ${col}${unit} — ${meta.label}`;
      });
    if (matched.length === 0) return "";
    return `${g.name} ${g.description}\n${matched.join("\n")}`;
  }).filter((s) => s.length > 0);

  return [
    `ftc_brands_2024 컬럼 카탈로그 (총 ${cols.length}개 정의):`,
    "",
    ...grouped,
    "",
    `[항상 포함] ${ALWAYS_INCLUDE_COLUMNS.join(", ")}`,
  ].join("\n");
}

/** 카탈로그에 정의된 컬럼명 set — Step 0 output 검증 용. */
export function getKnownColumns(): Set<string> {
  return new Set(Object.keys(FTC_COLUMN_META));
}
