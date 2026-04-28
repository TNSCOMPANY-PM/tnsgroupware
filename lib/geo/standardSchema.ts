/**
 * PR058 — 표준 metric 스키마.
 *
 * docx (정보공개서/브로셔) ↔ ftc_brands_2024 (정규화 컬럼) 양쪽을 동일한 metric ID 로 매핑.
 * docx 양식 차이 robust + cross-check 정확도 향상.
 *
 * single source of truth: STANDARD_METRICS.
 */

export type StandardMetricId =
  // 기본정보
  | "stores_total" | "stores_franchise" | "stores_direct"
  | "corp_founded_year" | "ftc_first_registered" | "industry_main" | "industry_sub"
  // 매출
  | "monthly_avg_sales" | "annual_avg_sales" | "unit_area_sales"
  // 창업비용
  | "franchise_fee" | "education_fee" | "deposit" | "other_cost" | "cost_total"
  | "interior_cost" | "interior_per_pyung" | "ref_store_area"
  | "escrow_amount"
  // 변동
  | "new_opens" | "contract_end" | "contract_terminate" | "name_change"
  | "closure_rate_official"
  // 본사 재무
  | "hq_revenue" | "hq_op_profit" | "hq_op_margin_pct" | "hq_net_income"
  | "hq_total_assets" | "hq_total_debt" | "hq_total_equity" | "hq_debt_ratio_pct"
  | "hq_employees" | "hq_executives"
  // 마케팅·운영
  | "ad_cost" | "promo_cost" | "contract_period_initial" | "contract_period_extend"
  // 인증·법적
  | "law_violations" | "corrective_orders" | "disputes"
  | "violation_civil" | "violation_criminal";

export type MetricCategory =
  | "basic"
  | "revenue"
  | "cost"
  | "growth"
  | "hq_finance"
  | "ops"
  | "compliance";

export type StandardMetric = {
  id: StandardMetricId;
  ko: string;
  description?: string;
  /** ftc_brands_2024 컬럼명 후보 (실제 컬럼명 확인 후 정확한 컬럼만 남길 것). */
  ftc_columns: string[];
  /** docx 셀 텍스트 매칭용 alias (정규식 fragment). */
  docx_aliases: string[];
  unit: "만원" | "천원" | "원" | "%" | "개" | "년" | "개월" | "㎡" | "건" | null;
  category: MetricCategory;
};

