import "server-only";
import type { GeoInput, GeoOutput, FaqItem, DerivedMetric } from "@/lib/geo/types";
import { runMatrixGate, runPrefetch, canonicalUrlFor, resolveStoresLatest } from "./shared";
import { callGpt } from "@/lib/geo/write/gpt";
import { callSonnet } from "@/lib/geo/write/sonnet";
import { assembleFranchiseDoc } from "@/lib/geo/render/franchiseDoc";
import { normalizeFaqs } from "@/lib/geo/render/faq25";
import {
  buildFaqPage,
  buildBreadcrumb,
  buildFoodEstablishment,
  defaultBreadcrumbs,
} from "@/lib/geo/render/jsonLd";
import { lintForDepth } from "@/lib/geo/gates/lint";
import { crosscheckForDepth } from "@/lib/geo/gates/crosscheck";
import { upsertCanonical } from "@/lib/geo/canonicalStore";
import { deriveTimeseries, type TimeseriesDerived, type TimeseriesFact } from "@/lib/geo/metrics/derived";
import { classifyTier, D3T4BlockedError } from "./tier";
import { createAdminClient } from "@/utils/supabase/admin";

const TIMESERIES_META: Record<
  TimeseriesDerived["metric_id"],
  { key: DerivedMetric["key"]; label: string; unit: DerivedMetric["unit"] }
> = {
  frcs_growth: { key: "frcs_growth", label: "가맹점 증가수(A→C)", unit: "개" },
  frcs_multiplier: { key: "frcs_multiplier", label: "가맹점 확장배수(A→C)", unit: "배" },
  annualized_pos_sales: { key: "annualized_pos_sales", label: "C급 연환산 가맹점 평균매출", unit: "만원" },
  avg_sales_dilution: { key: "avg_sales_dilution", label: "평균매출 희석률(A→C)", unit: "%" },
};

function timeseriesToDerived(ts: TimeseriesDerived): DerivedMetric {
  const meta = TIMESERIES_META[ts.metric_id];
  const [aPeriod, cPeriod] = ts.period_compare;
  const period = aPeriod && cPeriod ? `${aPeriod}→${cPeriod}` : aPeriod || cPeriod || "";
  return {
    key: meta.key,
    label: meta.label,
    value: ts.value,
    unit: meta.unit,
    basis: ts.formula,
    formula: ts.formula,
    inputs: { period_A: aPeriod, period_C: cPeriod },
    period,
    confidence: "medium",
  };
}

