import "server-only";
import { z } from "zod";
import type { SyndicateInput, SyndicateOutput } from "./types";
import { loadCanonical, extractSubset } from "./extract";
import { rewriteForAngle } from "./rewrite";
import { ensureBacklink } from "./backlink";
import { crosscheckAgainstCanonical, forbiddenWordCheck } from "./guards";
import { prepareForTistory } from "./platform/tistory";
import { prepareForNaver } from "./platform/naver";
import { prepareForMedium } from "./platform/medium";

export const SyndicateInputSchema = z.object({
  sourceUrl: z.string().startsWith("/"),
  angle: z.enum([
    "invest-focus",
    "closure-focus",
    "compare-peer",
    "faq-digest",
    "news-hook",
    "industry-overview",
    "top-n-list",
  ]),
  platform: z.enum(["tistory", "naver", "medium"]),
  length: z.number().int().positive().optional(),
});

function applyPlatform(platform: SyndicateInput["platform"], html: string): string {
  switch (platform) {
    case "tistory": return prepareForTistory(html);
    case "naver":   return prepareForNaver(html);
    case "medium":  return prepareForMedium(html);
  }
}

export async function syndicate(input: SyndicateInput): Promise<SyndicateOutput> {
  const logs: string[] = [];
  const log = (s: string) => { logs.push(s); console.log(s); };

  const canonical = await loadCanonical(input.sourceUrl);
  if (!canonical) {
    throw new Error(`canonical not found: ${input.sourceUrl}`);
  }
  log(`[syndicate.load] ${input.sourceUrl} depth=${canonical.depth}`);

  const subset = extractSubset(canonical, input.angle);
  log(`[syndicate.extract] ${input.angle} bullets=${subset.bullets.length} metrics=${subset.metrics.length} faqs=${subset.faqs.length}`);

  const rewritten = await rewriteForAngle(subset, input.angle, input.platform, canonical.canonical_url, input.length);
  log(`[syndicate.rewrite] title="${rewritten.title.slice(0, 30)}..." html=${rewritten.html.length}자`);

  const withBacklink = ensureBacklink(rewritten.html, canonical.canonical_url, rewritten.anchor);
  const platformReady = applyPlatform(input.platform, withBacklink);
  log(`[syndicate.platform:${input.platform}] html=${platformReady.length}자`);

  const cc = crosscheckAgainstCanonical(platformReady, canonical.facts_raw);
  log(`[syndicate.crosscheck] matched=${cc.matchedCount} unmatched=${cc.unmatched.length}`);
  if (!cc.ok) {
    throw new Error(
      `syndicate crosscheck(strict) 실패: unmatched ${cc.unmatched.length}건 — ${cc.unmatched.slice(0, 3).join(" | ")}`,
    );
  }

  // L01 금지어 게이트 — syndicate rewrite 결과에 "약 N" / "1위" 등 누수 차단
  const forbidden = forbiddenWordCheck(platformReady);
  log(`[syndicate.forbidden] hits=${forbidden.hits.length}`);
  if (!forbidden.ok) {
    throw new Error(`syndicate L01 금지어 검출: ${forbidden.hits.join(" | ")}`);
  }

  return {
    title: rewritten.title,
    html: platformReady,
    canonical: canonical.canonical_url,
    anchor: rewritten.anchor,
    angle: input.angle,
    platform: input.platform,
    logs,
  };
}
