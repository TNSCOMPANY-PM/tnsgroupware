import type { GeoPayloadIndustry, IndustrySection, Row } from "@/lib/geo/types";

type SectionInput = { heading?: unknown; body?: unknown };

export function assembleIndustryDoc(raw: unknown): GeoPayloadIndustry {
  const obj = (raw as Record<string, unknown>) ?? {};
  const sectionsRaw = Array.isArray(obj.sections) ? (obj.sections as SectionInput[]) : [];
  const sections: IndustrySection[] = sectionsRaw
    .map((s) => ({ heading: String(s.heading ?? ""), body: String(s.body ?? "") }))
    .filter((s) => s.heading && s.body);

  const tableRaw = Array.isArray(obj.comparisonTable) ? (obj.comparisonTable as Row[]) : [];
  const comparisonTable: Row[] = tableRaw.map((r) => {
    const row: Row = {};
    for (const [k, v] of Object.entries(r)) {
      if (typeof v === "string" || typeof v === "number") row[k] = v;
    }
    return row;
  });

  return { kind: "industryDoc", sections, comparisonTable };
}
