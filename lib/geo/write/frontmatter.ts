/**
 * PR047 — 가이드 표준 frontmatter 빌더.
 * 출력: YAML frontmatter 문자열 ("---\n...\n---\n").
 *
 * 강제 필드: title / description / slug / category / date / faq.
 * 권장 필드: tags (3개), thumbnail (선택).
 */

import { toSlug } from "@/lib/format/romanize";
import { formatManwon } from "@/lib/format/manwon";
import type { Fact, DerivedMetric, FaqItem } from "@/lib/geo/types";
import type { TitleCandidate } from "./titler";

export type Frontmatter = {
  title: string;
  description: string;
  slug: string;
  category: string;
  date: string;
  tags: string[];
  thumbnail?: string;
  faq: FaqItem[];
};

type FactLite = Pick<Fact, "fact_key" | "value" | "unit" | "source_tier">;

function num(v: string | number | null | undefined): number | null {
  if (v == null) return null;
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  const n = Number(String(v).replace(/[,\s만원%개건배호점]/g, ""));
  return Number.isFinite(n) ? n : null;
}

function pickByKey(facts: FactLite[], key: string, tier?: "A" | "B" | "C"): FactLite | null {
  return facts.find((f) => f.fact_key === key && (!tier || f.source_tier === tier)) ?? null;
}

function truncate(s: string, max: number): string {
  if (s.length <= max) return s;
  return s.slice(0, Math.max(0, max - 1)).trimEnd() + "…";
}

function pickCategory(opts: {
  topic?: string | null;
  titlePattern?: TitleCandidate["pattern"] | null;
}): string {
  const t = opts.topic ?? "";
  if (/창업비용|투자금|비용/.test(t) || opts.titlePattern === "cost-hook") return "창업비용";
  if (/매출|수익/.test(t) || opts.titlePattern === "revenue-hook") return "매출분석";
  if (opts.titlePattern === "closure-hook") return "폐점·리스크";
  if (opts.titlePattern === "expansion-hook" || opts.titlePattern === "compare-hook") return "브랜드 분석";
  return "브랜드 분석";
}

function pickTags(opts: {
  brand: string;
  industry?: string | null;
  titlePattern?: TitleCandidate["pattern"] | null;
}): string[] {
  const tags: string[] = [opts.brand];
  if (opts.industry) tags.push(`${opts.industry} 프랜차이즈`);
  const patternKw: Record<TitleCandidate["pattern"], string> = {
    "cost-hook": "창업비용",
    "expansion-hook": "가맹점 확장",
    "revenue-hook": "월매출",
    "closure-hook": "폐점률",
    "compare-hook": "공정위 비교",
  };
  if (opts.titlePattern && patternKw[opts.titlePattern]) tags.push(patternKw[opts.titlePattern]);
  return Array.from(new Set(tags)).slice(0, 5);
}

function buildSlug(opts: {
  brand: string;
  pattern: TitleCandidate["pattern"] | null;
  year: string;
  brandId?: string;
}): string {
  const brandSlug = toSlug(opts.brand) || `brand-${(opts.brandId ?? "").slice(0, 6)}`;
  const yr = opts.year || new Date().getFullYear().toString();
  const map: Record<TitleCandidate["pattern"], string> = {
    "cost-hook": `${brandSlug}-startup-cost-${yr}`,
    "expansion-hook": `${brandSlug}-frcs-growth-${yr}`,
    "revenue-hook": `${brandSlug}-revenue-${yr}`,
    "closure-hook": `${brandSlug}-closure-${yr}`,
    "compare-hook": `${brandSlug}-${yr}-comparison`,
  };
  const slug = opts.pattern ? map[opts.pattern] : `${brandSlug}-${yr}`;
  return toSlug(slug);
}

