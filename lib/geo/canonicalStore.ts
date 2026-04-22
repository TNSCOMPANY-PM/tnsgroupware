import "server-only";
import { createAdminClient } from "@/utils/supabase/admin";
import type { GeoOutput } from "@/lib/geo/types";
import type { GptFacts } from "@/lib/geo/schema";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function upsertCanonical(
  out: GeoOutput,
  extras: { brandId?: string; industry?: string; slug?: string; facts: GptFacts },
): Promise<void> {
  try {
    const supa = createAdminClient();
    const brandIdValid = extras.brandId && UUID_RE.test(extras.brandId) ? extras.brandId : null;
    const row = {
      canonical_url: out.canonicalUrl,
      depth: out.depth,
      brand_id: brandIdValid,
      industry: extras.industry ?? null,
      slug: extras.slug ?? null,
      payload: out.payload as unknown as Record<string, unknown>,
      tiers: out.tiers as unknown as Record<string, unknown>,
      facts_raw: { facts: extras.facts.facts, deriveds: extras.facts.deriveds ?? [] },
      json_ld: out.jsonLd,
      lint_result: out.lint,
      pipeline_version: "v2",
    };
    const { error } = await supa.from("geo_canonical").upsert(row, { onConflict: "canonical_url" });
    if (error) {
      console.warn("[canonical.upsert] 실패:", error.message, error.details ?? "", error.hint ?? "");
    } else {
      console.log(`[canonical.upsert] OK ${out.canonicalUrl}`);
    }
  } catch (e) {
    console.warn("[canonical.upsert] 예외:", e instanceof Error ? e.message : e);
  }
}
