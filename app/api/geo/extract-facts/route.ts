import { NextResponse } from "next/server";
import { getSessionEmployee, unauthorized } from "@/utils/apiAuth";
import { deriveTimeseries, type TimeseriesFact } from "@/lib/geo/metrics/derived";

export const runtime = "nodejs";

// PR025 — FACT_KEY 표준화 13종 + source_tier URL 기반 자동 결정
// 규칙 매칭은 정규식 우선. 13종 표준 fact_key 외 팩트는 null 유지.
const FACT_KEY_RULES: Array<[RegExp, string]> = [
  [/신규\s*(개점|오픈|등록)/u, "new_frcs_cnt"],
  [/가맹점\s*수|매장\s*수/u, "frcs_cnt"],
  [/연\s*평균\s*매출|연평균\s*매출/u, "avg_annual_sales"],
  [/월\s*평균\s*매출|월평균\s*매출/u, "monthly_avg_sales"],
  [/교육비/u, "invest_edu"],
  [/보증금/u, "invest_grnty"],
  [/가맹금|가입비/u, "invest_jnggm"],
  [/기타\s*(비용|창업)/u, "invest_etc"],
  [/본사\s*매출|본사\s*매출액/u, "corp_revenue"],
  [/본사\s*영업이익|영업이익/u, "corp_op_income"],
  [/업종\s*평균|산업\s*평균/u, "industry_avg_restaurant"],
  [/HACCP/u, "haccp_cert"],
  [/네이버\s*어워즈|네이버\s*주문\s*어워즈/u, "naver_award_2025"],
  [/해외\s*(1호점|진출|오픈)/u, "overseas_launch"],
];

const TIER_A_HOSTS = /(^|\.)franchise\.ftc\.go\.kr$|(^|\.)frandoor/i;
const TIER_B_HOSTS = /(^|\.)kosis\.kr$|(^|\.)krei\.re\.kr$|(^|\.)data\.go\.kr$|(^|\.)mfds\.go\.kr$|(^|\.)ftc\.go\.kr$/i;

function inferFactKey(claim: string): string | null {
  for (const [re, key] of FACT_KEY_RULES) {
    if (re.test(claim)) return key;
  }
  return null;
}

function inferSourceTier(url: string, origin?: string): "A" | "B" | "C" | null {
  if (origin === "brand_source_doc") return "C";
  let host = "";
  try { host = new URL(url).hostname; } catch { return null; }
  if (TIER_A_HOSTS.test(host)) return "A";
  if (TIER_B_HOSTS.test(host)) return "B";
  return null;
}

type InputFact = {
  claim?: string;
  name?: string;
  value: string | number;
  unit?: string | null;
  source_url?: string;
  source?: string;
  source_title?: string;
  year_month?: string;
  period_month?: string | null;
  authoritativeness?: "primary" | "secondary";
  tier?: "A" | "B" | "C" | "D";
  origin?: string;
  fact_key?: string | null;
  source_tier?: "A" | "B" | "C" | null;
};

type AugmentedFact = Omit<InputFact, "fact_key" | "source_tier" | "period_month"> & {
  fact_key: string | null;
  source_tier: "A" | "B" | "C" | null;
  period_month: string | null;
};

export async function POST(req: Request) {
  const session = await getSessionEmployee();
  if (!session) return unauthorized();

  const body = await req.json().catch(() => null) as { facts?: InputFact[] } | null;
  if (!body || !Array.isArray(body.facts)) {
    return NextResponse.json({ error: "INVALID_INPUT", message: "facts array required" }, { status: 422 });
  }

  const augmented: AugmentedFact[] = body.facts.map((f) => {
    const claim = f.claim ?? f.name ?? "";
    const fact_key = f.fact_key ?? inferFactKey(claim);
    const source_tier = f.source_tier ?? inferSourceTier(f.source_url ?? "", f.origin);
    const period_month = f.period_month ?? f.year_month ?? null;
    return { ...f, fact_key, source_tier, period_month };
  });

  const tsFacts: TimeseriesFact[] = augmented.map((f) => ({
    fact_key: f.fact_key,
    source_tier: f.source_tier,
    value: f.value,
    period_month: f.period_month,
    year_month: f.year_month,
  }));
  const derived = deriveTimeseries(tsFacts);

  return NextResponse.json({ facts: augmented, derived });
}