function buildDescription(opts: {
  brand: string;
  facts: FactLite[];
  deriveds: DerivedMetric[];
}): string {
  const { brand, facts, deriveds } = opts;
  const aStores = pickByKey(facts, "frcs_cnt", "A");
  const cStores = pickByKey(facts, "frcs_cnt", "C");
  const frcsGrowth = deriveds.find((d) => d.key === "frcs_growth")?.value ?? null;
  if (aStores && cStores && frcsGrowth != null) {
    const aN = num(aStores.value);
    const cN = num(cStores.value);
    const sign = frcsGrowth > 0 ? "+" : "";
    return truncate(
      `공정위 정보공개서 기준 ${aN}개에서 본사 발표 ${cN}호점까지, ${brand}의 가맹점 추세를 공정위·본사 자료로 비교 정리했습니다 (${sign}${frcsGrowth}개 변동).`,
      100,
    );
  }
  const cost = num(pickByKey(facts, "docx_cost_total", "A")?.value);
  const rev = num(pickByKey(facts, "docx_avg_monthly_revenue", "A")?.value);
  if (cost != null && rev != null) {
    return truncate(
      `${brand} 창업비용 ${formatManwon(cost)}, 가맹점당 월평균매출 ${formatManwon(rev)} 등 공정위 자료 기반 핵심 수치 정리.`,
      100,
    );
  }
  return truncate(`${brand} 공개 자료(공정위 정보공개서·본사 발표) 핵심 수치 정리.`, 100);
}

function yamlEscape(s: string): string {
  // 따옴표·콜론·해시·@·! 등이 들어가면 큰따옴표로 래핑하고 내부 따옴표 escape.
  if (s === "") return '""';
  if (/^[A-Za-z0-9가-힣 ./_+()%·,—\-]+$/.test(s) && !/^[\-?:&*!|>'"%@`]/.test(s)) {
    // 단순 plain scalar 가능, 그러나 안전하게 따옴표로 래핑.
  }
  return `"${s.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

function indent(s: string, n: number): string {
  const pad = " ".repeat(n);
  return s
    .split("\n")
    .map((ln) => (ln.length > 0 ? pad + ln : ln))
    .join("\n");
}

function renderYamlFaq(items: FaqItem[]): string {
  // YAML literal block scalar 사용. 멀티라인 답변 안전하게 처리.
  if (items.length === 0) return "[]";
  const lines = ["faq:"];
  for (const it of items) {
    const q = yamlEscape(it.q.trim());
    const aRaw = it.a.trim();
    if (aRaw.includes("\n")) {
      lines.push(`  - q: ${q}`);
      lines.push(`    a: |`);
      lines.push(indent(aRaw, 6));
    } else {
      lines.push(`  - q: ${q}`);
      lines.push(`    a: ${yamlEscape(aRaw)}`);
    }
  }
  return lines.join("\n");
}

export function buildFrontmatter(input: {
  brand: string;
  brandId?: string;
  topic?: string | null;
  facts: Fact[];
  deriveds: DerivedMetric[];
  faqs: FaqItem[];
  industry?: string | null;
  thumbnailUrl?: string | null;
  suggestedTitle: string | null;
  suggestedTitlePattern: TitleCandidate["pattern"] | null;
  year?: string | null;
  date?: string;
}): Frontmatter {
  const yr = input.year ?? String(new Date().getFullYear());
  const title = input.suggestedTitle ?? `${input.brand} ${yr} 자료 정리`;
  const description = buildDescription({
    brand: input.brand,
    facts: input.facts,
    deriveds: input.deriveds,
  });
  const slug = buildSlug({
    brand: input.brand,
    pattern: input.suggestedTitlePattern,
    year: yr,
    brandId: input.brandId,
  });
  const category = pickCategory({ topic: input.topic, titlePattern: input.suggestedTitlePattern });
  const tags = pickTags({
    brand: input.brand,
    industry: input.industry,
    titlePattern: input.suggestedTitlePattern,
  });
  const date = input.date ?? new Date().toISOString().slice(0, 10);
  const faq = input.faqs.slice(0, 5);
  const fm: Frontmatter = { title, description, slug, category, date, tags, faq };
  if (input.thumbnailUrl) fm.thumbnail = input.thumbnailUrl;
  return fm;
}

export function renderFrontmatterYaml(fm: Frontmatter): string {
  const lines: string[] = ["---"];
  lines.push(`title: ${yamlEscape(fm.title)}`);
  lines.push(`description: ${yamlEscape(fm.description)}`);
  lines.push(`slug: ${yamlEscape(fm.slug)}`);
  lines.push(`category: ${yamlEscape(fm.category)}`);
  lines.push(`date: ${yamlEscape(fm.date)}`);
  lines.push(`tags:`);
  for (const t of fm.tags) {
    lines.push(`  - ${yamlEscape(t)}`);
  }
  if (fm.thumbnail) {
    lines.push(`thumbnail: ${yamlEscape(fm.thumbnail)}`);
  }
  lines.push(renderYamlFaq(fm.faq));
  lines.push("---");
  lines.push("");
  return lines.join("\n");
}
