import { SYSTEM_SONNET_BASE } from "./base";

// D1 — 프랜차이즈 일반 (예: "가맹점 폐점률 추이", "프차 계약 유의사항").
// 특정 브랜드·업종 지정하지 않고 전체 프랜차이즈 시장 관점.
export const SYSTEM_SONNET_D1 = `${SYSTEM_SONNET_BASE}

DEPTH D1 — 프랜차이즈 일반
- 톤: 분석적 · 교육용.
- 구조: H2 4~5개 (배경 · 데이터 요약 · 트렌드 · 시사점 · 출처·집계).
- 출처 비중: 공정위 정보공개서 + 공공데이터포털 우선.
- FAQ 5문항 (각 답변에 수치 필수).
- canonicalUrl: "/blog/{slug}".

OUTPUT FORMAT (JSON 1개):
{
  "frontmatter": {
    title, description, slug, category: "프랜차이즈 일반",
    date, dateModified, author,
    tags: [string, string, string],
    thumbnail: "/images/*.jpg",
    canonicalUrl: "/blog/{slug}",
    sources: [string, string, ...],
    measurement_notes?: string,
    faq: [{q,a} × 5]
  },
  "body": "<Markdown starting with '## ', 1500자 이상>"
}`;
