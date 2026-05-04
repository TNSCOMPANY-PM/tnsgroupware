/**
 * v4-14 — 한국어 조사 자동 처리.
 * 받침 유무에 따라 "이/가", "을/를", "으로/로", "은/는", "와/과" 자동 선택.
 * 한글 음절 종성 비트 + 숫자 발음 휴리스틱.
 */

const HAS_BATCHIM_OVERRIDE: Record<string, boolean> = {
  "0": true, // "영"
  "1": true, // "일"
  "3": true, // "삼"
  "6": true, // "육"
  "7": true, // "칠"
  "8": true, // "팔"
  "2": false, // "이"
  "4": false, // "사"
  "5": false, // "오"
  "9": false, // "구"
};

function lastChar(s: string): string {
  return s.slice(-1);
}

function jongseong(c: string): number | null {
  const code = c.charCodeAt(0);
  if (code >= 0xac00 && code <= 0xd7a3) return (code - 0xac00) % 28;
  return null;
}

function hasBatchim(s: string): boolean {
  if (!s) return false;
  const c = lastChar(s);
  if (HAS_BATCHIM_OVERRIDE[c] !== undefined) return HAS_BATCHIM_OVERRIDE[c];
  const jong = jongseong(c);
  if (jong != null) return jong !== 0;
  return false;
}

export function josa(word: string, withBatchim: string, noBatchim: string): string {
  return hasBatchim(word) ? withBatchim : noBatchim;
}

/** "으로" / "로" — ㄹ 받침은 "로" (예: "결과로"), 그 외 받침은 "으로", 받침 없음은 "로" */
export function ro(word: string): string {
  if (!word) return "로";
  const c = lastChar(word);
  const jong = jongseong(c);
  if (jong != null) {
    if (jong === 0) return "로"; // 받침 없음
    if (jong === 8) return "로"; // ㄹ 받침
    return "으로";
  }
  if (HAS_BATCHIM_OVERRIDE[c] === true) return "으로";
  if (HAS_BATCHIM_OVERRIDE[c] === false) return "로";
  return "로";
}

export function eun(word: string): string {
  return josa(word, "은", "는");
}

export function i(word: string): string {
  return josa(word, "이", "가");
}

export function eul(word: string): string {
  return josa(word, "을", "를");
}

export function gwa(word: string): string {
  return josa(word, "과", "와");
}
