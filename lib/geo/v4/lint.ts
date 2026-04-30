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

  return { errors, warnings };
}

export { lintV3Faq as lintV4Faq };
