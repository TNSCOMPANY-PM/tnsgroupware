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

export type FrandoorDocx = {
  brand_id: string;
  brand_name: string;
  official_data: FrandoorOfficialData | null;
  raw_text_chunks: string[];
  file_url: string | null;
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

    return {
      brand_id: String(data.id),
      brand_name: String(data.name ?? ""),
      official_data: official,
      raw_text_chunks: rawChunks,
      file_url: fileUrl,
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
