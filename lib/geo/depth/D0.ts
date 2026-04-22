import "server-only";
import type { GeoInput, GeoOutput, FaqItem } from "@/lib/geo/types";
import { runMatrixGate, runPrefetch, canonicalUrlFor } from "./shared";
import { callGpt } from "@/lib/geo/write/gpt";
import { callSonnet } from "@/lib/geo/write/sonnet";
import { assembleMarkdown } from "@/lib/geo/render/markdown";
import { normalizeFaqs } from "@/lib/geo/render/faq25";
import { buildFaqPage, buildBreadcrumb, defaultBreadcrumbs } from "@/lib/geo/render/jsonLd";
import { lintForDepth } from "@/lib/geo/gates/lint";
import { crosscheckForDepth } from "@/lib/geo/gates/crosscheck";
import { checkFactSanity } from "@/lib/geo/gates/factSanity";
import { upsertCanonical } from "@/lib/geo/canonicalStore";

export async function runD0(input: GeoInput): Promise<GeoOutput> {
  if (input.depth !== "D0") throw new Error("runD0 requires depth=D0");
  const logs: string[] = [];
  const log = (s: string) => { logs.push(s); console.log(s); };

  await runMatrixGate(input);
  log(`[gate:matrix] D0 pass`);

  const pre = await runPrefetch(input);
  log(`[prefetch] sources=${pre.sources.length} deriveds=${pre.deriveds.length}`);

  const { facts } = await callGpt(input, pre.block);
  log(`[gpt] facts=${facts.facts.length}`);
  const sanityIssues = checkFactSanity(facts.facts);
  if (sanityIssues.length > 0) {
    console.warn(`[factSanity] D0 advisory ${sanityIssues.length}건:`, JSON.stringify(sanityIssues, null, 2));
    log(`[factSanity] advisory ${sanityIssues.length}건 (D0 non-blocking)`);
  }
  const factsPlus = { ...facts, deriveds: pre.deriveds };

  const sonnet = await callSonnet(input, factsPlus);
  const raw = sonnet.raw as { frontmatter?: Record<string, unknown>; body?: string };
  if (!raw.frontmatter || !raw.body) throw new Error("D0 Sonnet output malformed");

  const canonicalUrl = canonicalUrlFor(input);
  const { md, payload } = assembleMarkdown(raw.frontmatter, raw.body, {
    canonicalUrl,
    dataCollectedAt: facts.collected_at,
    extraSources: pre.sources,
  });
  log(`[assemble] md ${md.length}자`);

  const faqs: FaqItem[] = normalizeFaqs(
    "D0",
    (raw.frontmatter.faq as Array<{ q: unknown; a: unknown }>) ?? [],
  );

  const jsonLd = [
    buildFaqPage(faqs),
    buildBreadcrumb(defaultBreadcrumbs("D0", canonicalUrl, String(raw.frontmatter.title ?? input.topic))),
  ];

  const lint = lintForDepth("D0", payload, factsPlus, { canonicalUrl, jsonLd });
  const crosscheck = crosscheckForDepth("D0", raw.body, factsPlus);
  log(`[lint] err=${lint.errors.length} warn=${lint.warns.length} / [cc] matched=${crosscheck.matchedCount} unmatched=${crosscheck.unmatched.length}`);

  const out: GeoOutput = {
    depth: "D0",
    canonicalUrl,
    payload,
    jsonLd,
    tiers: { A: facts.facts.filter((f) => f.tier === "A" || f.authoritativeness === "primary"), B: facts.facts.filter((f) => f.tier === "B"), C: facts.facts.filter((f) => f.tier === "C"), D: pre.deriveds },
    lint,
    crosscheck,
    logs,
  };

  await upsertCanonical(out, { slug: canonicalUrl.replace("/blog/", ""), facts: factsPlus });
  return out;
}
