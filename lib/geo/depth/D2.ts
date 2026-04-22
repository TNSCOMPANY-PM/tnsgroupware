import "server-only";
import type { GeoInput, GeoOutput, FaqItem } from "@/lib/geo/types";
import { runMatrixGate, runPrefetch, canonicalUrlFor } from "./shared";
import { callGpt } from "@/lib/geo/write/gpt";
import { callSonnet } from "@/lib/geo/write/sonnet";
import { assembleIndustryDoc } from "@/lib/geo/render/industryDoc";
import { normalizeFaqs } from "@/lib/geo/render/faq25";
import { buildFaqPage, buildBreadcrumb, defaultBreadcrumbs } from "@/lib/geo/render/jsonLd";
import { lintForDepth } from "@/lib/geo/gates/lint";
import { crosscheckForDepth } from "@/lib/geo/gates/crosscheck";
import { checkFactSanity } from "@/lib/geo/gates/factSanity";
import { upsertCanonical } from "@/lib/geo/canonicalStore";

export async function runD2(input: GeoInput): Promise<GeoOutput> {
  if (input.depth !== "D2") throw new Error("runD2 requires depth=D2");
  const logs: string[] = [];
  const log = (s: string) => { logs.push(s); console.log(s); };

  await runMatrixGate(input);
  log(`[gate:matrix] D2 pass`);

  const pre = await runPrefetch(input);

  const { facts } = await callGpt(input, pre.block);
  const sanityIssues = checkFactSanity(facts.facts);
  if (sanityIssues.length > 0) {
    console.warn(`[factSanity] D2 advisory ${sanityIssues.length}건:`, JSON.stringify(sanityIssues, null, 2));
    log(`[factSanity] advisory ${sanityIssues.length}건 (D2 non-blocking)`);
  }
  const factsPlus = { ...facts, deriveds: pre.deriveds };

  const sonnet = await callSonnet(input, factsPlus);
  const raw = sonnet.raw as { sections?: unknown; comparisonTable?: unknown; faq25?: unknown; meta?: Record<string, unknown>; canonicalUrl?: unknown };

  const payload = assembleIndustryDoc(raw);
  const canonicalUrl = (typeof raw.canonicalUrl === "string" && raw.canonicalUrl.startsWith("/")) ? raw.canonicalUrl : canonicalUrlFor(input);
  const faqs: FaqItem[] = normalizeFaqs("D2", raw.faq25);

  const label = (raw.meta && typeof raw.meta.title === "string") ? raw.meta.title : input.industry;
  const jsonLd = [
    buildFaqPage(faqs),
    buildBreadcrumb(defaultBreadcrumbs("D2", canonicalUrl, label)),
  ];

  const lint = lintForDepth("D2", payload, factsPlus, { canonicalUrl, jsonLd });
  const bodyAggregate = payload.sections.map((s) => s.body).join("\n\n");
  const crosscheck = crosscheckForDepth("D2", bodyAggregate, factsPlus);
  log(`[lint] err=${lint.errors.length} / [cc] unmatched=${crosscheck.unmatched.length}`);

  const out: GeoOutput = {
    depth: "D2",
    canonicalUrl,
    payload,
    jsonLd,
    tiers: { A: facts.facts.filter((f) => f.authoritativeness === "primary"), B: [], C: [], D: pre.deriveds },
    lint,
    crosscheck,
    logs,
  };
  await upsertCanonical(out, { industry: input.industry, slug: canonicalUrl.replace("/industry/", ""), facts: factsPlus });
  return out;
}
