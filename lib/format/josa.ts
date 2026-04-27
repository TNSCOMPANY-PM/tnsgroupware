/**
 * PR046 — 한글 받침 자동 감지 + 조사 결합 유틸.
 *
 * 받침 감지: 한글 음절 unicode (0xAC00 ~ 0xD7A3) 영역에서
 *   (charCode - 0xAC00) % 28 !== 0 → 종성 있음 (받침 있음)
 *
 * 영문/숫자 등 한글 외 마지막 글자 처리:
 *   - 받침 있는 것으로 간주 (예: "BBQ은", "B-1은") — 흔한 한국어 관행
 *   - 단 일부 외래어("커피") 는 자동 처리됨
 */

export type JosaPair = "은/는" | "이/가" | "을/를" | "와/과" | "(으)로" | "(이)나" | "(이)란";

const JOSA_TABLE: Record<JosaPair, [string, string]> = {
  // [받침O, 받침X]
  "은/는": ["은", "는"],
  "이/가": ["이", "가"],
  "을/를": ["을", "를"],
  "와/과": ["과", "와"],
  "(으)로": ["으로", "로"],
  "(이)나": ["이나", "나"],
  "(이)란": ["이란", "란"],
};

const HANGUL_FINAL_RIEUL = 8; // ㄹ 종성 코드 (28-base 인덱스)

function lastChar(word: string): string | null {
  if (!word) return null;
  return Array.from(word).pop() ?? null;
}

function isHangulSyllable(ch: string): boolean {
  const code = ch.charCodeAt(0);
  return code >= 0xac00 && code <= 0xd7a3;
}

function hasFinalConsonant(ch: string): boolean {
  const code = ch.charCodeAt(0);
  return (code - 0xac00) % 28 !== 0;
}

function finalConsonantCode(ch: string): number {
  return (ch.charCodeAt(0) - 0xac00) % 28;
}

export function hasJongseong(word: string): boolean {
  const c = lastChar(word);
  if (!c) return false;
  if (isHangulSyllable(c)) return hasFinalConsonant(c);
  // 영문·숫자 fallback: 받침 있는 것으로 간주.
  return true;
}

export function josa(word: string, pair: JosaPair): string {
  const [withFinal, withoutFinal] = JOSA_TABLE[pair];
  const c = lastChar(word);
  if (!c) return withFinal;

  // (으)로: ㄹ 종성은 "로" (예: "오공김밥**로**" 가 아니라 "오공김밥**으로**" 이지만,
  //          ㄹ 받침 단어는 "서울로" 처럼 "로" 사용 — 표준 국어 규칙).
  if (pair === "(으)로" && isHangulSyllable(c) && finalConsonantCode(c) === HANGUL_FINAL_RIEUL) {
    return "로";
  }

  if (isHangulSyllable(c)) {
    return hasFinalConsonant(c) ? withFinal : withoutFinal;
  }
  // 영문·숫자 fallback
  return withFinal;
}

export function withJosa(word: string, pair: JosaPair): string {
  return `${word}${josa(word, pair)}`;
}
