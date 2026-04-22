import "server-only";
import { createAdminClient } from "@/utils/supabase/admin";
import type { Angle } from "./types";

export type CanonicalRecord = {
  canonical_url: string;
  depth: "D0" | "D1" | "D2" | "D3";
  slug: string | null;
  industry: string | null;
  brand_id: string | null;
  payload: Record<string, unknown>;
  tiers: { A?: unknown[]; B?: unknown[]; C?: unknown[]; D?: unknown[] };
  facts_raw: { facts: unknown[]; deriveds?: unknown[] };
  json_ld: Record<string, unknown>[];
  generated_at: string;
};

export async function loadCanonical(sourceUrl: string): Promise<CanonicalRecord | null> {
  const supa = createAdminClient();
  const { data, error } = await supa
    .from("geo_canonical")
    .select("canonical_url, depth, slug, industry, brand_id, payload, tiers, facts_raw, json_ld, generated_at")
    .eq("canonical_url", sourceUrl)
    .maybeSingle();
  if (error) throw new Error(`canonical load failed: ${error.message}`);
  return (data as CanonicalRecord | null) ?? null;
}

export type AngleSubset = {
  headline: string;
  bullets: string[];
  metrics: Array<{ label: string; value: string | number; unit?: string; basis?: string }>;
  faqs: Array<{ q: string; a: string }>;
};

export function extractSubset(record: CanonicalRecord, angle: Angle): AngleSubset {
  const payload = record.payload as {
    kind: string;
    sections?: Array<{ heading: string; body: string }>;
    comparisonTable?: Array<Record<string, string | number>>;
    closure?: { headline?: string; bodyHtml?: string };
    faq25?: Array<{ q: string; a: string }>;
    frontmatter?: Record<string, unknown>;
    body?: string;
  };

  const tiersD = (record.tiers?.D as Array<{ label?: string; value?: number; unit?: string; basis?: string; key?: string }> | undefined) ?? [];
  const faqsAll = payload.faq25 ?? (Array.isArray((payload.frontmatter as { faq?: unknown })?.faq) ? (payload.frontmatter as { faq: Array<{ q: string; a: string }> }).faq : []);

  const pickMetricsByKeys = (keys: string[]) =>
    tiersD
      .filter((m) => m.key && keys.includes(m.key))
      .map((m) => ({
        label: m.label ?? m.key ?? "",
        value: m.value ?? 0,
        unit: m.unit,
        basis: m.basis,
      }));

  switch (angle) {
    case "invest-focus":
      return {
        headline: `${record.slug ?? "프랜차이즈"} 실투자금·투자회수 요약`,
        bullets: (payload.sections ?? []).slice(0, 3).map((s) => s.heading),
        metrics: pickMetricsByKeys(["real_invest", "payback", "net_margin"]),
        faqs: faqsAll.slice(0, 3),
      };
    case "closure-focus":
      return {
        headline: `${record.slug ?? "프랜차이즈"} 폐점·확장 리스크`,
        bullets: [payload.closure?.headline ?? "폐점 지표"].filter(Boolean) as string[],
        metrics: pickMetricsByKeys(["real_closure_rate", "net_expansion", "transfer_ratio"]),
        faqs: faqsAll.slice(0, 3),
      };
    case "compare-peer":
      return {
        headline: `${record.slug ?? "업종"} 내 비교`,
        bullets: (payload.comparisonTable ?? []).slice(0, 5).map((r) => Object.entries(r).map(([k, v]) => `${k}=${v}`).join(", ")),
        metrics: pickMetricsByKeys(["industry_position", "expansion_ratio"]),
        faqs: faqsAll.slice(0, 3),
      };
    case "faq-digest":
      return {
        headline: `${record.slug ?? record.industry ?? "FAQ"} 자주 묻는 질문`,
        bullets: [],
        metrics: [],
        faqs: faqsAll.slice(0, 10),
      };
    case "news-hook":
      return {
        headline: `${record.slug ?? "프랜차이즈"} 최근 이슈`,
        bullets: (payload.sections ?? []).slice(0, 2).map((s) => s.heading),
        metrics: pickMetricsByKeys(["real_closure_rate", "expansion_ratio"]),
        faqs: faqsAll.slice(0, 2),
      };
    case "industry-overview":
      return {
        headline: `${record.industry ?? record.slug ?? "업종"} 개요`,
        bullets: (payload.sections ?? []).slice(0, 4).map((s) => s.heading),
        metrics: tiersD.slice(0, 4).map((m) => ({ label: m.label ?? "", value: m.value ?? 0, unit: m.unit, basis: m.basis })),
        faqs: faqsAll.slice(0, 3),
      };
    case "top-n-list":
      return {
        headline: `${record.industry ?? record.slug ?? "프랜차이즈"} TOP`,
        bullets: (payload.comparisonTable ?? []).slice(0, 10).map((r) => Object.entries(r).map(([k, v]) => `${k}=${v}`).join(", ")),
        metrics: [],
        faqs: faqsAll.slice(0, 3),
      };
  }
}
