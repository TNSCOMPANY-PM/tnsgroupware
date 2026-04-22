import type { GptFacts } from "@/lib/generators/A/schema";

export interface CrossCheckResult {
  ok: boolean;
  unmatched: string[];
  matchedCount: number;
}

const NUM_RE = /[\d]{1,3}(?:,\d{3})+(?:\.\d+)?|\d+(?:\.\d+)?/gu;
const UNIT_SUFFIX = /(?:회|명|개|원|%|점|억|만|천|년|월|일)/u;

function normalize(s: string): string {
  return s.replace(/,/g, "").trim();
}

function buildFactSet(facts: GptFacts): Set<string> {
  const out = new Set<string>();
  for (const f of facts.facts) {
    const v = typeof f.value === "number" ? f.value.toString() : String(f.value);
    const matches = v.match(NUM_RE) ?? [];
    for (const m of matches) {
      out.add(normalize(m));
      const n = Number(normalize(m));
      if (!isNaN(n)) out.add(String(n));
    }
  }
  return out;
}

const IGNORE_CONTEXT = /(순위|제\s*\d|\d+위|TOP\s*\d|\d{4}년\s*\d{1,2}월|\d{4}-\d{2}|\d{4}년)/u;

export function numberCrossCheck(body: string, facts: GptFacts): CrossCheckResult {
  const factSet = buildFactSet(facts);
  const unmatched: string[] = [];
  let matched = 0;

  const regex = new RegExp(`(${NUM_RE.source})\\s*(?:${UNIT_SUFFIX.source})?`, "gu");
  for (const m of body.matchAll(regex)) {
    const raw = m[1];
    const ctxStart = Math.max(0, (m.index ?? 0) - 6);
    const ctxEnd = Math.min(body.length, (m.index ?? 0) + raw.length + 6);
    const ctx = body.slice(ctxStart, ctxEnd);
    if (IGNORE_CONTEXT.test(ctx)) continue;

    const n = Number(normalize(raw));
    if (isNaN(n) || n <= 1) continue;

    const key = normalize(raw);
    if (factSet.has(key) || factSet.has(String(n))) {
      matched++;
    } else {
      unmatched.push(`${raw} (ctx: ${ctx.replace(/\s+/g, " ")})`);
    }
  }

  return { ok: unmatched.length === 0, unmatched, matchedCount: matched };
}
