/**
 * v4 crosscheck — raw 데이터 (ftc_row + docx_facts.value_num/value_text + industry_facts)
 * 으로부터 allowedNumbers 빌드 후 본문 numeric token 매칭.
 * v4-02: docx_markdown (raw markdown) 폐기 → docx_facts (정제 facts).
 */

import { normalizeKoreanNumbers } from "../v3/crosscheck";

const NUMBER_RE = /[\d]{1,3}(?:,\d{3})+(?:\.\d+)?|\d+(?:\.\d+)?/g;

const PERCENTILE_NOTATION = /\bp\d{1,2}(?:\s*\(|\s*기준|\s*수준|\s*평균|\s*값|\s*이상|\s*이하|\s*초과|\s*미달|\s*미만)?/i;
const AGG_METHOD_NEAR = /(?:중앙값|median|p25|p50|p75|p90|p95|평균|trimmed[_\s-]?mean)/i;

const IGNORE_CONTEXT_PATTERNS: RegExp[] = [
  /\d{4}-\d{2}-\d{2}/,
  /등록일|발행일|기준일|작성일|생성일/,
  /순위|TOP\s*\d|상위\s*\d|하위\s*\d|\d+\s*위/i,
  /\d+\s*(?:일|시간|분|초)\b/,
  /\d+\s*%p\b/,
];

const SKIP_AFTER_NUMBER = /^\s*(?:배|%p)/;

function normalizeNum(s: string): string {
  return s.replace(/,/g, "");
}

function stripFrontmatter(raw: string): string {
  const m = raw.match(/^---\s*\n[\s\S]*?\n---\s*\n([\s\S]*)$/);
  return m ? m[1] : raw;
}

/** Round variant for arithmetic results. */
function addWithRound(set: Set<string>, n: number) {
  if (!Number.isFinite(n) || n <= 1 || n >= 1e9) return;
  set.add(String(n));
  set.add(n.toLocaleString("en-US"));
  set.add(n.toLocaleString("ko-KR"));
  for (const factor of [100, 1000, 10000]) {
    const rounded = Math.round(n / factor) * factor;
    if (rounded > 1 && rounded < 1e9 && rounded !== n) {
      set.add(String(rounded));
      set.add(rounded.toLocaleString("en-US"));
    }
  }
}

/**
 * raw 데이터 → allowedNumbers Set.
 *  · ftc_row 152 컬럼의 모든 numeric value
 *  · docx markdown 의 추출 가능한 숫자 (회수)
 *  · industry_facts 의 모든 분포 값
 *  · 산술 derived (sum/diff/multiplier × round variant)
 */
export function collectAllowedNumbers(args: {
  ftc_row: Record<string, unknown>;
  docx_facts: Array<{ value_num: number | null; value_text: string | null }>;
  industry_facts: Array<Record<string, unknown>>;
}): Set<string> {
  const allowed = new Set<string>();
  const allNums: number[] = [];

  function addNumber(n: unknown) {
    if (typeof n === "number" && Number.isFinite(n) && n > 1) {
      allowed.add(String(n));
      allowed.add(n.toLocaleString("en-US"));
      allowed.add(n.toLocaleString("ko-KR"));
      allowed.add(String(Math.trunc(n)));
      if (n !== Math.trunc(n)) {
        allowed.add((Math.round(n * 10) / 10).toString());
      }
      allNums.push(n);
    } else if (typeof n === "string") {
      // 콤마 포맷 문자열에서 추출
      const matches = n.match(NUMBER_RE) ?? [];
      for (const m of matches) {
        const num = Number(normalizeNum(m));
        if (Number.isFinite(num) && num > 1) addNumber(num);
      }
    }
  }

  // 1. ftc_row 컬럼
  for (const v of Object.values(args.ftc_row)) addNumber(v);

  // 2. docx_facts (v4-02) — value_num + value_text 안 숫자 모두
  for (const f of args.docx_facts) {
    if (f.value_num != null) addNumber(f.value_num);
    if (f.value_text) {
      const matches = f.value_text.match(NUMBER_RE) ?? [];
      for (const m of matches) {
        const num = Number(normalizeNum(m));
        if (Number.isFinite(num) && num > 1) addNumber(num);
      }
    }
  }

  // 3. industry_facts
  for (const row of args.industry_facts) {
    for (const v of Object.values(row)) addNumber(v);
  }

  // 4. 산술 derived (×÷ + round variants) — 비용 큰 항목, 상위 N 만
  const COMMON_DIVISORS = [12, 100, 10, 4, 365];
  const topNums = allNums.slice(0, 50); // O(n²) 폭주 방지
  for (let i = 0; i < topNums.length; i++) {
    for (let j = 0; j < topNums.length; j++) {
      if (i === j) continue;
      addWithRound(allowed, topNums[i] + topNums[j]);
      addWithRound(allowed, topNums[i] - topNums[j]);
      addWithRound(allowed, Math.abs(topNums[i] - topNums[j]));
    }
    for (const d of COMMON_DIVISORS) {
      addWithRound(allowed, Math.round(topNums[i] / d));
      addWithRound(allowed, topNums[i] * d);
    }
  }

  return allowed;
}

export type CrossCheckV4Result = {
  ok: boolean;
  matched: number;
  unmatched: string[];
};

/**
 * 본문 숫자 → allowedNumbers 매칭. unmatched 0건이 목표.
 */
export function crosscheckV4(rawBody: string, allowed: Set<string>): CrossCheckV4Result {
  const stripped = stripFrontmatter(rawBody);
  const body = normalizeKoreanNumbers(stripped);
  const unmatched: string[] = [];
  let matched = 0;

  const bodyMatches = body.matchAll(NUMBER_RE);
  for (const m of bodyMatches) {
    const raw = m[0];
    const n = normalizeNum(raw);
    const numVal = Number(n);
    if (!Number.isFinite(numVal) || numVal <= 1) continue;

    if (allowed.has(n) || allowed.has(raw) || allowed.has(String(Math.trunc(numVal)))) {
      matched++;
      continue;
    }

    const idx = m.index ?? 0;
    const ctxStart = Math.max(0, idx - 50);
    const ctxEnd = Math.min(body.length, idx + raw.length + 50);
    const ctx = body.slice(ctxStart, ctxEnd).replace(/\s+/g, " ").trim();

    const after5 = body.slice(idx + raw.length, idx + raw.length + 5);
    if (SKIP_AFTER_NUMBER.test(after5)) continue;

    if (numVal <= 100 && Number.isInteger(numVal)) {
      if (PERCENTILE_NOTATION.test(ctx) || AGG_METHOD_NEAR.test(ctx)) continue;
    }

    let skipped = false;
    for (const pat of IGNORE_CONTEXT_PATTERNS) {
      if (pat.test(ctx)) {
        skipped = true;
        break;
      }
    }
    if (skipped) continue;

    unmatched.push(`${raw} (ctx: ${ctx})`);
  }

  return { ok: unmatched.length === 0, matched, unmatched };
}
