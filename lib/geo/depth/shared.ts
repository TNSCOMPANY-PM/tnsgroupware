import "server-only";
import type { GeoInput, DerivedMetric } from "@/lib/geo/types";
import { prefetchOfficial } from "@/lib/geo/prefetch/official";
import { computeAll, type FtcFact } from "@/lib/geo/metrics/derived";
import { matrixCheck } from "@/lib/geo/gates/matrix";

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
  ftcFact: FtcFact | null;
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
  let ftcFact: FtcFact | null = null;
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
    };
    deriveds = computeAll(ftcFact, { industryAvg: pre.raw.kosis ?? null });
  }

  return { block: pre.block, sources: pre.sources, deriveds, ftcFact };
}
