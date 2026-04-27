import "server-only";
import { createAdminClient } from "@/utils/supabase/admin";

/**
 * PR043 — docx 기반 C급 대체 로더.
 * xlsx POS 경로 (frandoor_brand_facts) 폐기 후 docx (geo_brands.fact_data) 에서 공식 수치 + 홈페이지 수치 추출.
 */

export type FrandoorOfficialData = {
  source_year: string | null;
  stores_total: number | null;
  avg_monthly_revenue: number | null;        // 만원
  cost_total: number | null;                  // 만원
  franchise_fee: number | null;               // 만원
  closure_rate: number | null;                // %
  industry_avg_revenue: number | null;        // 만원 — 업종 평균
  industry_avg_cost: number | null;
  sources: string[];
};

export type AreaKey =
  | "brand_basic"
  | "avg_revenue"
  | "startup_cost"
  | "operation"
  | "frcs_status"
  | "revenue_detail"
  | "cert_compliance";

export const AREA_KEYS: AreaKey[] = [
  "brand_basic",
  "avg_revenue",
  "startup_cost",
  "operation",
  "frcs_status",
  "revenue_detail",
  "cert_compliance",
];

export type ComparisonRow = {
  metric: string;
  official_value: string;
  brochure_value: string | null;
  note: string | null;
  unit?: string | null;
};

export type ComparisonTable = {
  section: string;
  area: AreaKey;
  headers: string[];
  rows: ComparisonRow[];
};

export type DataTable = {
  section: string;
  area: AreaKey;
  headers: string[];
  rows: Record<string, string>[];
};

export type FrandoorDocx = {
  brand_id: string;
  brand_name: string;
  official_data: FrandoorOfficialData | null;
  raw_text_chunks: string[];
  file_url: string | null;
  /** PR052 — docx 30 표 단위 추출 (또는 existing data 합성). */
  comparison_tables: ComparisonTable[];
  data_tables: DataTable[];
};

