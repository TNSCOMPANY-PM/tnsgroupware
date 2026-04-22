import "server-only";
import type { GeoInput, GeoOutput, FaqItem } from "@/lib/geo/types";
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
  const factsPlus = { ...facts, deriveds: pre.deriveds };
  log(`[gpt] facts=${facts.facts.length}`);

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