export const STANDARD_METRICS: Record<StandardMetricId, StandardMetric> = {
  // ─── basic ──────────────────────────────────
  stores_total: {
    id: "stores_total",
    ko: "전체 가맹점 수",
    description: "직영점 + 가맹점 합계 (공정위 정보공개서 기준)",
    ftc_columns: ["frcs_cnt_2024_total"],
    docx_aliases: ["전체\\s*가맹점", "총\\s*가맹점\\s*수", "가맹점\\s*수\\s*합계", "전체\\s*점포"],
    unit: "개",
    category: "basic",
  },
  stores_franchise: {
    id: "stores_franchise",
    ko: "가맹점 수",
    ftc_columns: ["stores_2024_franchise"],
    docx_aliases: ["가맹점\\s*수$", "프랜차이즈\\s*점포"],
    unit: "개",
    category: "basic",
  },
  stores_direct: {
    id: "stores_direct",
    ko: "직영점 수",
    ftc_columns: ["stores_2024_direct"],
    docx_aliases: ["직영점\\s*수", "직영\\s*점포"],
    unit: "개",
    category: "basic",
  },
  corp_founded_year: {
    id: "corp_founded_year",
    ko: "법인 설립일",
    ftc_columns: ["corp_founded_year", "corp_founded_date"],
    docx_aliases: ["법인\\s*설립", "회사\\s*설립", "설립\\s*일"],
    unit: "년",
    category: "basic",
  },
  ftc_first_registered: {
    id: "ftc_first_registered",
    ko: "정보공개서 최초등록",
    ftc_columns: ["ftc_first_registered_date", "first_registered_date"],
    docx_aliases: ["정보공개서\\s*최초", "최초\\s*등록"],
    unit: null,
    category: "basic",
  },
  industry_main: {
    id: "industry_main",
    ko: "업종 대분류",
    ftc_columns: ["induty_lclas", "industry_main"],
    docx_aliases: ["업종\\s*대분류", "대분류"],
    unit: null,
    category: "basic",
  },
  industry_sub: {
    id: "industry_sub",
    ko: "업종 중분류",
    ftc_columns: ["induty_mlsfc", "industry_sub"],
    docx_aliases: ["업종\\s*중분류", "중분류", "세부\\s*업종"],
    unit: null,
    category: "basic",
  },

  // ─── revenue ────────────────────────────────
  monthly_avg_sales: {
    id: "monthly_avg_sales",
    ko: "월평균매출",
    description: "가맹점당 월 평균 매출액 (avg_sales_2024_total ÷ 12 환산, ftcRowToMetrics 특수처리)",
    ftc_columns: [], // ftcRowToMetrics 특수처리 (annual_avg_sales / 12)
    docx_aliases: ["월평균매출", "월\\s*평균\\s*매출", "월매출", "월\\s*수익", "가맹점\\s*월\\s*평균\\s*매출"],
    unit: "만원",
    category: "revenue",
  },
  annual_avg_sales: {
    id: "annual_avg_sales",
    ko: "연평균매출",
    description: "가맹점당 연평균매출 (천원 → 만원 환산)",
    ftc_columns: ["avg_sales_2024_total"],
    docx_aliases: ["연평균매출", "연\\s*평균\\s*매출", "연매출", "연간\\s*매출"],
    unit: "만원",
    category: "revenue",
  },
  unit_area_sales: {
    id: "unit_area_sales",
    ko: "단위면적당 매출",
    ftc_columns: ["sales_per_area_2024_total"],
    docx_aliases: ["단위\\s*면적", "평당\\s*매출", "㎡당\\s*매출"],
    unit: "만원",
    category: "revenue",
  },

  // ─── cost ───────────────────────────────────
  franchise_fee: {
    id: "franchise_fee",
    ko: "가맹비",
    description: "가맹사업 가입 시 본사에 일회성 지급",
    ftc_columns: ["startup_fee"],
    docx_aliases: ["가맹비", "가입비", "가맹\\s*가입비", "가입\\s*비용", "가맹금"],
    unit: "만원",
    category: "cost",
  },
  education_fee: {
    id: "education_fee",
    ko: "교육비",
    ftc_columns: ["education_fee"],
    docx_aliases: ["교육비", "교육\\s*비용", "초기\\s*교육"],
    unit: "만원",
    category: "cost",
  },
  deposit: {
    id: "deposit",
    ko: "보증금",
    ftc_columns: ["deposit_fee"],
    docx_aliases: ["보증금", "계약\\s*이행\\s*보증"],
    unit: "만원",
    category: "cost",
  },
  escrow_amount: {
    id: "escrow_amount",
    ko: "예치 가맹금",
    description: "예치제도 등록 시 보관되는 가맹금",
    ftc_columns: ["escrow_amount"],
    docx_aliases: ["예치\\s*가맹금", "예치금"],
    unit: "만원",
    category: "cost",
  },
  other_cost: {
    id: "other_cost",
    ko: "기타비용",
    ftc_columns: ["other_fee"],
    docx_aliases: ["기타\\s*비용", "기타\\s*부담금"],
    unit: "만원",
    category: "cost",
  },
  cost_total: {
    id: "cost_total",
    ko: "창업비용 총액",
    description: "가맹비 + 교육비 + 보증금 + 인테리어 + 기타 합계",
    ftc_columns: ["startup_cost_total"],
    docx_aliases: ["창업비용\\s*총액", "창업비용\\s*합계", "투자금\\s*총액", "총\\s*창업비용", "총\\s*투자"],
    unit: "만원",
    category: "cost",
  },
  interior_cost: {
    id: "interior_cost",
    ko: "인테리어 비용",
    ftc_columns: ["interior_cost_total"],
    docx_aliases: ["인테리어\\s*비용", "인테리어\\s*총액", "인테리어\\s*공사"],
    unit: "만원",
    category: "cost",
  },
  interior_per_pyung: {
    id: "interior_per_pyung",
    ko: "평당 인테리어비",
    ftc_columns: ["interior_cost_per_sqm"],
    docx_aliases: ["평당\\s*인테리어", "㎡당\\s*인테리어", "단위면적당\\s*인테리어"],
    unit: "만원",
    category: "cost",
  },
  ref_store_area: {
    id: "ref_store_area",
    ko: "기준 점포 면적",
    ftc_columns: ["interior_std_area"],
    docx_aliases: ["기준\\s*면적", "기준\\s*점포\\s*면적", "표준\\s*면적", "기준\\s*평수"],
    unit: "㎡",
    category: "cost",
  },

  // ─── growth ─────────────────────────────────
  new_opens: {
    id: "new_opens",
    ko: "신규개점",
    ftc_columns: ["chg_2024_new_open"],
    docx_aliases: ["신규\\s*개점", "신규\\s*등록", "신규\\s*가맹"],
    unit: "개",
    category: "growth",
  },
  contract_end: {
    id: "contract_end",
    ko: "계약종료",
    ftc_columns: ["chg_2024_contract_end"],
    docx_aliases: ["계약\\s*종료"],
    unit: "개",
    category: "growth",
  },
  contract_terminate: {
    id: "contract_terminate",
    ko: "계약해지",
    ftc_columns: ["chg_2024_contract_cancel"],
    docx_aliases: ["계약\\s*해지"],
    unit: "개",
    category: "growth",
  },
  name_change: {
    id: "name_change",
    ko: "명의변경",
    description: "PR050 — 폐점 아님. 점주만 교체된 것.",
    ftc_columns: ["chg_2024_name_change"],
    docx_aliases: ["명의\\s*변경"],
    unit: "개",
    category: "growth",
  },
  closure_rate_official: {
    id: "closure_rate_official",
    ko: "공시 폐점률",
    ftc_columns: [], // ftc 직접 컬럼 없음, derived 가능 (chg_end+cancel) / total
    docx_aliases: ["공시\\s*폐점률", "폐점률(?!.*실질)", "정보공개서\\s*폐점률"],
    unit: "%",
    category: "growth",
  },

  // ─── hq_finance ─────────────────────────────
  hq_revenue: {
    id: "hq_revenue",
    ko: "본사 매출",
    description: "ftc fin_2024_revenue 천원 → 만원 환산",
    ftc_columns: ["fin_2024_revenue"],
    docx_aliases: ["본사\\s*매출", "본사\\s*총\\s*매출", "회사\\s*매출"],
    unit: "만원",
    category: "hq_finance",
  },
  hq_op_profit: {
    id: "hq_op_profit",
    ko: "본사 영업이익",
    ftc_columns: ["fin_2024_op_profit"],
    docx_aliases: ["본사\\s*영업이익", "영업\\s*이익(?!.*률)"],
    unit: "만원",
    category: "hq_finance",
  },
  hq_op_margin_pct: {
    id: "hq_op_margin_pct",
    ko: "본사 영업이익률",
    description: "본사 매출 대비 영업이익 비율 — ftc 컬럼 없음, op_profit/revenue×100 계산",
    ftc_columns: [], // ftcRowToMetrics 특수처리
    docx_aliases: ["영업이익률", "영업\\s*이익률", "OP\\s*margin"],
    unit: "%",
    category: "hq_finance",
  },
  hq_net_income: {
    id: "hq_net_income",
    ko: "본사 당기순이익",
    ftc_columns: ["fin_2024_net_income"],
    docx_aliases: ["당기순이익", "본사\\s*순이익"],
    unit: "만원",
    category: "hq_finance",
  },
  hq_total_assets: {
    id: "hq_total_assets",
    ko: "본사 자산총계",
    ftc_columns: ["fin_2024_total_asset"],
    docx_aliases: ["자산\\s*총계", "본사\\s*자산"],
    unit: "만원",
    category: "hq_finance",
  },
  hq_total_debt: {
    id: "hq_total_debt",
    ko: "본사 부채총계",
    ftc_columns: ["fin_2024_total_debt"],
    docx_aliases: ["부채\\s*총계", "본사\\s*부채"],
    unit: "만원",
    category: "hq_finance",
  },
  hq_total_equity: {
    id: "hq_total_equity",
    ko: "본사 자본총계",
    ftc_columns: ["fin_2024_total_equity"],
    docx_aliases: ["자본\\s*총계", "본사\\s*자본"],
    unit: "만원",
    category: "hq_finance",
  },
  hq_debt_ratio_pct: {
    id: "hq_debt_ratio_pct",
    ko: "본사 부채비율",
    description: "본사 부채/자본 비율 — ftc 컬럼 없음, total_debt/total_equity×100 계산",
    ftc_columns: [], // ftcRowToMetrics 특수처리
    docx_aliases: ["부채비율", "부채\\s*비율"],
    unit: "%",
    category: "hq_finance",
  },
  hq_employees: {
    id: "hq_employees",
    ko: "본사 임직원수",
    ftc_columns: ["staff_cnt"],
    docx_aliases: ["임직원\\s*수", "본사\\s*직원\\s*수"],
    unit: "개",
    category: "hq_finance",
  },
  hq_executives: {
    id: "hq_executives",
    ko: "본사 임원수",
    ftc_columns: ["exec_cnt"],
    docx_aliases: ["임원\\s*수", "본사\\s*임원"],
    unit: "개",
    category: "hq_finance",
  },

  // ─── ops ────────────────────────────────────
  ad_cost: {
    id: "ad_cost",
    ko: "광고비",
    ftc_columns: ["ad_cost_2024"],
    docx_aliases: ["광고비", "광고\\s*비용"],
    unit: "만원",
    category: "ops",
  },
  promo_cost: {
    id: "promo_cost",
    ko: "판촉비",
    ftc_columns: ["promo_cost_2024"],
    docx_aliases: ["판촉비", "판촉\\s*비용"],
    unit: "만원",
    category: "ops",
  },
  contract_period_initial: {
    id: "contract_period_initial",
    ko: "최초 계약기간",
    ftc_columns: ["contract_initial_years"],
    docx_aliases: ["최초\\s*계약기간", "초기\\s*계약기간"],
    unit: "년",
    category: "ops",
  },
  contract_period_extend: {
    id: "contract_period_extend",
    ko: "갱신 계약기간",
    ftc_columns: ["contract_renewal_years"],
    docx_aliases: ["갱신\\s*계약기간", "연장\\s*계약기간"],
    unit: "년",
    category: "ops",
  },

  // ─── compliance ─────────────────────────────
  law_violations: {
    id: "law_violations",
    ko: "법위반 건수",
    description: "민사 + 형사 분쟁 합계 — ftcRowToMetrics 특수처리",
    ftc_columns: [], // ftcRowToMetrics 특수처리: violation_civil + violation_criminal
    docx_aliases: ["법위반", "법\\s*위반\\s*건수"],
    unit: "건",
    category: "compliance",
  },
  corrective_orders: {
    id: "corrective_orders",
    ko: "시정조치 건수",
    ftc_columns: ["violation_correction"],
    docx_aliases: ["시정조치", "시정\\s*명령"],
    unit: "건",
    category: "compliance",
  },
  disputes: {
    id: "disputes",
    ko: "분쟁 건수",
    description: "민사 분쟁 (좁은 의미) — 형사는 violation_criminal 별도",
    ftc_columns: ["violation_civil"],
    docx_aliases: ["분쟁\\s*건수", "분쟁(?!.*형사)"],
    unit: "건",
    category: "compliance",
  },
  violation_civil: {
    id: "violation_civil",
    ko: "민사 분쟁",
    ftc_columns: ["violation_civil"],
    docx_aliases: ["민사\\s*분쟁", "민사\\s*소송"],
    unit: "건",
    category: "compliance",
  },
  violation_criminal: {
    id: "violation_criminal",
    ko: "형사 분쟁",
    ftc_columns: ["violation_criminal"],
    docx_aliases: ["형사\\s*분쟁", "형사\\s*소송", "형사\\s*고발"],
    unit: "건",
    category: "compliance",
  },
};

