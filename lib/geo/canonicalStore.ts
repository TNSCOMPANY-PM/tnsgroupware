import "server-only";
import { createAdminClient } from "@/utils/supabase/admin";
import type { GeoOutput } from "@/lib/geo/types";
import type { GptFacts } from "@/lib/geo/schema";

export async function upsertCanonical(
  out: GeoOutput,
  extras: { brandId?: string; industry?: string; slug?: string; facts: GptFacts },
): Promise<void> {
  try {
    const supa = createAdminClient();
    const row = {
      canonical_url: out.canonicalUrl,
      depth: out.depth,
      brand_id: extras.brandId ?? null,
      industry: extras.industry ?? null,
      slug: extras.slug ?? null,
      payload: out.payload as unknown as Record<string, unknown>,
      tiers: out.tiers as unknown as Record<string, unknown>,
      facts_raw: { facts: extras.facts.facts, deriveds: extras.facts.deriveds ?? [] },
      json_ld: out.jsonLd,
      lint_result: out.lint,
      pipeline_version: "v2",
    };
    await supa.from("geo_canonical").upsert(row, { onConflict: "canonical_url" });
  } catch (e) {
    console.warn("[canonical.upsert] 실패:", e instanceof Error ? e.message : e);
  }
}