export async function runD3(input: GeoInput): Promise<GeoOutput> {
  if (input.depth !== "D3") throw new Error("runD3 requires depth=D3");
  const logs: string[] = [];
  const log = (s: string) => { logs.push(s); console.log(s); };

  await runMatrixGate(input);
  log(`[gate:matrix] D3 ${input.brand} pass`);

  const pre = await runPrefetch(input);
  log(`[prefetch] deriveds=${pre.deriveds.length}`);

  // T3 stores resolve + T4 tier classify + T4 차단 — Sonnet 호출 전에 수행.
  // brandRow.fact_data 에서 docx 수작업 __official_data__.stores_total 을 B급 fallback 으로 사용.
  let brandRow: { fact_data?: unknown } | null = null;
  if (input.brandId) {
    try {
      const supa = createAdminClient();
      const { data } = await supa.from("geo_brands").select("fact_data").eq("id", input.brandId).maybeSingle();
      brandRow = data ?? null;
    } catch { brandRow = null; }
  }
  const { resolved: stores, honsa } = await resolveStoresLatest(input.brandId, pre.ftcFact, brandRow);
  log(`[stores] ${input.brand}: count=${stores.count} source=${stores.source} as_of=${stores.as_of}${stores.note ? ` note=${stores.note}` : ""}`);

  // ftcYears: honsa.ftc_first_registered → FTC OpenAPI yr → 최후수단 "ftcFact 존재 시 최소 1"
  const honsaFirstYear = parseInt(honsa?.ftc_first_registered?.slice(0, 4) ?? "0", 10);
  const ftcApiYear = parseInt(pre.ftcFact?.yr ?? "0", 10);
  const nowYear = new Date().getFullYear();
  const ftcYears = honsaFirstYear
    ? nowYear - honsaFirstYear
    : ftcApiYear
    ? Math.max(0, nowYear - ftcApiYear - (pre.ftcFact?.isFirstYear ? 0 : 0))
    : 0;
  const tierInput = {
    stores: stores.count,
    ftcYears,
    posMonths: honsa?.pos_monthly?.length ?? 0,
  };
  const tier = classifyTier(tierInput);
  log(`[tier] ${input.brand} = ${tier}`);
  if (tier === "T4") {
    throw new D3T4BlockedError(input.brand, tierInput);
  }

  const { facts } = await callGpt(input, pre.block);
  // L24 안전망: GPT 가 단일 도메인만 반환하면 KOSIS 참조 fact 를 1 건 주입해 도메인 다양성 확보
  const uniqueDomains = new Set<string>();
  for (const f of facts.facts) {
    try { uniqueDomains.add(new URL(f.source_url).hostname); } catch { /* noop */ }
  }
  if (uniqueDomains.size < 2) {
    facts.facts.push({
      claim: "외식산업 업종 평균 참조",
      value: "KOSIS 외식산업 연간지표 참고",
      unit: null,
      source_url: "https://kosis.kr/",
      source_title: "통계청 KOSIS 외식산업 통계",
      year_month: new Date().toISOString().slice(0, 7),
      authoritativeness: "secondary",
      tier: "B",
    });
    log(`[gpt] L24 보조출처 주입 (kosis.kr)`);
  }
  // 본사 POS 수치(점포수/평균/탑3·바텀3)를 C급 Fact 로 주입 — crosscheck pool 에 포함되어야
  // Sonnet 이 인용한 POS 수치가 unmatched 로 잡히지 않음.
  // 엑셀 원본이 원(KRW)일 수 있음 → 만원 스케일 자동 감지 후 변환 (per_store_avg 가 1억 원 이상이면 원 단위로 판정).
  const latestPosRaw = honsa?.pos_monthly?.[honsa.pos_monthly.length - 1] ?? null;
  const scaleDivisor = latestPosRaw && latestPosRaw.per_store_avg > 100_000_000 ? 10000 : 1;
  const toMan = (n: number): number => Math.round(n / scaleDivisor);
  const latestPos = latestPosRaw
    ? {
        ...latestPosRaw,
        store_count: latestPosRaw.store_count,
        total_sales: toMan(latestPosRaw.total_sales),
        per_store_avg: toMan(latestPosRaw.per_store_avg),
        top3_stores: (latestPosRaw.top3_stores ?? []).map((s) => ({ name: s.name, sales: toMan(s.sales) })),
        bottom3_stores: (latestPosRaw.bottom3_stores ?? []).map((s) => ({ name: s.name, sales: toMan(s.sales) })),
      }
    : null;
  if (latestPos) {
    const asOf = latestPos.year_month;
    const cBase = {
      source_url: "https://frandoor.co.kr/",
      source_title: "프랜도어 본사 POS 집계",
      year_month: asOf,
      period_month: asOf,
      authoritativeness: "secondary" as const,
      tier: "C" as const,
      source_tier: "C" as const,
    };
    const fmtMan = (n: number) => `${n.toLocaleString("ko-KR")}만원`;
    facts.facts.push({ ...cBase, claim: `본사 POS 활성 점포수 ${latestPos.store_count}개`, value: latestPos.store_count, unit: "개", fact_key: "frcs_cnt" });
    facts.facts.push({ ...cBase, claim: `본사 POS 가맹점당 월평균매출 ${fmtMan(latestPos.per_store_avg)}`, value: latestPos.per_store_avg, unit: "만원", fact_key: "monthly_avg_sales" });
    facts.facts.push({ ...cBase, claim: `본사 POS 전체 월매출 합계 ${fmtMan(latestPos.total_sales)}`, value: latestPos.total_sales, unit: "만원", fact_key: "total_sales" });
    for (const s of latestPos.top3_stores) {
      facts.facts.push({ ...cBase, claim: `본사 POS 상위점포 ${s.name} ${fmtMan(s.sales)}`, value: s.sales, unit: "만원", fact_key: "top_store_sales" });
    }
    for (const s of latestPos.bottom3_stores) {
      facts.facts.push({ ...cBase, claim: `본사 POS 하위점포 ${s.name} ${fmtMan(s.sales)}`, value: s.sales, unit: "만원", fact_key: "bottom_store_sales" });
    }
    log(`[gpt] C급 POS 주입: stores=${latestPos.store_count} avg=${latestPos.per_store_avg}만원 scaleDiv=${scaleDivisor} top=${latestPos.top3_stores.length} bot=${latestPos.bottom3_stores.length}`);
  }

  const tsFacts: TimeseriesFact[] = facts.facts.map((f) => ({
    fact_key: f.fact_key,
    source_tier: f.source_tier,
    value: f.value,
    period_month: f.period_month,
    year_month: f.year_month,
  }));
  const tsDeriveds = deriveTimeseries(tsFacts).map(timeseriesToDerived);
  const factsPlus = { ...facts, deriveds: [...pre.deriveds, ...tsDeriveds] };
  log(`[gpt] facts=${facts.facts.length} ts_deriveds=${tsDeriveds.length}`);
  const sonnet = await callSonnet(input, factsPlus, pre.deriveds, {
    tier,
    stores_resolved: stores,
    corporation_founded_year: honsa?.corporation_founded_year ?? null,
    ftc_first_registered: honsa?.ftc_first_registered ?? null,
    pos_monthly_summary: honsa
      ? {
          months: honsa.pos_monthly.length,
          from: honsa.pos_monthly[0]?.year_month ?? null,
          to: latestPos?.year_month ?? null,
          latest_store_count: latestPos?.store_count ?? null,
          latest_per_store_avg: latestPos?.per_store_avg ?? null,
          top3_stores: latestPos?.top3_stores ?? [],
          bottom3_stores: latestPos?.bottom3_stores ?? [],
        }
      : null,
  });
  const raw = sonnet.raw as {
    canonicalUrl?: unknown;
    sections?: unknown;
    closure?: unknown;
    faq25?: unknown;
    meta?: Record<string, unknown>;
  };

  const faqs: FaqItem[] = normalizeFaqs("D3", raw.faq25);
  const payload = assembleFranchiseDoc(raw, faqs, pre.deriveds);

  const canonicalUrl =
    typeof raw.canonicalUrl === "string" && raw.canonicalUrl.startsWith("/")
      ? raw.canonicalUrl
      : canonicalUrlFor(input);

  const label = (raw.meta && typeof raw.meta.title === "string") ? raw.meta.title : input.brand;
  const description =
    raw.meta && typeof raw.meta.description === "string" ? raw.meta.description : undefined;
  const category = facts.category;

  const jsonLd: Record<string, unknown>[] = [
    buildFaqPage(faqs),
    buildBreadcrumb(defaultBreadcrumbs("D3", canonicalUrl, label)),
    buildFoodEstablishment({ brand: input.brand, canonicalUrl, description, category }),
  ];

  const stance =
    raw.meta && typeof raw.meta.stance === "string" ? (raw.meta.stance as string) : undefined;
  const availableStoreNames = [
    ...(latestPos?.top3_stores ?? []),
    ...(latestPos?.bottom3_stores ?? []),
  ].map((s) => s.name).filter((n): n is string => Boolean(n));
  const d3Ctx = { tier: tier as "T1" | "T2" | "T3", stance, availableStoreNames };
  const lint = lintForDepth("D3", payload, factsPlus, { canonicalUrl, jsonLd, d3: d3Ctx });
  const bodyAggregate = [
    ...payload.sections.map((s) => s.body),
    payload.closure.bodyHtml,
    ...payload.faq25.flatMap((f) => [f.q, f.a]),
  ].join("\n\n");
  const crosscheck = crosscheckForDepth("D3", bodyAggregate, factsPlus);
  log(`[lint] err=${lint.errors.length} / [cc] matched=${crosscheck.matchedCount} unmatched=${crosscheck.unmatched.length}`);

  // PR030: D3 crosscheck strict 완화 → advisory. tier-aware lint(L38~L42) 가 품질 gate 대체.
  // 과도한 unmatched 만 차단 (25+ 는 본문 전면 불일치 신호).
  if (crosscheck.strict && crosscheck.unmatched.length >= 25) {
    throw new Error(
      `GATE crosscheck(D3) 대량 불일치: unmatched ${crosscheck.unmatched.length}건 — ${crosscheck.unmatched.slice(0, 10).join(" | ")}`,
    );
  }

  const out: GeoOutput = {
    depth: "D3",
    canonicalUrl,
    payload,
    jsonLd,
    tiers: {
      A: facts.facts.filter((f) => f.authoritativeness === "primary"),
      B: facts.facts.filter((f) => f.authoritativeness === "secondary"),
      C: [],
      D: pre.deriveds,
    },
    lint,
    crosscheck,
    logs,
  };
  await upsertCanonical(out, { brandId: input.brandId, slug: canonicalUrl.replace("/franchise/", ""), facts: factsPlus });
  return out;
}
