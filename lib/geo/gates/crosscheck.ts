import type { GptFacts } from "@/lib/geo/schema";
import type { Depth, CrossCheckResult } from "@/lib/geo/types";

const NUM_RE = /[\d]{1,3}(?:,\d{3})+(?:\.\d+)?|\d+(?:\.\d+)?/gu;
const UNIT_SUFFIX = /(?:회|명|개|원|%|점|억|만|천|년|월|일)/u;
const IGNORE_CONTEXT = /(순위|제\s*\d|\d+위|TOP\s*\d|\d{4}년\s*\d{1,2}월|\d{4}-\d{2}|\d{4}년|목차|차례|H[1-6]|표\s*\d|그림\s*\d|\([^)]*출처[^)]*\)|frandoor\s*산출|계산식|[×x\*/÷]\s*100\b|\b100\s*[×x\*/÷]|=\s*\*{0,2}\s*\d|^\d+\.|\s\d+\.\s|\s\d+\)\s|^\s*\*\s|^\s*-\s|[a-zA-Z-]+\s*:\s*[\d.]+(?:px|em|rem|%|pt|vh|vw)?|style\s*=|\*\*\s*\d+\.|#[0-9a-fA-F]{3,8}|\|\s*\d{4}\s*\||\|\s*\d+\s*\||\d+\s*개월(?:간|\s*이상|\s*이내)?|\d+\s*일\s*(?:이상|이내|간|\s*숙려|\s*기간|\s*사전|\s*제공|\s*이전|\s*이후|\s*전)|\d+\s*곳\s*중|\(\s*\d+\s*(?:일|개월|년)\s*\)|숙려\s*기간|사전\s*제공|\d+\s*차|\d+\s*호|Tier\s*[A-D]|\d+\s*[~\-]\s*\d+\s*평|\d+\s*평(?:형|대)?|\d+\s*대\s*(?:핵심|지표|요소|과제|원칙|전략|키워드|카테고리)|\d+\s*단계|\d+\s*가지)/u;

function normalize(s: string): string {
  return s.replace(/,/g, "").trim();
}

function addNum(set: Set<string>, raw: string | number) {
  const str = String(raw);
  const matches = str.match(NUM_RE) ?? [];
  for (const m of matches) {
    const n = normalize(m);
    set.add(n);
    const num = Number(n);
    if (!isNaN(num)) set.add(String(num));
  }
}

function buildAllowedPool(facts: GptFacts): Set<string> {
  const pool = new Set<string>();
  for (const f of facts.facts) {
    addNum(pool, f.value);
    if (f.year_month) addNum(pool, f.year_month);
  }
  for (const d of facts.deriveds ?? []) {
    addNum(pool, d.value);
    if (d.period) addNum(pool, d.period);
    for (const v of Object.values(d.inputs)) {
      if (typeof v === "number" || typeof v === "string") addNum(pool, v);
    }
  }
  return pool;
}

export function numberCrossCheck(body: string, facts: GptFacts): CrossCheckResult {
  const pool = buildAllowedPool(facts);
  const unmatched: string[] = [];
  let matched = 0;

  const regex = new RegExp(`(${NUM_RE.source})\\s*(?:${UNIT_SUFFIX.source})?`, "gu");
  for (const m of body.matchAll(regex)) {
    const raw = m[1];
    const ctxStart = Math.max(0, (m.index ?? 0) - 8);
    const ctxEnd = Math.min(body.length, (m.index ?? 0) + raw.length + 8);
    const ctx = body.slice(ctxStart, ctxEnd);
    if (IGNORE_CONTEXT.test(ctx)) continue;

    const n = Number(normalize(raw));
    if (isNaN(n) || n <= 1) continue;

    const key = normalize(raw);
    if (pool.has(key) || pool.has(String(n))) {
      matched++;
    } else {
      unmatched.push(`${raw} (ctx: ${ctx.replace(/\s+/g, " ")})`);
    }
  }
  return { ok: unmatched.length === 0, unmatched, matchedCount: matched };
}

/**
 * depth별 strict 수준:
 *  - D0/D1/D2: advisory (로그 반환용, throw 없음)
 *  - D3      : strict (throw 가능한 레벨, ok=false면 호출자가 차단)
 */
export function crosscheckForDepth(
  depth: Depth,
  body: string,
  facts: GptFacts,
): CrossCheckResult & { strict: boolean } {
  const base = numberCrossCheck(body, facts);
  const strict = depth === "D3";
  return { ...base, strict };
}
