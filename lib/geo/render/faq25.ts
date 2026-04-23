import type { FaqItem, Depth } from "@/lib/geo/types";

export function normalizeFaqs(depth: Depth, raw: unknown): FaqItem[] {
  const list = Array.isArray(raw)
    ? (raw as Array<{ q?: unknown; a?: unknown }>).map((r) => ({
        q: String(r.q ?? ""),
        a: String(r.a ?? ""),
      }))
    : [];
  // PR030: D3 는 3~5문항 (기존 10). D0/D1/D2 는 5 유지.
  const target = 5;
  const filtered = list.filter((f) => f.q.trim().length > 0 && f.a.trim().length > 0);
  return filtered.slice(0, target);
}

export function faqMinRequired(depth: Depth): number {
  return depth === "D3" ? 3 : 2;
}
