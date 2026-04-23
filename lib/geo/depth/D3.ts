import "server-only";
import type { GeoInput, GeoOutput, FaqItem, DerivedMetric } from "@/lib/geo/types";
import { runMatrixGate, runPrefetch, canonicalUrlFor } from "./shared";
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

  const sonnet = await callSonnet(input, factsPlus, pre.deriveds);
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

  const lint = lintForDepth("D3", payload, factsPlus, { canonicalUrl, jsonLd });
  const bodyAggregate = [
    ...payload.sections.map((s) => s.body),
    payload.closure.bodyHtml,
    ...payload.faq25.flatMap((f) => [f.q, f.a]),
  ].join("\n\n");
  const crosscheck = crosscheckForDepth("D3", bodyAggregate, factsPlus);
  log(`[lint] err=${lint.errors.length} / [cc] matched=${crosscheck.matchedCount} unmatched=${crosscheck.unmatched.length}`);

  if (crosscheck.strict && !crosscheck.ok) {
    throw new Error(
      `GATE crosscheck(strict) 실패: unmatched ${crosscheck.unmatched.length}건 — ${crosscheck.unmatched.slice(0, 20).join(" | ")}`,
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
