/**
 * v3-01 — crosscheck (v2 에서 가져옴, types.Fact 기준).
 * 본문 숫자·출처 라벨 vs facts pool 매칭. unmatched 0건 정책.
 */

import type { Fact, PlanResult } from "./types";
import { formatToDisplay } from "./plan_format";

export type CrossCheckResult = {
  ok: boolean;
  matched: number;
  unmatched: string[];
};

const NUMBER_RE = /[\d]{1,3}(?:,\d{3})+(?:\.\d+)?|\d+(?:\.\d+)?/g;

const SOURCE_LABEL_PATTERNS: Array<{ re: RegExp; label: string }> = [
  { re: /공정거래위원회|공정위(?!\s*외)/i, label: "공정위" },
  { re: /공공데이터포털|data\.go\.kr/i, label: "공공데이터포털" },
  { re: /KOSIS|통계청/i, label: "KOSIS/통계청" },
  { re: /프랜도어\s*편집팀(?:이|가)?\s*직접/i, label: "프랜도어 편집팀 직접 (가짜 attribution)" },
];

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

/**
 * v3-01 — post-process 의 "X억 Y,YYY만원" 표기를 만원 정수로 환원.
 * "3억 4,704만원" → "34704만원" 처럼 풀어서 facts 정수와 매칭.
 *  · "N억 M,MMM만원" / "N억 M만원"
 *  · "N억원" → "(N*10000)만원"
 */
export function normalizeKoreanNumbers(text: string): string {
  return text
    .replace(
      /(\d{1,3}(?:,\d{3})*|\d+)\s*억\s*(\d{1,3}(?:,\d{3})*|\d+)\s*만/gu,
      (_, eok: string, man: string) => {
        const eokN = parseInt(eok.replace(/,/g, ""), 10);
        const manN = parseInt(man.replace(/,/g, ""), 10);
        return `${eokN * 10000 + manN}만`;
      },
    )
    .replace(/(\d{1,3}(?:,\d{3})*|\d+)\s*억(?!\s*\d)/gu, (_, eok: string) => {
      return `${parseInt(eok.replace(/,/g, ""), 10) * 10000}만`;
    })
    .replace(
      /(\d{1,3}(?:,\d{3})*|\d+)\s*만\s*(\d{1,3}(?:,\d{3})*|\d+)(?![\d,])/gu,
      (_, man: string, rest: string) => {
        const manN = parseInt(man.replace(/,/g, ""), 10);
        const restN = parseInt(rest.replace(/,/g, ""), 10);
        if (restN < 10000) {
          return `${manN * 10000 + restN}`;
        }
        return _;
      },
    );
}

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

function buildArithmeticPool(factsPool: Fact[]): Set<string> {
  const allowed = new Set<string>();
  const nums = factsPool
    .map((f) => f.value_num)
    .filter((n): n is number => typeof n === "number" && Number.isFinite(n) && n !== 0);

  for (let i = 0; i < nums.length; i++) {
    for (let j = 0; j < nums.length; j++) {
      if (i === j) continue;
      addWithRound(allowed, nums[i] + nums[j]);
      addWithRound(allowed, nums[i] - nums[j]);
      addWithRound(allowed, Math.abs(nums[i] - nums[j]));
    }
  }

  const COMMON_DIVISORS = [12, 100, 10, 4, 365];
  for (const n of nums) {
    for (const d of COMMON_DIVISORS) {
      addWithRound(allowed, Math.round(n / d));
      addWithRound(allowed, n * d);
    }
  }

  return allowed;
}

