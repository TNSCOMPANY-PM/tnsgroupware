/**
 * PR056 — frandoor ftc_brands_2024 connector.
 *
 * 별도 supabase 프로젝트(felaezeqnoskkowoqsja) 의 ftc_brands_2024 테이블 (9,552 brand × 150 컬럼).
 * env 미설정 시 silent skip (호출자가 isFtc2024Configured 로 사전 점검 권장).
 */

import "server-only";
import { isFrandoorConfigured, createFrandoorClient } from "@/utils/supabase/frandoor";
import { ftcRowToMetrics, toManwon, type StandardMetricId } from "@/lib/geo/standardSchema";

/**
 * PR060 — createFrandoorClient 실패 시 명확한 메시지 출력 후 null 반환.
 * URL invalid / env 누락 등 모든 케이스 1줄로 진단 가능.
 */
function safeCreateClient(callerLabel: string): ReturnType<typeof createFrandoorClient> | null {
  try {
    return createFrandoorClient();
  } catch (e) {
    console.warn(
      `[ftc2024] ${callerLabel} client 생성 실패: ${e instanceof Error ? e.message : e}`,
    );
    return null;
  }
}

export type FtcBrand2024 = Record<string, unknown>;

/** PR058 — ftc_brands_2024 raw row 을 표준 metric ID 키로 정규화한 형태. */
export type StandardFtcBrand = {
  brand_nm: string | null;
  reg_no: string | null;
  industry_sub: string | null;
  metrics: Partial<Record<StandardMetricId, unknown>>;
  /** 디버깅용 — raw row 보존. */
  raw: FtcBrand2024;
};

export type IndustryStats = {
  industry: string;
  n: number;
  avg_stores: number | null;
  median_stores: number | null;
  avg_monthly_revenue: number | null;
  median_monthly_revenue: number | null;
  avg_cost_total: number | null;
  median_cost_total: number | null;
  avg_op_margin_pct: number | null;
  source_year: "2024";
};

export type IndustryPercentile = {
  metric: string;
  brand_value: number;
  industry_avg: number;
  industry_median: number;
  brand_rank: number;
  industry_n: number;
  /** 0~100. 높을수록 상위 (75 = 상위 25%). */
  percentile: number;
};

export type RegionalAvg = {
  industry: string;
  region: string;
  n: number;
  avg_monthly_revenue: number | null;
  avg_unit_area_revenue: number | null;
  source_year: "2024";
};

export type HqFinanceAvg = {
  industry: string;
  n: number;
  avg_op_margin_pct: number | null;
  avg_debt_ratio_pct: number | null;
  avg_revenue_eok: number | null;
  source_year: "2024";
};

export function isFtc2024Configured(): boolean {
  return isFrandoorConfigured();
}

function pickFiniteNum(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string") {
    const cleaned = v.replace(/[,\s]/g, "");
    const n = Number(cleaned);
    if (Number.isFinite(n)) return n;
  }
  return null;
}

function avg(arr: number[]): number | null {
  if (arr.length === 0) return null;
  return Math.round((arr.reduce((s, x) => s + x, 0) / arr.length) * 10) / 10;
}

function median(arr: number[]): number | null {
  if (arr.length === 0) return null;
  const sorted = [...arr].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? Math.round(((sorted[mid - 1] + sorted[mid]) / 2) * 10) / 10
    : sorted[mid];
}

/** PR059 — _dump-ftc-diagnose.ts 실측 컬럼명 정정. */
const COL_STORES_TOTAL = "frcs_cnt_2024_total";
const COL_ANNUAL_SALES = "avg_sales_2024_total";       // 천원, ÷12 환산 후 만원
const COL_COST_TOTAL = "startup_cost_total";           // 천원
const COL_FIN_REV = "fin_2024_revenue";                // 천원
const COL_FIN_OP = "fin_2024_op_profit";               // 천원
const COL_FIN_DEBT = "fin_2024_total_debt";            // 천원
const COL_FIN_EQUITY = "fin_2024_total_equity";        // 천원

/** PR057 — 17개 지역 + "전체". region 한글 → ftc 컬럼 영문 suffix. */
const REGIONS = [
  "전체", "서울", "부산", "대구", "인천", "광주", "대전", "울산", "세종",
  "경기", "강원", "충북", "충남", "전북", "전남", "경북", "경남", "제주",
] as const;
type Region = typeof REGIONS[number];

