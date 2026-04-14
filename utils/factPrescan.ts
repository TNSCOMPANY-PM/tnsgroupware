export type Section = {
  content: string;
  hint: string;
  priority: number;
};

const FACT_PATTERNS = [
  /매출\s*[:：]?\s*[\d,]+/g,
  /가맹점\s*수\s*[:：]?\s*[\d,]+/g,
  /창업\s*비용|가맹비|보증금|교육비|인테리어비/g,
  /평\s*당|㎡\s*당/g,
  /로열티|수수료/g,
  /[\d,]+\s*(원|만원|억원|%)/g,
  /정보공개서|공정거래위원회/g,
  /폐점률|해지률|계약종료/g,
];

// Franchise disclosure document (정보공개서) standard section targeting
const FRANCHISE_DISCLOSURE_TARGETS = [
  { keyword: "가맹점 및 직영점 현황", priority: 10 },
  { keyword: "재무상황", priority: 10 },
  { keyword: "금전적 부담", priority: 10 },
  { keyword: "교육·훈련", priority: 9 },
  { keyword: "인테리어", priority: 9 },
  { keyword: "가맹점사업자 부담", priority: 8 },
  { keyword: "평균매출", priority: 10 },
  { keyword: "영업이익", priority: 10 },
  { keyword: "가맹금", priority: 10 },
  { keyword: "로열티", priority: 9 },
];

/**
 * Sliding window pre-scan: score each 2000-char window by pattern matches.
 * Returns top-scoring sections, merged if adjacent.
 */
export function prescanSections(fullText: string, maxTotalChars = 150000): Section[] {
  const WINDOW = 2000;
  const STEP = 1000;
  const scored: { start: number; end: number; score: number; hint: string }[] = [];

  for (let i = 0; i < fullText.length; i += STEP) {
    const window = fullText.slice(i, i + WINDOW);
    let score = 0;
    for (const pattern of FACT_PATTERNS) {
      pattern.lastIndex = 0;
      const matches = window.match(pattern);
      score += (matches?.length ?? 0);
    }
    if (score > 0) {
      // Extract hint from section headers near this window
      const headerMatch = window.match(/^(제\s*\d+\s*장|【[^】]+】|\[시트:[^\]]+\]|\d+\.\s+[가-힣][^\n]{0,30})/m);
      scored.push({ start: i, end: i + WINDOW, score, hint: headerMatch?.[0] ?? "" });
    }
  }

  // Sort by score desc, take top sections within budget
  scored.sort((a, b) => b.score - a.score);

  const sections: Section[] = [];
  let totalChars = 0;
  const used = new Set<number>();

  for (const s of scored) {
    if (totalChars >= maxTotalChars) break;
    // Skip if overlapping with already selected
    if (used.has(Math.floor(s.start / STEP))) continue;

    const content = fullText.slice(s.start, s.end);
    sections.push({ content, hint: s.hint, priority: s.score });
    totalChars += content.length;
    used.add(Math.floor(s.start / STEP));
  }

  // Sort by position (preserve document order)
  sections.sort((a, b) => {
    const aIdx = fullText.indexOf(a.content.slice(0, 50));
    const bIdx = fullText.indexOf(b.content.slice(0, 50));
    return aIdx - bIdx;
  });

  return sections;
}

/**
 * For franchise disclosure documents: extract sections by standard TOC keywords.
 */
export function extractByFranchiseTargets(fullText: string): Section[] {
  const sections: Section[] = [];

  for (const target of FRANCHISE_DISCLOSURE_TARGETS) {
    const idx = fullText.indexOf(target.keyword);
    if (idx < 0) continue;

    // Extract from keyword to next major section or 10k chars
    const start = Math.max(0, idx - 200);
    let end = start + 10000;

    // Try to find next section boundary
    const remaining = fullText.slice(idx + target.keyword.length);
    const nextSection = remaining.match(/\n(제\s*\d+|【|Ⅰ|Ⅱ|Ⅲ|Ⅳ|Ⅴ|Ⅵ)/);
    if (nextSection && nextSection.index && nextSection.index < 10000) {
      end = idx + target.keyword.length + nextSection.index;
    }

    sections.push({
      content: fullText.slice(start, end),
      hint: target.keyword,
      priority: target.priority,
    });
  }

  return sections;
}

/**
 * Merge two sets of sections, respecting maxChars budget.
 * Higher priority sections come first.
 */
export function mergeSections(a: Section[], b: Section[], maxChars: number): Section[] {
  const all = [...a, ...b].sort((x, y) => y.priority - x.priority);
  const result: Section[] = [];
  let total = 0;

  for (const s of all) {
    if (total + s.content.length > maxChars) continue;
    // Skip near-duplicates
    if (result.some(r => r.content.slice(0, 100) === s.content.slice(0, 100))) continue;
    result.push(s);
    total += s.content.length;
  }

  return result;
}

/**
 * Detect if text is likely a franchise disclosure document.
 */
export function detectMode(fullText: string, sourceName: string): "disclosure" | "generic" {
  const disclosureKeywords = ["정보공개서", "가맹사업거래", "공정거래위원회", "가맹본부"];
  const score = disclosureKeywords.filter(k => fullText.includes(k)).length;
  if (score >= 2) return "disclosure";
  if (/정보공개서|fdd/i.test(sourceName)) return "disclosure";
  return "generic";
}
