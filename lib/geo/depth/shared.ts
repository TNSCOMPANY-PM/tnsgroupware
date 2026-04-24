import "server-only";
import type { GeoInput, DerivedMetric } from "@/lib/geo/types";
import { prefetchOfficial } from "@/lib/geo/prefetch/official";
import { matrixCheck } from "@/lib/geo/gates/matrix";
import { fetchFrandoorBrandFact, type FrandoorFact } from "@/lib/geo/prefetch/frandoorDb";
import { fetchFrandoorOfficial, type FrandoorOfficial } from "@/lib/geo/prefetch/frandoorOfficial";
import { computeAllFromOfficial } from "@/lib/geo/metrics/derived";

function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9가-힣]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60);
}

export function canonicalUrlFor(input: GeoInput): string {
  switch (input.depth) {
    case "D0":
    case "D1":
      return `/blog/${slugify(input.topic)}`;
    case "D2":
      return `/industry/${slugify(input.industry)}`;
    case "D3":
      return `/franchise/${slugify(input.brand)}`;
  }
}

export async function runMatrixGate(input: GeoInput): Promise<void> {
  const topic =
    input.depth === "D0" || input.depth === "D1"
      ? input.topic
      : input.depth === "D2"
      ? input.topic
      : undefined;
  const check = await matrixCheck({
    depth: input.depth,
    brand: input.depth === "D3" ? input.brand : undefined,
    topic,
  });
  if (!check.ok) {
    throw new Error(
      `BLOCKED by matrix: ${input.depth} — ${check.reason ?? "EXCLUDE rule"}`,
    );
  }
}

export async function runPrefetch(input: GeoInput): Promise<{
  block: string;
  sources: string[];
  deriveds: DerivedMetric[];
  official: FrandoorOfficial | null;
}> {
  const pre = await prefetchOfficial({
    brand: input.depth === "D3" ? input.brand : undefined,
    industry:
      input.depth === "D2"
        ? input.industry
        : input.depth === "D3"
        ? undefined
        : undefined,
    category: undefined,
  });

  // Tier D 파생지표 — A급은 frandoor_ftc_facts (프랜도어 업로드). FTC OpenAPI 경유 금지.
  let deriveds: DerivedMetric[] = [];
  let official: FrandoorOfficial | null = null;
  if (input.depth === "D3" && input.brandId) {
    official = await fetchFrandoorOfficial(input.brandId);
    if (official) {
      deriveds = computeAllFromOfficial(official, pre.raw.kosis ?? null);
    }
  }

  return { block: pre.block, sources: pre.sources, deriveds, official };
}

export type ResolvedStores = {
  count: number | null;
  source: "C_honsa_pos" | "A_frandoor_ftc" | "unknown";
  as_of: string | null;
  note?: string;
};

/** stores_latest fallback — C(본사 POS) > A(공정위 정보공개서, 프랜도어 업로드) > unknown.
 * PR030 hotfix: FTC OpenAPI 경로 폐기. frandoor_ftc_facts 테이블 단일 경로.
 */
export async function resolveStoresLatest(
  brandId: string | undefined,
): Promise<{ resolved: ResolvedStores; honsa: FrandoorFact | null; official: FrandoorOfficial | null }> {
  const honsa = brandId ? await fetchFrandoorBrandFact(brandId) : null;
  if (honsa?.stores_latest != null) {
    return {
      resolved: {
        count: honsa.stores_latest,
        source: "C_honsa_pos",
        as_of: honsa.stores_latest_as_of ?? null,
      },
      honsa,
      official: null,
    };
  }
  const official = brandId ? await fetchFrandoorOfficial(brandId) : null;
  if (official?.stores_total != null) {
    return {
      resolved: {
        count: official.stores_total,
        source: "A_frandoor_ftc",
        as_of: official.source_year ? `${official.source_year}-12` : null,
        note: "공정위 정보공개서 (프랜도어 업로드)",
      },
      honsa,
      official,
    };
  }
  return { resolved: { count: null, source: "unknown", as_of: null }, honsa, official };
}
