import "server-only";
import type { GeoInput, DerivedMetric } from "@/lib/geo/types";
import { prefetchOfficial } from "@/lib/geo/prefetch/official";
import { computeAll, type FtcFact } from "@/lib/geo/metrics/derived";
import { matrixCheck } from "@/lib/geo/gates/matrix";
import { fetchFrandoorBrandFact, type FrandoorFact } from "@/lib/geo/prefetch/frandoorDb";

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
  ftcFact: (FtcFact & { isFirstYear?: boolean }) | null;
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

  // Tier D 파생지표는 FTC 브랜드 fact 가 확보된 D3 에서만 실제 계산
  let deriveds: DerivedMetric[] = [];
  let ftcFact: (FtcFact & { isFirstYear?: boolean }) | null = null;
  if (input.depth === "D3" && pre.raw.ftc?.ok && pre.raw.ftc.raw) {
    const raw = pre.raw.ftc.raw as Record<string, unknown>;
    ftcFact = {
      yr: String(raw.yr ?? new Date().getFullYear() - 1),
      brandNm: String(raw.brandNm ?? input.brand),
      corpNm: String(raw.corpNm ?? ""),
      indutyLclasNm: String(raw.indutyLclasNm ?? ""),
      indutyMlsfcNm: String(raw.indutyMlsfcNm ?? ""),
      frcsCnt: Number(raw.frcsCnt ?? 0),
      newFrcsRgsCnt: Number(raw.newFrcsRgsCnt ?? 0),
      ctrtEndCnt: Number(raw.ctrtEndCnt ?? 0),
      ctrtCncltnCnt: Number(raw.ctrtCncltnCnt ?? 0),
      nmChgCnt: Number(raw.nmChgCnt ?? 0),
      avrgSlsAmt: Number(raw.avrgSlsAmt ?? 0),
      arUnitAvrgSlsAmt: Number(raw.arUnitAvrgSlsAmt ?? 0),
      isFirstYear: raw.isFirstYear === true,
    };
    deriveds = computeAll(ftcFact, { industryAvg: pre.raw.kosis ?? null });
  }

  return { block: pre.block, sources: pre.sources, deriveds, ftcFact };
}

export type ResolvedStores = {
  count: number | null;
  source: "C_honsa_pos" | "B_frandoor_docx" | "A_ftc" | "A_ftc_first_year" | "unknown";
  as_of: string | null;
  note?: string;
};

/** geo_brands.fact_data 배열에서 __official_data__.stores_total 추출 (docx 수작업 누적). */
function readDocxStoresTotal(factData: unknown): { count: number; yr: string | null } | null {
  if (!Array.isArray(factData)) return null;
  const entry = factData.find(
    (x): x is { label?: unknown; keyword?: unknown } =>
      typeof x === "object" && x !== null && (x as Record<string, unknown>).label === "__official_data__",
  );
  const raw = entry?.keyword;
  if (typeof raw !== "string") return null;
  try {
    const obj = JSON.parse(raw) as Record<string, unknown>;
    const c = typeof obj.stores_total === "number" ? obj.stores_total : null;
    const yr = typeof obj.source_year === "string" ? obj.source_year : null;
    if (c == null || c <= 0) return null;
    return { count: c, yr };
  } catch {
    return null;
  }
}

/** stores_latest fallback — C(본사 POS) > B(frandoor docx 수작업) > A(공정위) > unknown. */
export async function resolveStoresLatest(
  brandId: string | undefined,
  ftcFact: (FtcFact & { isFirstYear?: boolean }) | null,
  brandRow?: { fact_data?: unknown } | null,
): Promise<{ resolved: ResolvedStores; honsa: FrandoorFact | null }> {
  const honsa = brandId ? await fetchFrandoorBrandFact(brandId) : null;
  if (honsa?.stores_latest != null) {
    return {
      resolved: {
        count: honsa.stores_latest,
        source: "C_honsa_pos",
        as_of: honsa.stores_latest_as_of ?? null,
      },
      honsa,
    };
  }
  // B (사실상 A급 수작업 추출, 공정위 원문 기반): docx/fact_data 내 __official_data__.stores_total
  const docxStores = readDocxStoresTotal(brandRow?.fact_data);
  if (docxStores) {
    return {
      resolved: {
        count: docxStores.count,
        source: "B_frandoor_docx",
        as_of: docxStores.yr ? `${docxStores.yr}-12` : null,
        note: "docx 수작업 추출",
      },
      honsa,
    };
  }
  // A: FTC OpenAPI. 최초 등록 해는 별도 플래그 (현 운영수 아님 주의).
  if (ftcFact?.frcsCnt != null && ftcFact.frcsCnt > 0) {
    const isFirst = ftcFact.isFirstYear === true;
    return {
      resolved: {
        count: ftcFact.frcsCnt,
        source: isFirst ? "A_ftc_first_year" : "A_ftc",
        as_of: ftcFact.yr ? `${ftcFact.yr}-12` : null,
        note: isFirst ? "최초등록 시점, 현 운영수 아님" : undefined,
      },
      honsa,
    };
  }
  return { resolved: { count: null, source: "unknown", as_of: null }, honsa };
}