/**
 * PR059 — ftc_brands_2024 컬럼 중 천원 단위로 적재된 컬럼 화이트리스트.
 * ftcRowToMetrics 가 자동으로 만원 단위로 환산.
 *
 * 17 지역별 매출/면적당 매출 컬럼은 generated (REGIONS) 으로 추가.
 */
const REGION_KEYS = [
  "total", "seoul", "busan", "daegu", "incheon", "gwangju", "daejeon",
  "ulsan", "sejong", "gyeonggi", "gangwon", "chungbuk", "chungnam",
  "jeonbuk", "jeonnam", "gyeongbuk", "gyeongnam", "jeju",
] as const;

export const THOUSANDWON_FIELDS: ReadonlySet<string> = new Set<string>([
  // 재무 (3년 × 6항목)
  ...["2024", "2023", "2022"].flatMap((y) => [
    `fin_${y}_revenue`,
    `fin_${y}_op_profit`,
    `fin_${y}_net_income`,
    `fin_${y}_total_asset`,
    `fin_${y}_total_equity`,
    `fin_${y}_total_debt`,
  ]),
  // 매출 — 전체 + 17 지역
  ...REGION_KEYS.map((r) => `avg_sales_2024_${r}`),
  // 단위면적당 매출 — 전체 + 17 지역
  ...REGION_KEYS.map((r) => `sales_per_area_2024_${r}`),
  // 광고·판촉
  "ad_cost_2024", "promo_cost_2024",
  // 창업비용
  "startup_fee", "education_fee", "deposit_fee", "other_fee",
  "startup_cost_total", "interior_cost_total", "interior_cost_per_sqm",
  "escrow_amount",
]);

