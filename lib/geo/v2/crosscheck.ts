/**
 * v2-04 crosscheckV2 — 본문 숫자·출처 라벨 vs facts pool 매칭 검증.
 * unmatched 0건만 통과. 1건이라도 있으면 1회 재호출, 그래도 실패 시 throw.
 *
 * v2-13 false positive hotfix:
 *  · frontmatter (---\n yaml \n---) 영역 검증 제외 (T1)
 *  · percentile / agg_method 통계 표기 (p25/p50/p75/p90/p95) 자체 ctx ignore (T2)
 *  · 한국어 콤마 포맷 (ko-KR) 매칭 보강 (T3)
 *  · 연도 / 순위 / 단위 / 일반 패턴 ignore (T4)
 */

import type { FactPoolItem } from "./sysprompt";

export type CrossCheckV2Result = {
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

/**
 * v2-13 T2 — percentile / agg_method 통계 표기 자체.
 * 예: "업종 p90(50,991만원)" 의 90 / "p75 기준점" 의 75 는 통계 method 라벨 → skip.
 */
const PERCENTILE_NOTATION = /\bp\d{1,2}(?:\s*\(|\s*기준|\s*수준|\s*평균|\s*값|\s*이상|\s*이하|\s*초과|\s*미달|\s*미만)?/i;
const AGG_METHOD_NEAR = /(?:중앙값|median|p25|p50|p75|p90|p95|평균|trimmed[_\s-]?mean)/i;

/**
 * v2-13 T4 — false positive 흔한 ctx 패턴.
 * 본문에서 숫자가 다음 패턴 안에 등장하면 검증 skip.
 */
const IGNORE_CONTEXT_PATTERNS: RegExp[] = [
  // 날짜 / 등록일 / 발행일
  /\d{4}-\d{2}-\d{2}/,
  /등록일|발행일|기준일|작성일|생성일/,
  // 순위 / 차수
  /순위|TOP\s*\d|상위\s*\d|하위\s*\d|\d+\s*위/i,
  // 단위 자체 표기 (시간/일/개월/년/% 단순)
  /\d+\s*(?:일|시간|분|초)\b/,
  // %p 차이 표현
  /\d+\s*%p\b/,
];

/**
 * v2-13 T4-b — number token 직후 suffix 가 derived 표시면 검증 skip.
 *  · "2.45배" — 두 facts 비율 (LLM 산출)
 *  · "1.23%p" — 두 facts 차이 (이미 IGNORE_CONTEXT_PATTERNS 에서도 처리)
 * 본문 다음 ~5자 안에 패턴 매칭 시 skip.
 */
// JS regex \b 가 한글 word boundary 인식 못 함 → \b 제거.
// 주의: percent (%) 는 유효 단위이므로 빼고 %p (percentage point) 만 skip.
const SKIP_AFTER_NUMBER = /^\s*(?:배|%p)/;

/** 숫자 토큰 정규화 — 콤마 제거 + 숫자 변환. */
function normalizeNum(s: string): string {
  return s.replace(/,/g, "");
}

/** v2-13 T1 — frontmatter (---\n yaml \n---) 제거 후 body 만 반환. */
function stripFrontmatter(raw: string): string {
  const m = raw.match(/^---\s*\n[\s\S]*?\n---\s*\n([\s\S]*)$/);
  return m ? m[1] : raw;
}

/**
 * 본문 숫자·출처 라벨 vs facts pool 매칭.
 */
export function crosscheckV2(rawBody: string, factsPool: FactPoolItem[]): CrossCheckV2Result {
  // v2-13 T1 — frontmatter 영역 검증 제외
  const body = stripFrontmatter(rawBody);

  const unmatched: string[] = [];
  let matched = 0;

  // 1. 허용 숫자 set 빌드
  const allowedNumbers = new Set<string>();
  for (const f of factsPool) {
    if (f.value_num != null && Number.isFinite(f.value_num)) {
      allowedNumbers.add(String(f.value_num));
      // v2-13 T3 — 콤마 포맷 (영문/한국)
      allowedNumbers.add(f.value_num.toLocaleString("en-US"));
      allowedNumbers.add(f.value_num.toLocaleString("ko-KR"));
      // 정수부만 (소수 절삭)
      allowedNumbers.add(String(Math.trunc(f.value_num)));
      // 소수 1자리 절삭
      if (f.value_num !== Math.trunc(f.value_num)) {
        allowedNumbers.add((Math.round(f.value_num * 10) / 10).toString());
      }
    }
    if (f.value_text != null) {
      const nums = f.value_text.match(NUMBER_RE) ?? [];
      for (const n of nums) allowedNumbers.add(normalizeNum(n));
    }
    if (f.period) {
      // "2024-12" → "2024", "12", "202412"
      allowedNumbers.add(f.period.replace(/-/g, ""));
      const m = f.period.match(/^(\d{4})-(\d{2})$/);
      if (m) {
        allowedNumbers.add(m[1]);
        allowedNumbers.add(String(parseInt(m[2], 10)));
      }
    }
    if (f.n != null) {
      // industry_facts 의 표본 수 (예: 524)
      allowedNumbers.add(String(f.n));
    }
  }

  // 2. 본문 숫자 추출 + 검증
  const bodyMatches = body.matchAll(NUMBER_RE);
  for (const m of bodyMatches) {
    const raw = m[0];
    const n = normalizeNum(raw);
    const numVal = Number(n);
    if (!Number.isFinite(numVal) || numVal <= 1) continue; // 목차 번호·서수 skip

    if (allowedNumbers.has(n) || allowedNumbers.has(raw)) {
      matched++;
      continue;
    }

    // 정수부만으로도 매칭 (예: pool 5210 / 본문 "5210만")
    if (allowedNumbers.has(String(Math.trunc(numVal)))) {
      matched++;
      continue;
    }

    // ctx 검사 (skip 패턴 우선 검사 후 unmatched 결정)
    const idx = m.index ?? 0;
    // v2-13 T2 — percentile 표기 검출 위해 ctx 윈도우 ±50 (이전 ±30)
    const ctxStart = Math.max(0, idx - 50);
    const ctxEnd = Math.min(body.length, idx + raw.length + 50);
    const ctx = body.slice(ctxStart, ctxEnd).replace(/\s+/g, " ").trim();

    // v2-13 T4-b — number 직후 suffix 가 derived 표시 (배/%p) 면 skip
    const after5 = body.slice(idx + raw.length, idx + raw.length + 5);
    if (SKIP_AFTER_NUMBER.test(after5)) continue;

    // v2-13 T2 — percentile / agg_method 통계 표기 자체 ignore
    // 본문에 "p90(50,991만원)" 형태로 나오면 90 자체는 통계 method 라벨이지 fact 가 아님.
    // raw 가 100 이하 정수이고 (p25/50/75/90/95 후보) ctx 에 PERCENTILE_NOTATION 또는 AGG_METHOD_NEAR 매칭 시 skip.
    if (numVal <= 100 && Number.isInteger(numVal)) {
      if (PERCENTILE_NOTATION.test(ctx) || AGG_METHOD_NEAR.test(ctx)) {
        continue; // 통계 표기 — match 도 unmatch 도 아님 (skip)
      }
    }

    // v2-13 T4 — 일반 false positive 패턴 ignore
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

  // 3. 출처 라벨 검증
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