const REGION_SUFFIX: Record<Region, string> = {
  전체: "total", 서울: "seoul", 부산: "busan", 대구: "daegu", 인천: "incheon",
  광주: "gwangju", 대전: "daejeon", 울산: "ulsan", 세종: "sejong", 경기: "gyeonggi",
  강원: "gangwon", 충북: "chungbuk", 충남: "chungnam", 전북: "jeonbuk", 전남: "jeonnam",
  경북: "gyeongbuk", 경남: "gyeongnam", 제주: "jeju",
};

export async function fetchFtcBrand(input: {
  brand_nm?: string;
  reg_no?: string;
  corp_nm?: string;
}): Promise<FtcBrand2024 | null> {
  if (!isFrandoorConfigured()) return null;
  const sb = safeCreateClient("fetchFtcBrand");
  if (!sb) return null;
  try {

    // 1차: exact match
    let q = sb.from("ftc_brands_2024").select("*").limit(1);
    if (input.reg_no) q = q.eq("reg_no", input.reg_no);
    else if (input.brand_nm) q = q.eq("brand_nm", input.brand_nm);
    else if (input.corp_nm) q = q.eq("corp_nm", input.corp_nm);
    else return null;
    const { data, error } = await q.maybeSingle();
    if (error) {
      console.warn("[ftc2024] fetchFtcBrand exact error:", error.message);
    }
    if (data) return data;

    // 2차: fuzzy ilike (brand_nm 만 — 공백/대소문자 차이 허용)
    if (input.brand_nm) {
      const normalized = input.brand_nm.replace(/\s+/g, "").trim();
      if (normalized.length >= 2) {
        const { data: fuzzyRows, error: fuzzyErr } = await sb
          .from("ftc_brands_2024")
          .select("*")
          .ilike("brand_nm", `%${normalized}%`)
          .limit(5);
        if (fuzzyErr) {
          console.warn("[ftc2024] fetchFtcBrand fuzzy error:", fuzzyErr.message);
        }
        if (fuzzyRows && fuzzyRows.length === 1) return fuzzyRows[0];
        if (fuzzyRows && fuzzyRows.length > 1) {
          // 다중 매칭: corp_nm 또는 reg_no 교차 검증
          if (input.corp_nm) {
            const cross = fuzzyRows.find((r) => (r as Record<string, unknown>).corp_nm === input.corp_nm);
            if (cross) return cross;
          }
          if (input.reg_no) {
            const cross = fuzzyRows.find((r) => (r as Record<string, unknown>).reg_no === input.reg_no);
            if (cross) return cross;
          }
          // 교차 검증 실패 — 공백제거 brand_nm 정확히 일치하는 것 우선
          const exactNorm = fuzzyRows.find((r) => {
            const v = (r as Record<string, unknown>).brand_nm;
            return typeof v === "string" && v.replace(/\s+/g, "") === normalized;
          });
          if (exactNorm) return exactNorm;
          console.warn(`[ftc2024] fetchFtcBrand fuzzy 다중 매칭 ${fuzzyRows.length}건 — 단일 식별 실패`);
        }
      }
    }
    return null;
  } catch (e) {
    console.warn("[ftc2024] fetchFtcBrand 실패:", e instanceof Error ? e.message : e);
    return null;
  }
}

/**
 * PR058 — fetchFtcBrand 결과를 표준 metric ID 키로 정규화.
 * D3 UnifiedFact 빌더가 docx 결과와 단일 metric_id 키로 비교 가능.
 */
export async function fetchFtcBrandStandardized(input: {
  brand_nm?: string;
  reg_no?: string;
  corp_nm?: string;
}): Promise<StandardFtcBrand | null> {
  const raw = await fetchFtcBrand(input);
  if (!raw) return null;
  const row = raw as Record<string, unknown>;
  return {
    brand_nm: typeof row.brand_nm === "string" ? row.brand_nm : null,
    reg_no: typeof row.reg_no === "string" ? row.reg_no : null,
    industry_sub: typeof row.induty_mlsfc === "string" ? row.induty_mlsfc : null,
    metrics: ftcRowToMetrics(row),
    raw,
  };
}

/** trimmed mean (상하 trimPct 제외 평균). 표본 부족 시 단순 평균. */
function trimmedMean(values: number[], trimPct = 0.05): number | null {
  if (values.length === 0) return null;
  if (values.length < 10) {
    return values.reduce((s, v) => s + v, 0) / values.length;
  }
  const sorted = [...values].sort((a, b) => a - b);
  const trim = Math.floor(sorted.length * trimPct);
  const trimmed = sorted.slice(trim, sorted.length - trim);
  if (trimmed.length === 0) return null;
  return trimmed.reduce((s, v) => s + v, 0) / trimmed.length;
}

