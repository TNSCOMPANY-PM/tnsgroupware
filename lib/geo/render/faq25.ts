import type { FaqItem, Depth } from "@/lib/geo/types";

export function normalizeFaqs(depth: Depth, raw: unknown): FaqItem[] {
  const list = Array.isArray(raw)
    ? (raw as Array<{ q?: unknown; a?: unknown }>).map((r) => ({
        q: String(r.q ?? ""),
        a: String(r.a ?? ""),
      }))
    : [];
  const target = depth === "D3" ? 10 : 5;
  const filtered = list.filter((f) => f.q.trim().length > 0 && f.a.trim().length > 0);
  return filtered.slice(0, target);
}

export function faqMinRequired(depth: Depth): number {
  return depth === "D3" ? 10 : 5;
}