function pickNum(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

export async function fetchFrandoorDocx(brandId: string | undefined): Promise<FrandoorDocx | null> {
  if (!brandId) return null;
  try {
    const sb = createAdminClient();
    const { data, error } = await sb
      .from("geo_brands")
      .select("id, name, fact_data, fact_file_url")
      .eq("id", brandId)
      .maybeSingle();
    if (error || !data) return null;

    const factData = Array.isArray(data.fact_data) ? (data.fact_data as Array<Record<string, unknown>>) : [];

    let official: FrandoorOfficialData | null = null;
    const officialEntry = factData.find((x) => x?.label === "__official_data__");
    const officialRaw = officialEntry ? officialEntry.keyword : null;
    if (typeof officialRaw === "string") {
      try {
        const obj = JSON.parse(officialRaw) as Record<string, unknown>;
        official = {
          source_year: typeof obj.source_year === "string" ? obj.source_year : null,
          stores_total: pickNum(obj.stores_total),
          avg_monthly_revenue: pickNum(obj.avg_monthly_revenue),
          cost_total: pickNum(obj.cost_total),
          franchise_fee: pickNum(obj.franchise_fee),
          closure_rate: pickNum(obj.closure_rate),
          industry_avg_revenue: pickNum(obj.industry_avg_revenue),
          industry_avg_cost: pickNum(obj.industry_avg_cost),
          sources: Array.isArray(obj.sources) ? (obj.sources as string[]).filter((s) => typeof s === "string") : [],
        };
      } catch {
        official = null;
      }
    }

    const rawChunks = factData
      .filter((x) => x?.label === "__raw_text__")
      .map((x) => String(x.keyword ?? ""));

    let fileUrl: string | null = null;
    try {
      if (typeof data.fact_file_url === "string") {
        const arr = JSON.parse(data.fact_file_url);
        if (Array.isArray(arr) && arr[0]?.url) fileUrl = String(arr[0].url);
      }
    } catch {
      fileUrl = null;
    }

    // PR052 — fact_data 안 __comparison_tables__ / __data_tables__ entry (있으면 사용, 없으면 합성).
    const explicitComparison = factData.find((x) => x?.label === "__comparison_tables__")?.keyword;
    const explicitDataTables = factData.find((x) => x?.label === "__data_tables__")?.keyword;

    let comparison_tables: ComparisonTable[] = [];
    let data_tables: DataTable[] = [];
    if (typeof explicitComparison === "string") {
      try {
        const parsed = JSON.parse(explicitComparison);
        if (Array.isArray(parsed)) comparison_tables = parsed as ComparisonTable[];
      } catch {
        comparison_tables = [];
      }
    }
    if (typeof explicitDataTables === "string") {
      try {
        const parsed = JSON.parse(explicitDataTables);
        if (Array.isArray(parsed)) data_tables = parsed as DataTable[];
      } catch {
        data_tables = [];
      }
    }

    // explicit 부재 시 existing data 기반 fallback 합성.
    if (comparison_tables.length === 0 && official) {
      comparison_tables = synthesizeComparisonTables(official, rawChunks);
    }

    return {
      brand_id: String(data.id),
      brand_name: String(data.name ?? ""),
      official_data: official,
      raw_text_chunks: rawChunks,
      file_url: fileUrl,
      comparison_tables,
      data_tables,
    };
  } catch (e) {
    console.warn("[frandoorDocx] fetch 실패:", e instanceof Error ? e.message : e);
    return null;
  }
}

export type ExtractedHomepageFacts = {
  stores_count_self: number | null;
  avg_monthly_revenue_homepage: number | null;
  real_investment: number | null;
  legal_disputes_self: number | null;
  profit_margin: number | null;
  payback_months: number | null;
};

export function extractHomepageFacts(rawChunks: string[]): ExtractedHomepageFacts {
  const text = rawChunks.join("\n");
  const out: ExtractedHomepageFacts = {
    stores_count_self: null,
    avg_monthly_revenue_homepage: null,
    real_investment: null,
    legal_disputes_self: null,
    profit_margin: null,
    payback_months: null,
  };

  const storesMatch = text.match(/(\d{1,4})\s*호점/u)
    ?? text.match(/전국\s*가맹점\s*(\d{1,4})\s*개/u);
  if (storesMatch) out.stores_count_self = parseInt(storesMatch[1], 10);

  const revMatch =
    text.match(/평균\s*월\s*매출\s*([\d,]+)\s*만원/u) ??
    text.match(/월\s*매출\s*([\d,]+)\s*만원/u);
  if (revMatch) out.avg_monthly_revenue_homepage = parseInt(revMatch[1].replace(/,/g, ""), 10);

  const invMatch = text.match(/실\s*투자금\s*([\d,]+)\s*만원/u);
  if (invMatch) out.real_investment = parseInt(invMatch[1].replace(/,/g, ""), 10);

  const legalMatch =
    text.match(/법적\s*분쟁\s*(\d+)\s*건/u) ??
    text.match(/법\s*위반\s*(\d+)\s*건/u);
  if (legalMatch) out.legal_disputes_self = parseInt(legalMatch[1], 10);

  const marginMatch = text.match(/순\s*마진\s*(?:율)?\s*(\d+)\s*%/u);
  if (marginMatch) out.profit_margin = parseInt(marginMatch[1], 10);

  const payYear = text.match(/투자\s*회수\s*(?:약)?\s*(\d+)\s*년/u);
  const payMonth = text.match(/투자\s*회수\s*(?:약)?\s*(\d+)\s*개월/u);
  if (payYear) out.payback_months = parseInt(payYear[1], 10) * 12;
  else if (payMonth) out.payback_months = parseInt(payMonth[1], 10);

  return out;
}

/** PR052 — 섹션 제목·헤더 텍스트 → 7영역 휴리스틱 매핑. */
export function assignArea(text: string): AreaKey {
  const t = text.toLowerCase();
  if (/창업비용|가맹비|교육비|보증금|인테리어|예치금|투자금/.test(t)) return "startup_cost";
  if (/매출.*(지역|시간대|점포별|채널|분포|상위|하위)/.test(t)) return "revenue_detail";
  if (/평균매출|월매출|연매출/.test(t)) return "avg_revenue";
  if (/가맹점.*(현황|증감|개점|폐점|명의변경|변동)|점포\s*수/.test(t)) return "frcs_status";
  if (/계약기간|로열티|옵션|운영.*정보|예치/.test(t)) return "operation";
  if (/인증|식약처|haccp|법위반|분쟁|시정조치|위생/i.test(t)) return "cert_compliance";
  if (/브랜드.*(기본|정보|개요)|법인|사업자|등록일/.test(t)) return "brand_basic";
  return "brand_basic";
}

function fmtMan(n: number): string {
  return `${n.toLocaleString("ko-KR")}만원`;
}

/** PR052 — explicit 비교표 부재 시 existing __official_data__ + __raw_text__ 에서 합성. */
function synthesizeComparisonTables(
  od: FrandoorOfficialData,
  rawChunks: string[],
): ComparisonTable[] {
  const tables: ComparisonTable[] = [];
  const hp = extractHomepageFacts(rawChunks);

  // C. 창업비용 비교표 — 공정위 수치 vs 본사 브로셔 (raw_text 발췌 가능 시)
  const costRows: ComparisonRow[] = [];
  if (od.franchise_fee != null) {
    costRows.push({
      metric: "가맹비",
      official_value: fmtMan(od.franchise_fee),
      brochure_value: null,
      note: null,
      unit: "만원",
    });
  }
  if (od.cost_total != null) {
    costRows.push({
      metric: "창업비용 총액",
      official_value: fmtMan(od.cost_total),
      brochure_value: hp.real_investment != null ? fmtMan(hp.real_investment) : null,
      note:
        hp.real_investment != null && od.cost_total !== hp.real_investment
          ? `${fmtMan(Math.abs(od.cost_total - hp.real_investment))} 차이`
          : hp.real_investment != null
            ? "일치"
            : null,
      unit: "만원",
    });
  }
  if (costRows.length > 0) {
    tables.push({
      section: "창업비용 비교 — 공정위 vs 본사",
      area: "startup_cost",
      headers: ["항목", "공정위 정보공개서", "본사 공개 자료", "비고"],
      rows: costRows,
    });
  }

  // E. 가맹점 현황 비교표 — 공정위 stores_total vs 홈페이지 stores_count_self
  if (od.stores_total != null && hp.stores_count_self != null) {
    const diff = hp.stores_count_self - od.stores_total;
    tables.push({
      section: "가맹점 현황 — 공정위 vs 본사 발표",
      area: "frcs_status",
      headers: ["항목", "공정위 정보공개서", "본사 발표", "비고"],
      rows: [
        {
          metric: "가맹점 수",
          official_value: `${od.stores_total}개`,
          brochure_value: `${hp.stores_count_self}호점`,
          note: diff !== 0 ? `${diff > 0 ? "+" : ""}${diff}개 차이` : "일치",
          unit: "개",
        },
      ],
    });
  }

  // B. 평균매출 비교표
  if (od.avg_monthly_revenue != null) {
    const revRows: ComparisonRow[] = [
      {
        metric: "월평균매출",
        official_value: fmtMan(od.avg_monthly_revenue),
        brochure_value:
          hp.avg_monthly_revenue_homepage != null ? fmtMan(hp.avg_monthly_revenue_homepage) : null,
        note:
          hp.avg_monthly_revenue_homepage != null
            ? hp.avg_monthly_revenue_homepage === od.avg_monthly_revenue
              ? "일치"
              : `${fmtMan(Math.abs(od.avg_monthly_revenue - hp.avg_monthly_revenue_homepage))} 차이`
            : null,
        unit: "만원",
      },
    ];
    if (od.industry_avg_revenue != null) {
      revRows.push({
        metric: "동 업종 프랜차이즈 평균",
        official_value: fmtMan(od.industry_avg_revenue),
        brochure_value: null,
        note: "공정위 가맹사업 현황 통계",
        unit: "만원",
      });
    }
    tables.push({
      section: "평균매출 비교",
      area: "avg_revenue",
      headers: ["항목", "공정위 정보공개서", "본사 발표", "비고"],
      rows: revRows,
    });
  }

  // G. 인증·법적 분쟁 비교 (홈페이지 hp.legal_disputes_self vs 공정위 violations 추정)
  if (hp.legal_disputes_self != null) {
    tables.push({
      section: "법적 분쟁 이력",
      area: "cert_compliance",
      headers: ["항목", "공정위 정보공개서", "본사 공개 자료", "비고"],
      rows: [
        {
          metric: "법적 분쟁 건수",
          official_value: "공시 항목 별도",
          brochure_value: `${hp.legal_disputes_self}건`,
          note: hp.legal_disputes_self === 0 ? "본사 자료 무분쟁" : null,
        },
      ],
    });
  }

  return tables;
}
