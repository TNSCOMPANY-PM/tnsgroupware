/**
 * PR047 — 한글 → 영문 단순 매핑 (slug 생성용).
 * 정밀 음가 변환이 아니라 url-safe 인 영문자만 보장.
 *
 * 정책:
 *   - 한글 음절(0xAC00~0xD7A3)을 초성·중성·종성 분리해 단순 raw 매핑.
 *   - 영문/숫자/하이픈은 그대로 (소문자화).
 *   - 그 외 문자는 하이픈으로 치환.
 *   - 중복 하이픈은 1개로 압축, 양끝 하이픈 제거, 길이 60자 컷.
 */

const CHO = [
  "g", "kk", "n", "d", "tt", "r", "m", "b", "pp", "s",
  "ss", "", "j", "jj", "ch", "k", "t", "p", "h",
];
const JUNG = [
  "a", "ae", "ya", "yae", "eo", "e", "yeo", "ye", "o", "wa",
  "wae", "oe", "yo", "u", "wo", "we", "wi", "yu", "eu", "ui", "i",
];
const JONG = [
  "", "g", "kk", "gs", "n", "nj", "nh", "d", "l", "lg",
  "lm", "lb", "ls", "lt", "lp", "lh", "m", "b", "bs", "s",
  "ss", "ng", "j", "ch", "k", "t", "p", "h",
];

function romanizeChar(ch: string): string {
  const code = ch.charCodeAt(0);
  if (code < 0xac00 || code > 0xd7a3) {
    return ch;
  }
  const idx = code - 0xac00;
  const choIdx = Math.floor(idx / (21 * 28));
  const jungIdx = Math.floor((idx % (21 * 28)) / 28);
  const jongIdx = idx % 28;
  return CHO[choIdx] + JUNG[jungIdx] + JONG[jongIdx];
}

export function romanize(s: string): string {
  let out = "";
  for (const ch of s) out += romanizeChar(ch);
  return out;
}

export function toSlug(s: string, maxLen = 60): string {
  if (!s) return "";
  const romanized = romanize(s)
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/-{2,}/g, "-")
    .replace(/^-+|-+$/g, "");
  return romanized.slice(0, maxLen).replace(/-+$/, "");
}
