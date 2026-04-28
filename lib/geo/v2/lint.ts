/**
 * v2-06 hard lint v2 — voice_spec_v2 의 lint-handled 룰 (6·7·8·9·11).
 * crosscheckV2 통과 후 호출. errors 1건이라도 있으면 generate 차단.
 */

export type LintV2Result = {
  errors: string[];
  warnings: string[];
};

// L3 — 헤지 표현 (voice_spec §3.6, §11)
const FORBIDDEN_HEDGE = /약\s*\d|대략(?:\s|적인)|정도(?:로|입니다|이며|쯤)|아마도|~할\s*수도\s*있/g;

// L-void — 공허 문구 (voice_spec §11)
const FORBIDDEN_VOID = /다양한\s*각도|살펴보자|알아보자|많은\s*전문가|업계\s*관계자에\s*따르면/g;

// L4 — 본사 홍보 문구 (voice_spec §11)
const FORBIDDEN_PROMO = /국내\s*대표|인기\s*있는|사랑받는|선두주자|업계\s*1위(?!\s*\d)/g;

// L2 — 시스템 누출 (voice_spec §11)
const FORBIDDEN_SYS_LEAK = /데이터\s*부재|산출\s*불가|현재\s*입력\s*JSON|facts\s*pool\s*에/g;

// L1 — 점포명·지점명·행정동 (voice_spec §6, 휴리스틱)
//   "수원점", "봉천점", "강남2호점", "역삼동", "가맹점 2호점" 등
//   허용: "상위 3개점", "하위 3개점" — N+개점 패턴 제외
const STORE_LIKE = /(?<![상하위본직영가맹점\d명])[가-힣]{2,5}점(?:\s|[,.\)])(?!포)/g;
const DONG_LIKE = /[가-힣]{2,5}동(?:\s|[,.\)])(?!네|료|반|시|기간)/g;

// L7 — 입장 명시 (voice_spec §2)
const STANCE_KEYWORDS = ["진입 가능", "조건부 가능", "조건부", "판단 유보", "유보", "비권장"];

// L6 — FAQ 개수 (frontmatter 안 / 본문 별개)
//   호출자가 frontmatter 파싱 후 별도 검증 — 본 함수에선 본문 마크다운만 확인.

/**
 * hard lint 본체.
 * @param body 발행될 markdown 본문 (frontmatter 포함 가능 — 별도 분리 필요).
 */
export function lintV2(body: string): LintV2Result {
  const errors: string[] = [];
  const warnings: string[] = [];

  // L2 시스템 누출 — ERROR
  const sysLeak = body.match(FORBIDDEN_SYS_LEAK);
  if (sysLeak && sysLeak.length > 0) {
    errors.push(`L2 시스템 누출 ${sysLeak.length}건: "${sysLeak[0]}"`);
  }

  // L3 헤지 — ERROR
  const hedge = body.match(FORBIDDEN_HEDGE);
  if (hedge && hedge.length > 0) {
    errors.push(`L3 헤지 표현 ${hedge.length}건: "${hedge.slice(0, 3).join(", ")}"`);
  }

  // L4 본사 홍보 — ERROR
  const promo = body.match(FORBIDDEN_PROMO);
  if (promo && promo.length > 0) {
    errors.push(`L4 본사 홍보 문구 ${promo.length}건: "${promo[0]}"`);
  }

  // L1 점포명·행정동 — WARN (false positive 가능)
  const storeMatches = body.match(STORE_LIKE);
  const dongMatches = body.match(DONG_LIKE);
  const totalLike = (storeMatches?.length ?? 0) + (dongMatches?.length ?? 0);
  if (totalLike > 0) {
    const samples = [...(storeMatches ?? []), ...(dongMatches ?? [])].slice(0, 3);
    warnings.push(`L1 점포명·행정동 의심 ${totalLike}건: "${samples.join(", ")}"`);
  }

  // L7 입장 명시 — ERROR
  const stancePresent = STANCE_KEYWORDS.some((k) => body.includes(k));
  if (!stancePresent) {
    errors.push(
      `L7 입장 키워드 누락 — '진입 가능' / '조건부 가능' / '판단 유보' / '비권장' 중 하나 필수`,
    );
  }

  // L-void 공허 문구 — WARN
  const voidM = body.match(FORBIDDEN_VOID);
  if (voidM && voidM.length > 0) {
    warnings.push(`L-void 공허 문구 ${voidM.length}건: "${voidM[0]}"`);
  }

  return { errors, warnings };
}

/**
 * frontmatter FAQ 갯수 (3~5) 검증.
 */
export function lintV2Faq(faq: unknown): { errors: string[]; warnings: string[] } {
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
