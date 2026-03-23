/**
 * CRM ↔ 매출매입 퍼지 매칭 유틸리티
 *
 * [매칭 알고리즘 설계 근거]
 * 은행 SMS 입금자명은 계좌주 등록명으로, 법인명 전체가 아닌 경우가 많음.
 * 예) "주식회사더널리" → SMS에서 "더널리" 또는 "더널리컴퍼니"로 표시
 *
 * Tier 1. 정규화 후 완전 일치 (score = 1.0)
 * Tier 2. 정규화 후 부분 문자열 포함 관계:
 *   - 양쪽 중 짧은 쪽이 긴 쪽에 포함될 때
 *   - 짧은 쪽이 최소 3글자 이상
 *   - 짧은 쪽이 긴 쪽의 50% 이상 (너무 짧은 공통 문자열로 인한 오매핑 방지)
 *
 * 임계값 50% + 최소 3글자의 근거:
 *   "더널리"(3) ⊆ "더널리컴퍼니"(6): 3/6 = 50% → 매칭 ✓
 *   "이지임스"(4) ⊆ "이지임스코리아"(7): 4/7 = 57% → 매칭 ✓
 *   "삼성"(2): 최소 글자 미달 → 제외 ✗ (흔한 단어로 인한 오매핑 방지)
 */

export type ClientForMatch = {
  id: string;
  name: string;
  category: string | null;
  aliases: string[];
  representative?: string | null;
};

export type MatchResult = {
  client: ClientForMatch;
  /** 매칭 점수 0.5~1.0 */
  score: number;
  /** 어떤 이름/별칭이 매칭됐는지 */
  matchedVia: string;
};

/** 법인 접두/접미사 제거 + 공백 제거 + 소문자 정규화 */
export function normalizeCompanyName(name: string): string {
  return name
    .replace(/[\s\u00A0\t]/g, "")
    .replace(/^(주식회사|유한회사|합자회사|사단법인|재단법인|농업회사법인)/g, "")
    .replace(/(주식회사|유한회사|합자회사)$/g, "")
    .replace(/^(\(주\)|㈜|\(유\)|\(사\)|㈔)/g, "")
    .replace(/(\(주\)|㈜|\(유\)|\(사\)|㈔)$/g, "")
    .toLowerCase();
}

/** 단일 이름 쌍 매칭 점수 계산 (0이면 불일치) */
function scorePair(a: string, b: string): number {
  const na = normalizeCompanyName(a);
  const nb = normalizeCompanyName(b);
  if (!na || !nb) return 0;

  if (na === nb) return 1.0;

  const [shorter, longer] = na.length <= nb.length ? [na, nb] : [nb, na];
  if (shorter.length < 3) return 0; // 최소 3글자

  if (longer.includes(shorter)) {
    const coverage = shorter.length / longer.length;
    return coverage >= 0.5 ? coverage : 0;
  }

  return 0;
}

/**
 * 입금자명(senderName)과 가장 잘 매칭되는 CRM 거래처를 반환.
 * 매칭 없으면 null.
 */
export function matchClient(
  senderName: string,
  clients: ClientForMatch[]
): MatchResult | null {
  if (!senderName.trim()) return null;

  let best: MatchResult | null = null;

  for (const client of clients) {
    const candidates = [client.name, ...client.aliases, client.representative].filter(Boolean) as string[];
    for (const candidate of candidates) {
      if (!candidate) continue;
      const score = scorePair(senderName, candidate);
      if (score > 0 && (!best || score > best.score)) {
        best = { client, score, matchedVia: candidate };
      }
    }
  }

  return best;
}
