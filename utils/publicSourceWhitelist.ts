/**
 * Public 소스 화이트리스트. GPT 웹검색 / fetch 시 이 도메인만 허용.
 */

export const PUBLIC_SOURCE_WHITELIST = [
  // 정부·공공기관
  "franchise.ftc.go.kr",      // 공정거래위원회 가맹사업정보제공시스템
  "ftc.go.kr",                 // 공정위 본 사이트
  "kosis.kr",                  // 통계청 KOSIS
  "kostat.go.kr",              // 통계청
  "krei.re.kr",                // 한국농촌경제연구원
  "sbiz.or.kr",                // 소상공인시장진흥공단
  "semas.or.kr",               // 소상공인시장진흥공단 (구)
  "data.go.kr",                // 공공데이터포털
  "mss.go.kr",                 // 중소벤처기업부
  "mafra.go.kr",               // 농림축산식품부
  "haccp.or.kr",               // 한국식품안전관리인증원

  // 언론 (팩트체크용)
  "yna.co.kr",
  "yonhapnews.co.kr",
  "news1.kr",
  "newsis.com",
  "hankyung.com",
  "mk.co.kr",
  "seoul.co.kr",
  "sentv.co.kr",
] as const;

export type PublicSourceDomain = typeof PUBLIC_SOURCE_WHITELIST[number];

/**
 * URL 의 호스트가 화이트리스트에 포함되는지 검사.
 * 서브도메인 매칭 허용: "franchise.ftc.go.kr" 은 "ftc.go.kr" 화이트리스트 엔트리에도 매칭.
 */
export function isWhitelistedUrl(url: string): boolean {
  try {
    const host = new URL(url).hostname.toLowerCase();
    return PUBLIC_SOURCE_WHITELIST.some(d =>
      host === d || host.endsWith("." + d),
    );
  } catch {
    return false;
  }
}

/**
 * 화이트리스트에 해당하지 않는 URL 이 감지되면 throw.
 * 시스템 레벨 guard 로 사용.
 */
export function assertWhitelistedUrl(url: string): void {
  if (!isWhitelistedUrl(url)) {
    throw new Error(`[fetchGuard] 화이트리스트 외 도메인 차단: ${url}`);
  }
}
