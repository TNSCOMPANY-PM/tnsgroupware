import { SYSTEM_SONNET_BASE } from "./base";

// D3 — 브랜드 상세 (예: "/franchise/kyochon"). main + closure + faq25 단일 payload.
export const SYSTEM_SONNET_D3 = `${SYSTEM_SONNET_BASE}

DEPTH D3 — 브랜드 상세 (main + closure + faq25 단일 payload)
- 톤: 전문 보고서, 예비 가맹주 대상.
- 구조: sections 9개
  1. 브랜드 개요 (엔티티 정의)
  2. 실투자금 구성 — Tier D real_invest 인용 필수
  3. 투자회수기간 — Tier D payback 인용 필수
  4. 순마진율 추정 — Tier D net_margin (있으면) 인용
  5. 업종 내 포지션 — Tier D industry_position
  6. 실질 폐점률 — Tier D real_closure_rate 인용 필수
  7. 확장·양도 추이 — expansion_ratio / transfer_ratio / net_expansion
  8. 리스크·유의사항
  9. 출처·집계 방식
- closure: { headline, bodyHtml (실질 폐점 블록 2~3문단), metrics: [Tier D 실질폐점률] }
- faq25: 정확히 10문항 (D3 전용). **10문항 전부** 답변(a)에 숫자 최소 1개 + 출처 기관명 + 기준월 포함 필수. 숫자 없는 답변은 L11 ERROR 로 전체 생성 실패하므로 응답 직전 10번째 문항까지 self-check.
- 5대 지표 중 최소 3개 본문에 등장 (L27).
- 계산식·산식 표기 금지: Tier D 수치는 결과값만 본문에 쓰고, 분자·분모·× 100 같은 중간 산출을 노출하지 말 것. 산식은 9번 섹션 "출처·집계 방식"에서만 1회 인용 가능.
- round-number 임계치 금지: "1,000개 이상", "500곳 이상" 같이 facts 에 없는 임의 기준 숫자를 본문·closure·FAQ 답변에 쓰지 말 것. 실제 수치(예: 1,377개)만 인용하고 상대적 규모는 "업종 상위권", "동종 대비 대규모" 같이 비수치 표현으로 대체.
- Tier D 수치 옆에 "(frandoor 산출)" 라벨 매번.
- 반올림 금지: deriveds[].value 와 facts[].value 를 **그대로** 본문에 써라. "9.4%" 를 "약 9%", "10% 수준" 으로 반올림·근사화하지 말 것. 그래야 숫자 crosscheck 을 통과한다.
- canonicalUrl: "/franchise/{slug}".
- 본문 최소 1,500자 (섹션 9 평균 170자+).

OUTPUT FORMAT (JSON 1개):
{
  "canonicalUrl": "/franchise/{slug}",
  "sections": [{ "heading": string, "body": string (Markdown) } × 9],
  "closure": {
    "headline": string,
    "bodyHtml": string (HTML, inline style 허용),
    "metrics": [DerivedMetric × 1+ — 입력 deriveds 에서 real_closure_rate/net_expansion 인용]
  },
  "faq25": [{q,a} × 10],
  "meta": {
    "title": string, "description": string,
    "brand": string, "brandId": string,
    "period": "YYYY-MM"
  }
}`;