export async function fetchFtcIndustryStats(industryKor: string): Promise<IndustryStats | null> {
  if (!isFrandoorConfigured() || !industryKor) return null;
  const sb = safeCreateClient("fetchFtcIndustryStats");
  if (!sb) return null;
  try {
    const { data, error } = await sb
      .from("ftc_brands_2024")
      .select(
        `${COL_STORES_TOTAL}, ${COL_ANNUAL_SALES}, ${COL_COST_TOTAL}, ${COL_FIN_REV}, ${COL_FIN_OP}`,
      )
      .eq("induty_mlsfc", industryKor);
    if (error || !data || data.length === 0) {
      if (error) console.warn("[ftc2024] industry stats:", error.message);
      return null;
    }

    const stores: number[] = [];
    const monthlyRev: number[] = []; // 만원
    const cost: number[] = []; // 만원
    const opMargins: number[] = [];

    for (const r of data) {
      const row = r as Record<string, unknown>;
      const s = pickFiniteNum(row[COL_STORES_TOTAL]);
      if (s != null && s > 0) stores.push(s);
      const annualKw = pickFiniteNum(row[COL_ANNUAL_SALES]);
      if (annualKw != null && annualKw > 0) {
        // 천원 → 만원 → 월 환산
        const monthlyMan = Math.round(annualKw / 10 / 12);
        if (monthlyMan > 0) monthlyRev.push(monthlyMan);
      }
      const costMan = toManwon(row[COL_COST_TOTAL]);
      if (costMan != null && costMan > 0) cost.push(costMan);
      const rev = pickFiniteNum(row[COL_FIN_REV]);
      const op = pickFiniteNum(row[COL_FIN_OP]);
      if (rev != null && rev > 0 && op != null) {
        opMargins.push((op / rev) * 100);
      }
    }

    return {
      industry: industryKor,
      n: data.length,
      avg_stores: avg(stores),
      median_stores: median(stores),
      avg_monthly_revenue: avg(monthlyRev),
      median_monthly_revenue: median(monthlyRev),
      avg_cost_total: avg(cost),
      median_cost_total: median(cost),
      avg_op_margin_pct: opMargins.length > 0
        ? Math.round((trimmedMean(opMargins) ?? 0) * 10) / 10
        : null,
      source_year: "2024",
    };
  } catch (e) {
    console.warn("[ftc2024] industry stats 실패:", e instanceof Error ? e.message : e);
    return null;
  }
}

export async function computePercentile(input: {
  brand_value: number;
  industry: string;
  metric_columns?: string[];
}): Promise<IndustryPercentile | null> {
  if (!isFrandoorConfigured()) return null;
  const sb = safeCreateClient("computePercentile");
  if (!sb) return null;
  try {
    const { data, error } = await sb
      .from("ftc_brands_2024")
      .select(`${COL_ANNUAL_SALES}`)
      .eq("induty_mlsfc", input.industry);
    if (error || !data || data.length === 0) return null;
    // PR059 — 천원 연 → 만원 월 환산. brand_value 도 만원 월 단위로 받아야 함.
    const monthlyValues = data
      .map((r) => {
        const v = pickFiniteNum((r as Record<string, unknown>)[COL_ANNUAL_SALES]);
        if (v == null || v <= 0) return null;
        return Math.round(v / 10 / 12);
      })
      .filter((x): x is number => x !== null && x > 0);
    if (monthlyValues.length === 0) return null;

    const desc = [...monthlyValues].sort((a, b) => b - a);
    const higher = desc.filter((v) => v > input.brand_value).length;
    const rank = higher + 1;
    // PR062 — "상위 N%" 의미. rank/total × 100 (작을수록 상위).
    // 524개 중 1위 → 0.2% / 100위 → 19.1% / 524위 → 100%.
    const topPercentile = Math.round((rank / desc.length) * 1000) / 10;

    return {
      metric: "monthly_avg_sales",
      brand_value: input.brand_value,
      industry_avg: avg(monthlyValues) ?? 0,
      industry_median: median(monthlyValues) ?? 0,
      brand_rank: rank,
      industry_n: desc.length,
      percentile: topPercentile,
    };
  } catch (e) {
    console.warn("[ftc2024] percentile 실패:", e instanceof Error ? e.message : e);
    return null;
  }
}

