export interface FrandoorFrontmatterOpts {
  title: string;
  description: string;
  slug?: string;
  category: string;
  date: string;
  dateModified?: string;
  author?: string;
  tags: string[];
  thumbnail: string;
  sources?: string[];
  measurement_notes?: string;
  faq: Array<{ q: string; a: string }>;
  reviewed_by?: string;
  data_collected_at?: string;
}

function yaml(str: string): string {
  if (/[:#\[\]{}&*!|>'"\n%`]/.test(str)) {
    return JSON.stringify(str);
  }
  return `"${str.replace(/"/g, '\\"')}"`;
}

export function generate(opts: FrandoorFrontmatterOpts): string {
  if (!opts.title || opts.title.length < 5) throw new Error("frontmatter: title 필수/너무 짧음");
  if (!opts.description) throw new Error("frontmatter: description 필수");
  if (!opts.category) throw new Error("frontmatter: category 필수");
  if (!opts.date) throw new Error("frontmatter: date 필수");
  if (!opts.tags || opts.tags.length === 0) throw new Error("frontmatter: tags 필수");
  if (!opts.thumbnail) throw new Error("frontmatter: thumbnail 필수");
  if (!opts.thumbnail.startsWith("/images/")) {
    throw new Error("frontmatter: thumbnail은 /images/ 상대경로만 허용 (외부 URL 금지)");
  }
  if (!opts.faq || opts.faq.length < 2) throw new Error("frontmatter: faq ≥ 2 필수");
  if (opts.slug && !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(opts.slug)) {
    throw new Error("frontmatter: slug는 영어 소문자+하이픈만 허용");
  }

  const lines: string[] = ["---"];
  lines.push(`title: ${yaml(opts.title)}`);
  lines.push(`description: ${yaml(opts.description)}`);
  if (opts.slug) lines.push(`slug: ${yaml(opts.slug)}`);
  lines.push(`category: ${yaml(opts.category)}`);
  lines.push(`date: ${yaml(opts.date)}`);
  lines.push(`dateModified: ${yaml(opts.dateModified ?? opts.date)}`);
  lines.push(`author: ${yaml(opts.author ?? "프랜도어 편집팀")}`);
  if (opts.reviewed_by) lines.push(`reviewed_by: ${yaml(opts.reviewed_by)}`);
  if (opts.data_collected_at) lines.push(`data_collected_at: ${yaml(opts.data_collected_at)}`);
  lines.push(`tags: [${opts.tags.map(yaml).join(", ")}]`);
  lines.push(`thumbnail: ${yaml(opts.thumbnail)}`);
  if (opts.sources && opts.sources.length > 0) {
    lines.push("sources:");
    for (const s of opts.sources) lines.push(`  - ${yaml(s)}`);
  }
  if (opts.measurement_notes) lines.push(`measurement_notes: ${yaml(opts.measurement_notes)}`);
  lines.push("faq:");
  for (const f of opts.faq) {
    lines.push(`  - q: ${yaml(f.q)}`);
    lines.push(`    a: ${yaml(f.a)}`);
  }
  lines.push("---");
  return lines.join("\n");
}