/** 천원 → 만원 변환. 0/null/NaN 은 null 반환. */
export function toManwon(value: unknown): number | null {
  if (value == null) return null;
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n) || n === 0) return null;
  return Math.round(n / 10);
}

export type AssignConfidence = "high" | "medium" | "low";

/**
 * docx 셀 텍스트 → 표준 metric ID.
 * 휴리스틱: alias 정규식 anchored 매칭 시 high, contains 매칭 시 medium, 실패 시 null.
 * contextHint 는 추후 LLM fallback 에서 사용 (현재는 placeholder).
 */
export function assignMetric(
  cellText: string,
  contextHint?: string,
): { metric_id: StandardMetricId; confidence: AssignConfidence } | null {
  const normalized = (cellText ?? "").trim();
  if (normalized.length === 0) return null;
  void contextHint;

  // 1차 — anchored exact (high)
  for (const m of Object.values(STANDARD_METRICS)) {
    for (const alias of m.docx_aliases) {
      const re = new RegExp(`^${alias}$`, "i");
      if (re.test(normalized)) return { metric_id: m.id, confidence: "high" };
    }
  }
  // 2차 — contains (medium). 가장 긴 alias 가 우선 (specificity).
  type Hit = { id: StandardMetricId; len: number };
  const hits: Hit[] = [];
  for (const m of Object.values(STANDARD_METRICS)) {
    for (const alias of m.docx_aliases) {
      const re = new RegExp(alias, "i");
      if (re.test(normalized)) {
        hits.push({ id: m.id, len: alias.length });
        break;
      }
    }
  }
  if (hits.length > 0) {
    hits.sort((a, b) => b.len - a.len);
    return { metric_id: hits[0].id, confidence: "medium" };
  }
  return null;
}

