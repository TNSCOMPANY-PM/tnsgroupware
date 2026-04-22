import type { GptFacts } from "@/lib/geo/schema";
import type { Depth, CrossCheckResult } from "@/lib/geo/types";

const NUM_RE = /[\d]{1,3}(?:,\d{3})+(?:\.\d+)?|\d+(?:\.\d+)?/gu;
const UNIT_SUFFIX = /(?:회|명|개|원|%|점|억|만|천|년|월|일)/u;
const IGNORE_CONTEXT = /(순위|제\s*\d|\d+위|TOP\s*\d|\d{4}년\s*\d{1,2}월|\d{4}-\d{2}|\d{4}년|목차|차례|H[1-6]|표\s*\d|그림\s*\d|\([^)]*출처[^)]*\)|frandoor\s*산출|계산식|^\d+\.|\s\d+\.\s|\s\d+\)\s|^\s*\*\s|^\s*-\s)/u;

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
  for (const f of facts.facts) addNum(pool, f.value);
  for (const d of facts.deriveds ?? []) {
    addNum(pool, d.value);
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
