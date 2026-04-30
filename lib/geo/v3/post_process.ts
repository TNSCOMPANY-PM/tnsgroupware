/**
 * v3-01 Step 4-A — 결정론적 post-process.
 *
 * 5룰:
 *  1. brand → 브랜드 (코드 식별자·slug·url 제외)
 *  2. 만원 ≥ 10,000 → "X억 Y,YYY만원"
 *  3. percentile 약어 → 자연어 (p25/p50/p75/p90/p95)
 *  4. "→ 즉," 다양화 (5블럭 중 1회 이상이면 두 번째부터 변형)
 *  5. "공정위 정보공개서(2024-12) 기준" 풀 명시 첫 1회만, 이후 "정보공개서 기준"
 */

export type PostProcessResult = {
  body: string;
  log: string[];
};

export function postProcess(input: string): PostProcessResult {
  const log: string[] = [];
  let body = input;

  // 1. brand → 브랜드 (코드 식별자·slug·url·식별자·-/_ 인접 제외)
  //   부정 lookbehind/lookahead — 영문자·_·- 인접 시 제외
  let brandCount = 0;
  body = body.replace(/(?<![a-zA-Z_\-/])brand(?![a-zA-Z_\-/])/g, () => {
    brandCount++;
    return "브랜드";
  });
  if (brandCount > 0) log.push(`brand→브랜드 ${brandCount}건`);

  // 2. 억 단위 변환 — 만원 ≥ 10,000 (v4-06: 소수점 지원)
  //    "62,517만원"   → "6억 2,517만원"
  //    "62517만원"    → "6억 2,517만원"
  //    "62,517.8만원" → "6억 2,517만 8,000원"  (소수점 → 원 단위로 풀어냄)
  //    "62,517.85만원" → "6억 2,517만 8,500원"
  let eokCount = 0;
  body = body.replace(
    /(\d{1,3}(?:,\d{3})+|\d{5,})(?:\.(\d+))?만원/g,
    (match, intStr: string, decStr?: string) => {
      const intPart = parseInt(intStr.replace(/,/g, ""), 10);
      if (!Number.isFinite(intPart) || intPart < 10000) return match;
      const eok = Math.floor(intPart / 10000);
      const manRemainInt = intPart - eok * 10000;
      // 소수점 → 원 단위 (0.8 만원 = 8,000원)
      const decimal = decStr ? parseFloat("0." + decStr) : 0;
      const wonFromDecimal = Math.round(decimal * 10000);
      eokCount++;
      if (manRemainInt === 0 && wonFromDecimal === 0) return `${eok}억원`;
      if (wonFromDecimal === 0) return `${eok}억 ${manRemainInt.toLocaleString("en-US")}만원`;
      if (manRemainInt === 0) {
        return `${eok}억 ${wonFromDecimal.toLocaleString("en-US")}원`;
      }
      return `${eok}억 ${manRemainInt.toLocaleString("en-US")}만 ${wonFromDecimal.toLocaleString("en-US")}원`;
    },
  );
  if (eokCount > 0) log.push(`억단위 변환 ${eokCount}건`);

  // 3. percentile 약어 → 자연어
  const pctMap: Array<[RegExp, string]> = [
    [/\bp25\b/g, "하위 25%"],
    [/\bp50\b/g, "중앙값"],
    [/\bp75\b/g, "상위 25%"],
    [/\bp90\b/g, "상위 10%"],
    [/\bp95\b/g, "상위 5%"],
  ];
  let pctCount = 0;
  for (const [re, replacement] of pctMap) {
    body = body.replace(re, () => {
      pctCount++;
      return replacement;
    });
  }
  if (pctCount > 0) log.push(`percentile 자연어 변환 ${pctCount}건`);

  // 4. "→ 즉," 다양화 — 첫 1회만 유지, 이후 변형
  const variants = ["결국", "정리하면", "이런 분포에서는", "한 줄로 보면"];
  let counter = 0;
  body = body.replace(/→\s*즉,\s*/g, () => {
    counter++;
    if (counter <= 1) return "→ 즉, ";
    return variants[(counter - 2) % variants.length] + " ";
  });
  if (counter > 1) log.push(`"→ 즉," 다양화 ${counter - 1}건`);

  // 5. "공정위 정보공개서(2024-12) 기준" 첫 1회만 유지
  let firstSource = false;
  let sourceCount = 0;
  body = body.replace(/공정위\s*정보공개서\s*\(2024-12\)\s*기준/g, (match) => {
    if (!firstSource) {
      firstSource = true;
      return match;
    }
    sourceCount++;
    return "정보공개서 기준";
  });
  if (sourceCount > 0) log.push(`출처 풀 명시 압축 ${sourceCount}건`);

  return { body, log };
}
