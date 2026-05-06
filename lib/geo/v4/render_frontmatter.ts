/**
 * v4-13 — frontmatter YAML 직렬화 + FAQ markdown 섹션.
 * Sonnet writer 본문과 합쳐서 final markdown 생성.
 */
import type { Frontmatter } from "./build_frontmatter";
import type { FaqItem } from "./build_faq";

export function renderFrontmatterYaml(fm: Frontmatter, faq: FaqItem[]): string {
  const lines: string[] = ["---"];
  lines.push(`title: "${escapeYaml(fm.title)}"`);
  lines.push(`description: "${escapeYaml(fm.description)}"`);
  lines.push(`slug: "${fm.slug}"`);
  lines.push(`category: "${fm.category}"`);
  lines.push(`date: "${fm.date}"`);
  lines.push(`dateModified: "${fm.dateModified}"`);
  lines.push(`tags: [${fm.tags.map((t) => `"${escapeYaml(t)}"`).join(", ")}]`);
  // v4-22~25 — Step 4 (썸네일) 가 채운 thumbnail 이 있으면 emit (frandoor 표준 키).
  if (fm.thumbnail) {
    lines.push(`thumbnail: "${escapeYaml(fm.thumbnail)}"`);
  }
  lines.push("faq:");
  for (const f of faq) {
    lines.push(`  - q: "${escapeYaml(f.q)}"`);
    lines.push(`    a: "${escapeYaml(f.a)}"`);
  }
  lines.push("---");
  return lines.join("\n");
}

export function renderFaqBlock(faq: FaqItem[]): string {
  const lines: string[] = ["## FAQ (5문항)", ""];
  for (const f of faq) {
    lines.push(`**Q. ${f.q}**`);
    lines.push("");
    lines.push(`A. ${f.a}`);
    lines.push("");
  }
  return lines.join("\n").trimEnd();
}

function escapeYaml(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\n/g, " ").replace(/\r/g, "");
}