/** ftc 컬럼명 → 표준 metric ID. ftc_columns 배열에서 정확 매칭. */
export function assignFtcMetric(ftcColumnName: string): StandardMetricId | null {
  for (const m of Object.values(STANDARD_METRICS)) {
    if (m.ftc_columns.includes(ftcColumnName)) return m.id;
  }
  return null;
}

/** 표준 metric ID → 한국어 라벨. */
export function metricLabel(id: StandardMetricId): string {
  return STANDARD_METRICS[id].ko;
}

/** 표준 metric ID → unit. */
export function metricUnit(id: StandardMetricId): StandardMetric["unit"] {
  return STANDARD_METRICS[id].unit;
}

/**
 * ftc_brands_2024 raw row → metric_id 키로 정규화.
 * PR059:
 *   - THOUSANDWON_FIELDS 컬럼은 천원 → 만원 자동 환산 (×0.1, 반올림).
 *   - 특수 derived metric (monthly_avg_sales / hq_op_margin_pct / hq_debt_ratio_pct / law_violations) 자동 계산.
 *   - 후보 컬럼 중 첫 non-null/non-zero 값 채택. 0 은 의미 없는 값으로 간주.
 */
export function ftcRowToMetrics(
  row: Record<string, unknown>,
): Partial<Record<StandardMetricId, number | string>> {
  const out: Partial<Record<StandardMetricId, number | string>> = {};
  for (const m of Object.values(STANDARD_METRICS)) {
    if (m.ftc_columns.length === 0) continue; // 특수처리 metric
    for (const col of m.ftc_columns) {
      if (!(col in row)) continue;
      const raw = row[col];
      if (raw == null || raw === "") continue;
      if (THOUSANDWON_FIELDS.has(col)) {
        const v = toManwon(raw);
        if (v != null) {
          out[m.id] = v;
          break;
        }
      } else {
        // 숫자 가능하면 숫자, 아니면 문자열 보존 (industry_main / industry_sub 등).
        const n = typeof raw === "number" ? raw : Number(raw);
        if (Number.isFinite(n) && n !== 0) {
          out[m.id] = n;
          break;
        }
        if (typeof raw === "string" && raw.trim()) {
          out[m.id] = raw.trim();
          break;
        }
      }
    }
  }

  // 특수처리 1: monthly_avg_sales = annual_avg_sales / 12
  const annual = out.annual_avg_sales;
  if (typeof annual === "number" && annual > 0) {
    out.monthly_avg_sales = Math.round(annual / 12);
  }

  // 특수처리 2: hq_op_margin_pct = hq_op_profit / hq_revenue × 100 (소수점 1자리)
  const rev = out.hq_revenue;
  const op = out.hq_op_profit;
  if (typeof rev === "number" && rev > 0 && typeof op === "number") {
    out.hq_op_margin_pct = Math.round((op / rev) * 1000) / 10;
  }

  // 특수처리 3: hq_debt_ratio_pct = hq_total_debt / hq_total_equity × 100
  const debt = out.hq_total_debt;
  const equity = out.hq_total_equity;
  if (typeof equity === "number" && equity > 0 && typeof debt === "number") {
    out.hq_debt_ratio_pct = Math.round((debt / equity) * 1000) / 10;
  }

  // 특수처리 4: law_violations = violation_civil + violation_criminal (둘 중 하나만 있어도 OK)
  const civil = out.violation_civil;
  const criminal = out.violation_criminal;
  const civilN = typeof civil === "number" ? civil : 0;
  const criminalN = typeof criminal === "number" ? criminal : 0;
  if (typeof civil === "number" || typeof criminal === "number") {
    out.law_violations = civilN + criminalN;
  }

  return out;
}