export function crosscheckV3(rawBody: string, factsPool: Fact[]): CrossCheckResult {
  const stripped = stripFrontmatter(rawBody);
  const body = normalizeKoreanNumbers(stripped);

  const unmatched: string[] = [];
  let matched = 0;

  const allowedNumbers = new Set<string>();
  for (const f of factsPool) {
    if (f.value_num != null && Number.isFinite(f.value_num)) {
      allowedNumbers.add(String(f.value_num));
      allowedNumbers.add(f.value_num.toLocaleString("en-US"));
      allowedNumbers.add(f.value_num.toLocaleString("ko-KR"));
      allowedNumbers.add(String(Math.trunc(f.value_num)));
      if (f.value_num !== Math.trunc(f.value_num)) {
        allowedNumbers.add((Math.round(f.value_num * 10) / 10).toString());
      }
    }
    if (f.value_text != null) {
      const nums = f.value_text.match(NUMBER_RE) ?? [];
      for (const n of nums) allowedNumbers.add(normalizeNum(n));
    }
    if (f.period) {
      allowedNumbers.add(f.period.replace(/-/g, ""));
      const m = f.period.match(/^(\d{4})-(\d{2})$/);
      if (m) {
        allowedNumbers.add(m[1]);
        allowedNumbers.add(String(parseInt(m[2], 10)));
      }
    }
    if (f.n != null) {
      allowedNumbers.add(String(f.n));
    }
  }

  const arithmeticPool = buildArithmeticPool(factsPool);
  for (const v of arithmeticPool) allowedNumbers.add(v);

  const bodyMatches = body.matchAll(NUMBER_RE);
  for (const m of bodyMatches) {
    const raw = m[0];
    const n = normalizeNum(raw);
    const numVal = Number(n);
    if (!Number.isFinite(numVal) || numVal <= 1) continue;

    if (allowedNumbers.has(n) || allowedNumbers.has(raw)) {
      matched++;
      continue;
    }

    if (allowedNumbers.has(String(Math.trunc(numVal)))) {
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
      if (PERCENTILE_NOTATION.test(ctx) || AGG_METHOD_NEAR.test(ctx)) {
        continue;
      }
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

  const allowedSources = new Set<string>();
  for (const f of factsPool) {
    if (f.source_label) {
      const tokens = f.source_label.split(/[\s()0-9]+/).filter((t) => t.length >= 2);
      for (const t of tokens) allowedSources.add(t);
      allowedSources.add(f.source_label.trim());
    }
  }

  for (const pat of SOURCE_LABEL_PATTERNS) {
    const matches = body.match(new RegExp(pat.re.source, pat.re.flags + "g"));
    if (!matches) continue;
    for (const m of matches) {
      if (pat.label.includes("가짜")) {
        unmatched.push(`출처 라벨 '${m}' — ${pat.label}`);
        continue;
      }
      const ok = [...allowedSources].some((s) => {
        if (s === m) return true;
        if (s.length >= 3 && (s.includes(m) || m.includes(s))) return true;
        return false;
      });
      if (!ok) {
        unmatched.push(`출처 라벨 '${m}' facts pool 에 없음`);
      }
    }
  }

  return { ok: unmatched.length === 0, matched, unmatched };
}

/**
 * v3-08 — Plan output 의 display 자릿수 검증.
 * haiku 가 display 를 출력해도 후처리 결정론과 일치해야 (드물게 raw 와 display 불일치 시 검출).
 */
export function verifyDisplayConversion(plan: PlanResult): string[] {
  const warnings: string[] = [];
  for (const [metricId, group] of Object.entries(plan.fact_groups ?? {})) {
    if (group.A) {
      const expected = formatToDisplay(group.A.raw_value, group.A.unit);
      if (group.A.display !== expected) {
        warnings.push(
          `[자릿수 mismatch] ${metricId} A급: display="${group.A.display}" vs raw=${group.A.raw_value} → 예상 "${expected}"`,
        );
      }
    }
    if (group.C) {
      const expected = formatToDisplay(group.C.raw_value, group.C.unit);
      if (group.C.display !== expected) {
        warnings.push(
          `[자릿수 mismatch] ${metricId} C급: display="${group.C.display}" vs raw=${group.C.raw_value} → 예상 "${expected}"`,
        );
      }
    }
  }
  return warnings;
}

/**
 * v3-08 — A급 활용도 검증. fact_groups 의 A 가 본문에 등장하는 비율.
 *  · 50% 미만 → warning
 *  · A 가 0개면 검사 skip
 */
export function verifyAFactsUsage(body: string, plan: PlanResult): string | null {
  const aGroups = Object.entries(plan.fact_groups ?? {}).filter(([, g]) => g.A);
  if (aGroups.length === 0) return null;
  const used = aGroups.filter(([, g]) => g.A && body.includes(g.A.display));
  const ratio = used.length / aGroups.length;
  if (ratio < 0.5) {
    return `[A급 활용도 낮음] ${used.length}/${aGroups.length} (${Math.round(ratio * 100)}%) — 50% 미만`;
  }
  return null;
}

/**
 * v3-08 — C급 인용 검증. fact_groups 에 C 가 있으면 본문에 display 등장 강제.
 *  · C 0개 → skip
 *  · C ≥ 1 + 인용 0건 → warning
 *  · C ≥ 2 + 인용 < 2 → warning (수치 부족)
 */
export function verifyCFactsUsage(body: string, plan: PlanResult): string | null {
  const cGroups = Object.entries(plan.fact_groups ?? {}).filter(([, g]) => g.C);
  if (cGroups.length === 0) return null;
  const used = cGroups.filter(([, g]) => g.C && body.includes(g.C.display));
  if (used.length === 0) {
    return `[C급 미인용] fact_groups 에 C급 ${cGroups.length}건 있는데 본문 display 인용 0건`;
  }
  const target = Math.min(2, cGroups.length);
  if (used.length < target) {
    return `[C급 수치 부족] fact_groups 에 C급 ${cGroups.length}건 / 본문 인용 ${used.length}건 (목표 ≥${target})`;
  }
  return null;
}
