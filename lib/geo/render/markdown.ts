import { generate as buildFrontmatter } from "@/utils/frandoor-frontmatter";
import type { GeoPayloadMarkdown } from "@/lib/geo/types";

// D0/D1 전용 Markdown 조립. Sonnet이 반환한 frontmatter dict + body 를 최종 .md 문자열로.
export function assembleMarkdown(
  frontmatter: Record<string, unknown>,
  body: string,
  opts: { canonicalUrl: string; dataCollectedAt?: string; extraSources?: string[] },
): { md: string; payload: GeoPayloadMarkdown } {
  const fm = { ...frontmatter };
  // canonical URL 필드 보강
  fm.canonicalUrl = fm.canonicalUrl ?? opts.canonicalUrl;

  const existingSources = Array.isArray(fm.sources) ? (fm.sources as string[]) : [];
  const sources = Array.from(new Set([...(existingSources ?? []), ...(opts.extraSources ?? [])])).slice(0, 5);

  const yamlFront = buildFrontmatter({
    title: String(fm.title ?? ""),
    description: String(fm.description ?? ""),
    slug: fm.slug ? String(fm.slug) : undefined,
    category: String(fm.category ?? ""),
    date: String(fm.date ?? new Date().toISOString().slice(0, 10)),
    dateModified: fm.dateModified ? String(fm.dateModified) : undefined,
    author: fm.author ? String(fm.author) : undefined,
    tags: Array.isArray(fm.tags) ? (fm.tags as string[]) : [],
    thumbnail: String(fm.thumbnail ?? ""),
    sources: sources.length > 0 ? sources : undefined,
    measurement_notes: fm.measurement_notes ? String(fm.measurement_notes) : undefined,
    faq: Array.isArray(fm.faq)
      ? (fm.faq as Array<{ q: string; a: string }>)
      : [],
    data_collected_at: opts.dataCollectedAt,
  });

  const md = `${yamlFront}\n\n${body.trim()}\n`;

  return {
    md,
    payload: { kind: "markdown", frontmatter: fm, body },
  };
}