export async function fetchHqFinanceAvg(industryKor: string): Promise<HqFinanceAvg | null> {
  if (!isFrandoorConfigured() || !industryKor) return null;
  const sb = safeCreateClient("fetchHqFinanceAvg");
  if (!sb) return null;
  try {
    const { data, error } = await sb
      .from("ftc_brands_2024")
      .select(`${COL_FIN_REV}, ${COL_FIN_OP}, ${COL_FIN_DEBT}, ${COL_FIN_EQUITY}`)
      .eq("induty_mlsfc", industryKor);
    if (error || !data || data.length === 0) return null;
    const opMargins: number[] = [];
    const debtRatios: number[] = [];
    const revenuesEok: number[] = []; // 천원 → 억원: ÷ 1000_000 (천원 → 만원 ÷10, 만원 → 억원 ÷10000 = 총 ÷100000)
    for (const r of data) {
      const row = r as Record<string, unknown>;
      const rev = pickFiniteNum(row[COL_FIN_REV]);
      const op = pickFiniteNum(row[COL_FIN_OP]);
      const debt = pickFiniteNum(row[COL_FIN_DEBT]);
      const equity = pickFiniteNum(row[COL_FIN_EQUITY]);
      // PR059 — 분모 0 명시 제외 + 양쪽 부호 보존.
      if (rev != null && rev > 0 && op != null) {
        opMargins.push((op / rev) * 100);
      }
      if (debt != null && equity != null && equity > 0) {
        debtRatios.push((debt / equity) * 100);
      }
      if (rev != null && rev > 0) {
        // 천원 → 억원: 1억원 = 100,000,000원 = 100,000 천원.
        revenuesEok.push(rev / 100_000);
      }
    }
    // PR059 — trimmed mean (상하 5% 제외) outlier filter.
    const opTrim = trimmedMean(opMargins);
    const debtTrim = trimmedMean(debtRatios);
    const revTrim = trimmedMean(revenuesEok);
    return {
      industry: industryKor,
      n: data.length,
      avg_op_margin_pct: opTrim != null ? Math.round(opTrim * 10) / 10 : null,
      avg_debt_ratio_pct: debtTrim != null ? Math.round(debtTrim * 10) / 10 : null,
      avg_revenue_eok: revTrim != null ? Math.round(revTrim * 100) / 100 : null,
      source_year: "2024",
    };
  } catch (e) {
    console.warn("[ftc2024] hq finance avg 실패:", e instanceof Error ? e.message : e);
    return null;
  }
}

/**
 * PR057 — 17개 지역(+전체) 월평균매출 / 단위면적당 매출 평균.
 * region 미지정 → 18개 모두 반환. 지정 → 해당 지역 1건만.
 * 컬럼이 모두 없으면 해당 region 결과는 null 반환 (호출자가 graceful skip).
 */
export async function fetchRegionalAvg(
  industryKor: string,
  region?: Region,
): Promise<RegionalAvg[] | null> {
  if (!isFrandoorConfigured() || !industryKor) return null;
  const sb = safeCreateClient("fetchRegionalAvg");
  if (!sb) return null;
  try {
    const { data, error } = await sb
      .from("ftc_brands_2024")
      .select("*")
      .eq("induty_mlsfc", industryKor);
    if (error || !data || data.length === 0) {
      if (error) console.warn("[ftc2024] regional avg:", error.message);
      return null;
    }
    const targets: readonly Region[] = region ? [region] : REGIONS;
    const results: RegionalAvg[] = [];
    for (const reg of targets) {
      const suffix = REGION_SUFFIX[reg];
      const revCol = `avg_sales_2024_${suffix}`;       // 천원 (연)
      const areaCol = `sales_per_area_2024_${suffix}`;  // 천원 (단위면적당)
      const revVals: number[] = [];
      const areaVals: number[] = [];
      for (const r of data) {
        const row = r as Record<string, unknown>;
        const annualKw = pickFiniteNum(row[revCol]);
        if (annualKw != null && annualKw > 0) {
          // 천원/연 → 만원/월
          revVals.push(Math.round(annualKw / 10 / 12));
        }
        const areaKw = pickFiniteNum(row[areaCol]);
        if (areaKw != null && areaKw > 0) {
          // 천원/면적 → 만원/면적
          const v = toManwon(areaKw);
          if (v != null) areaVals.push(v);
        }
      }
      if (revVals.length === 0 && areaVals.length === 0) continue;
      results.push({
        industry: industryKor,
        region: reg,
        n: revVals.length || areaVals.length,
        avg_monthly_revenue: avg(revVals),
        avg_unit_area_revenue: avg(areaVals),
        source_year: "2024",
      });
    }
    return results.length > 0 ? results : null;
  } catch (e) {
    console.warn("[ftc2024] regional avg 실패:", e instanceof Error ? e.message : e);
    return null;
  }
}
