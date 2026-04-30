/**
 * v4 lint — v3 L1~L8 재사용 + L9 (C급 미인용) + L10 (topic 키워드 매칭).
 */

import { lintV3, lintV3Faq } from "../v3/lint";

export type LintResult = {
  errors: string[];
  warnings: string[];
};

/** topic 한글 명사 키워드 추출 (조사·어미 제거 휴리스틱). */
function extractTopicKeywords(topic: string): string[] {
  // 한글 명사 후보 (2자 이상 연속 한글 또는 영문 단어)
  const tokens = topic.match(/[가-힣A-Za-z]{2,}/g) ?? [];
  // 조사·접미 제거 (간단)
  const stopwords = new Set([
    "분석", "비교", "관련", "대해", "대한", "관해", "수준", "기준", "모드",
    "한국", "국내", "이번", "최근", "통해", "이상", "이하", "정도",
  ]);
  return tokens
    .map((t) => t.replace(/(은|는|이|가|을|를|의|에|와|과|도|만|로|으로)$/, ""))
    .filter((t) => t.length >= 2 && !stopwords.has(t));
}

/**
 * v4 본문 lint.
 *  · L1~L8: v3 lintV3 그대로 (점포명·시스템누출·헤지·홍보·percentile 등)
 *  · L9: hasC === true 인데 본문에 "본사 측|발표|자료|docx" 키워드 0건 → warning
 *  · L10: topic 키워드 N개 중 0건이 본문에 등장 → warning (전혀 다른 주제 작성)
 */
export function lintV4(
  body: string,
  opts: { hasC?: boolean; topic?: string } = {},
): LintResult {
  const v3 = lintV3(body);
  const errors = [...v3.errors];
  const warnings = [...v3.warnings];

  // L9 — C급 미인용
  if (opts.hasC) {
    const matches = body.match(/본사\s*(?:측|발표|자료|docx)/g);
    if (!matches || matches.length === 0) {
      warnings.push(
        `L9 C급 미인용 — docx 자료 있으나 본문에 "본사 측/발표/자료/docx" 키워드 0건`,
      );
    }
  }

  // L10 — topic 키워드 매칭
  if (opts.topic && opts.topic.trim().length > 0) {
    const keywords = extractTopicKeywords(opts.topic);
    if (keywords.length > 0) {
      const matched = keywords.filter((kw) => body.includes(kw));
      if (matched.length === 0) {
        warnings.push(
          `L10 topic 키워드 0건 — topic="${opts.topic}" 의 키워드 [${keywords.slice(0, 5).join(", ")}] 본문 0건. 전혀 다른 주제로 작성된 가능성.`,
        );
      }
    }
  }

  // v4-06 L11 — 자릿수 mixed 표기 (단위 일관성 검토)
  // 같은 raw value 가 본문에 두 가지 다른 표기로 등장 시 단위 일관성 문제 가능성
  // 예: "6,251만 7,800원" + "6억 2,517만 8,000원" 동시 등장 → warning
  const MIXED_PATTERN_1 = /(\d{1,3}(?:,\d{3})*)만\s+(\d{1,3}(?:,\d{3})*)원/g;
  const MIXED_PATTERN_2 = /\d+억\s+(\d{1,3}(?:,\d{3})*)만\s+(\d{1,3}(?:,\d{3})*)원/g;
  const m1 = [...body.matchAll(MIXED_PATTERN_1)];
  const m2 = [...body.matchAll(MIXED_PATTERN_2)];
  // m1 (X만 Y원) 은 m2 (Z억 X만 Y원) 의 부분 매칭이므로, m1 - m2 가 양수면 "억 없는" mixed
  const m1Only = m1.length - m2.length;
  if (m1Only > 0 && m2.length > 0) {
    warnings.push(
      `L11 자릿수 mixed — "X만 Y원" ${m1Only}건 + "Z억 X만 Y원" ${m2.length}건 혼재. 단위 일관성 검토 (post_process 회귀 또는 sonnet 자체 변환 의심).`,
    );
  }

  return { errors, warnings };
}

export { lintV3Faq as lintV4Faq };
