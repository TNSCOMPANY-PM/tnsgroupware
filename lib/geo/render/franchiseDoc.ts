import type {
  GeoPayloadFranchise,
  FranchiseSection,
  Closure,
  DerivedMetric,
  FaqItem,
} from "@/lib/geo/types";

type SectionInput = { heading?: unknown; body?: unknown };
type ClosureInput = { headline?: unknown; bodyHtml?: unknown; metrics?: unknown };

function sanitizeSections(raw: unknown): FranchiseSection[] {
  const arr = Array.isArray(raw) ? (raw as SectionInput[]) : [];
  return arr
    .map((s) => ({ heading: String(s.heading ?? ""), body: String(s.body ?? "") }))
    .filter((s) => s.heading && s.body);
}

function sanitizeClosure(raw: unknown, derivedsFallback: DerivedMetric[]): Closure {
  const c = (raw as ClosureInput) ?? {};
  const headline = String(c.headline ?? "실질 폐점률");
  const bodyHtml = String(c.bodyHtml ?? "");
  const metricsArr = Array.isArray(c.metrics) ? (c.metrics as DerivedMetric[]) : [];
  const metrics = metricsArr.length > 0 ? metricsArr : derivedsFallback.filter((d) => d.key === "real_closure_rate" || d.key === "net_expansion");
  return { headline, bodyHtml, metrics };
}

export function assembleFranchiseDoc(raw: unknown, faqs: FaqItem[], deriveds: DerivedMetric[]): GeoPayloadFranchise {
  const obj = (raw as Record<string, unknown>) ?? {};
  const sections = sanitizeSections(obj.sections);
  const closure = sanitizeClosure(obj.closure, deriveds);
  const rawMeta = (obj.meta as Record<string, unknown>) ?? {};
  const asStr = (v: unknown): string | undefined => (typeof v === "string" ? v : undefined);
  const tagsRaw = Array.isArray(rawMeta.tags) ? (rawMeta.tags as unknown[]) : [];
  const tags = tagsRaw.map(asStr).filter((x): x is string => Boolean(x));
  const meta = {
    title: asStr(rawMeta.title),
    description: asStr(rawMeta.description),
    brand: asStr(rawMeta.brand),
    brandId: asStr(rawMeta.brandId),
    period: asStr(rawMeta.period),
    tags,
  };
  return { kind: "franchiseDoc", sections, closure, faq25: faqs, meta };
}
