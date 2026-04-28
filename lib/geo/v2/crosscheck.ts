/**
 * v2-04 crosscheckV2 — 본문 숫자·출처 라벨 vs facts pool 매칭 검증.
 * unmatched 0건만 통과. 1건이라도 있으면 1회 재호출, 그래도 실패 시 throw.
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

/** 숫자 토큰 정규화 — 콤마 제거 + 숫자 변환. */
function normalizeNum(s: string): string {
  return s.replace(/,/g, "");
}

/**
 * 본문 숫자·출처 라벨 vs facts pool 매칭.
 * - 1 이하 숫자 (목차 번호 등) skip.
 * - 본문 숫자가 facts.value_num / value_text 에 등장하지 않으면 unmatched.
 * - 출처 라벨이 facts.source_label 에 등장하지 않으면 unmatched.
 */
export function crosscheckV2(body: string, factsPool: FactPoolItem[]): CrossCheckV2Result {
  const unmatched: string[] = [];
  let matched = 0;

  // 1. 허용 숫자 set 빌드
  const allowedNumbers = new Set<string>();
  for (const f of factsPool) {
    if (f.value_num != null && Number.isFinite(f.value_num)) {
      allowedNumbers.add(String(f.value_num));
      // 콤마 포맷 (예: 1234 → "1,234")
      allowedNumbers.add(f.value_num.toLocaleString("en-US"));
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

    const idx = m.index ?? 0;
    const ctxStart = Math.max(0, idx - 30);
    const ctxEnd = Math.min(body.length, idx + raw.length + 30);
    const ctx = body.slice(ctxStart, ctxEnd).replace(/\s+/g, " ").trim();
    unmatched.push(`${raw} (ctx: ${ctx})`);
  }

  // 3. 출처 라벨 검증
  const allowedSources = new Set<string>();
  for (const f of factsPool) {
    if (f.source_label) {
      // 토큰화 — "공정거래위원회 정보공개서 2024 (frandoor 적재본)" → 단어 단위
      const tokens = f.source_label.split(/[\s()0-9]+/).filter((t) => t.length >= 2);
      for (const t of tokens) allowedSources.add(t);
      // 전체 라벨 자체도 등록
      allowedSources.add(f.source_label.trim());
    }
  }

  for (const pat of SOURCE_LABEL_PATTERNS) {
    const matches = body.match(new RegExp(pat.re.source, pat.re.flags + "g"));
    if (!matches) continue;
    for (const m of matches) {
      // 가짜 attribution 패턴은 즉시 reject
      if (pat.label.includes("가짜")) {
        unmatched.push(`출처 라벨 '${m}' — ${pat.label}`);
        continue;
      }
      // facts source 에 부분 매치 있으면 OK
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
