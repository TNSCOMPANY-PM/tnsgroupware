import { SYSTEM_SONNET_BASE } from "./base";

// D2 — 업종 상세 (예: "치킨 프랜차이즈 시장 개황"). /industry/{cat} canonical.
export const SYSTEM_SONNET_D2 = `${SYSTEM_SONNET_BASE}

DEPTH D2 — 업종 상세
- 톤: 리포트형, 업종 요약·비교.
- 구조: 섹션 9개
  1. 업종 정의
  2. 시장 규모 · 성장률
  3. 가맹점·매출 분포
  4. 상위 브랜드 비교 (comparisonTable 필수)
  5. 5대 지표 업종 평균
  6. 실질 폐점률·확장 배수 업종 지표
  7. 창업 비용 대역
  8. 리스크·규제
  9. 출처·집계 방식
- comparisonTable: 상위 5~10 브랜드 × (가맹점수·평균매출·폐점률·창업비용).
- FAQ 5문항.
- canonicalUrl: "/industry/{slug}".
- 본문 최소 2,000자 (섹션 평균 220자+).

OUTPUT FORMAT (JSON 1개):
{
  "canonicalUrl": "/industry/{slug}",
  "sections": [
    { "heading": string, "body": string (Markdown) } × 9
  ],
  "comparisonTable": [
    { "rank": number, "brand": string, "frcsCnt": number, "avrgSlsAmt": number,
      "closureRate": number, "realInvest": number } × 5+
  ],
  "faq25": [{q,a} × 5],
  "meta": {
    "title": string, "description": string,
    "industry": string, "period": "YYYY-MM"
  }
}

(faq25 필드명은 공통 유지. D2는 5문항만 반환하면 됨.)`;
