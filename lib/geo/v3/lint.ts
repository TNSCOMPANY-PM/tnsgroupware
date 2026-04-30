/**
 * v3-01 lint — v2 룰 (L1~L4, L-void) + L8 (percentile 약어 잔존).
 * L7 (입장 명시) 폐기됨 (v2-21).
 */

export type LintResult = {
  errors: string[];
  warnings: string[];
};

const HEDGE_UNITS = "(?:만원|원|개|건|호|점|회|일|월|년|시간|분|초|배|%|평|㎡)";
const FORBIDDEN_HEDGE = new RegExp(
  [
    `약\\s*\\d[\\d,]*\\s*${HEDGE_UNITS}?\\s*(?:가량|정도|쯤)`,
    `\\d[\\d,]*\\s*${HEDGE_UNITS}?\\s*(?:가량|쯤)`,
    `(?:대략|아마도)\\s*\\d`,
    `~?할\\s*수도\\s*있`,
  ].join("|"),
  "g",
);

const FORBIDDEN_VOID = /다양한\s*각도|살펴보자|알아보자|많은\s*전문가|업계\s*관계자에\s*따르면/g;
const FORBIDDEN_PROMO = /국내\s*대표|인기\s*있는|사랑받는|선두주자|업계\s*1위(?!\s*\d)/g;
const FORBIDDEN_SYS_LEAK = /데이터\s*부재|산출\s*불가|현재\s*입력\s*JSON|facts\s*pool\s*에/g;

const STORE_LIKE = /(?<![상하위본직영가맹점\d명])[가-힣]{2,5}점(?:\s|[,.\)])(?!포)/g;
const DONG_LIKE = /[가-힣]{2,5}동(?:\s|[,.\)])(?!네|료|반|시|기간)/g;

// L8 (v3-01) — percentile 약어 잔존 차단. post-process 에서 모두 변환됐어야 함.
// 한국어 "백분위" 는 \b 작동 안함 → 직접 매칭.
const FORBIDDEN_PCT_ABBREV = /\bp(?:25|50|75|90|95)\b|\bpercentile\b|백분위/g;

export function lintV3(body: string): LintResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  const sysLeak = body.match(FORBIDDEN_SYS_LEAK);
  if (sysLeak && sysLeak.length > 0) {
    errors.push(`L2 시스템 누출 ${sysLeak.length}건: "${sysLeak[0]}"`);
  }

  const hedge = body.match(FORBIDDEN_HEDGE);
  if (hedge && hedge.length > 0) {
    errors.push(`L3 헤지 표현 ${hedge.length}건: "${hedge.slice(0, 3).join(", ")}"`);
  }

  const promo = body.match(FORBIDDEN_PROMO);
  if (promo && promo.length > 0) {
    errors.push(`L4 본사 홍보 문구 ${promo.length}건: "${promo[0]}"`);
  }

  const storeMatches = body.match(STORE_LIKE);
  const dongMatches = body.match(DONG_LIKE);
  const totalLike = (storeMatches?.length ?? 0) + (dongMatches?.length ?? 0);
  if (totalLike > 0) {
    const samples = [...(storeMatches ?? []), ...(dongMatches ?? [])].slice(0, 3);
    warnings.push(`L1 점포명·행정동 의심 ${totalLike}건: "${samples.join(", ")}"`);
  }

  const voidM = body.match(FORBIDDEN_VOID);
  if (voidM && voidM.length > 0) {
    warnings.push(`L-void 공허 문구 ${voidM.length}건: "${voidM[0]}"`);
  }

  // L8 — percentile 약어 잔존 (post-process 에서 모두 변환됐어야)
  const pctAbbrev = body.match(FORBIDDEN_PCT_ABBREV);
  if (pctAbbrev && pctAbbrev.length > 0) {
    errors.push(
      `L8 percentile 약어 잔존 ${pctAbbrev.length}건: "${pctAbbrev.slice(0, 3).join(", ")}"`,
    );
  }

  return { errors, warnings };
}

export function lintV3Faq(faq: unknown): LintResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  if (!Array.isArray(faq)) {
    warnings.push("L6 FAQ 누락 또는 배열 아님");
    return { errors, warnings };
  }
  if (faq.length < 3) errors.push(`L6 FAQ ${faq.length}개 < 3 (최소)`);
  if (faq.length > 5) errors.push(`L6 FAQ ${faq.length}개 > 5 (최대)`);
  return { errors, warnings };
}
