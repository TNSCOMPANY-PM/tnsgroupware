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

export async function runD1(input: GeoInput): Promise<GeoOutput> {
  if (input.depth !== "D1") throw new Error("runD1 requires depth=D1");
  const logs: string[] = [];
  const log = (s: string) => { logs.push(s); console.log(s); };

  await runMatrixGate(input);
  log(`[gate:matrix] D1 pass`);

  const pre = await runPrefetch(input);
  log(`[prefetch] sources=${pre.sources.length}`);

  const { facts } = await callGpt(input, pre.block);
  const sanityIssues = checkFactSanity(facts.facts);
  if (sanityIssues.length > 0) {
    console.warn(`[factSanity] D1 advisory ${sanityIssues.length}건:`, JSON.stringify(sanityIssues, null, 2));
    log(`[factSanity] advisory ${sanityIssues.length}건 (D1 non-blocking)`);
  }
  const factsPlus = { ...facts, deriveds: pre.deriveds };

  const sonnet = await callSonnet(input, factsPlus);
  const raw = sonnet.raw as { frontmatter?: Record<string, unknown>; body?: string };
  if (!raw.frontmatter || !raw.body) throw new Error("D1 Sonnet output malformed");

  const canonicalUrl = canonicalUrlFor(input);
  const { md, payload } = assembleMarkdown(raw.frontmatter, raw.body, {
    canonicalUrl,
    dataCollectedAt: facts.collected_at,
    extraSources: pre.sources,
  });
  log(`[assemble] md ${md.length}자`);

  const faqs: FaqItem[] = normalizeFaqs(
    "D1",
    (raw.frontmatter.faq as Array<{ q: unknown; a: unknown }>) ?? [],
  );

  const jsonLd = [
    buildFaqPage(faqs),
    buildBreadcrumb(defaultBreadcrumbs("D1", canonicalUrl, String(raw.frontmatter.title ?? input.topic))),
  ];

  const lint = lintForDepth("D1", payload, factsPlus, { canonicalUrl, jsonLd });
  const crosscheck = crosscheckForDepth("D1", raw.body, factsPlus);

  const out: GeoOutput = {
    depth: "D1",
    canonicalUrl,
    payload,
    jsonLd,
    tiers: { A: facts.facts.filter((f) => f.authoritativeness === "primary"), B: [], C: [], D: pre.deriveds },
    lint,
    crosscheck,
    logs,
  };
  await upsertCanonical(out, { slug: canonicalUrl.replace("/blog/", ""), facts: factsPlus });
  return out;
}
