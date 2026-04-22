# 프랜도어 콘텐츠 퀄리티 가드 · EEAT + Leadgen 통합

**작성일**: 2026-04-22
**목적**: 생성기 A~E가 찍어내는 모든 `.md` 출력물의 퀄리티를 균일하게 맞추기 위한 단일 기준서.
**적용 범위**: `content/blog/*.md` 전수 + 랭킹 페이지 본문 영역.

---

## 0. 세 가지 원칙, 한 번에 충족

이전에 우리는 **AI 인용 5원칙**과 **이중 독자(인간·LLM)** 두 축을 깔았다. 여기에 Google **E-E-A-T 4축**과 리드젠랩 **구조 명확성 원칙**을 덧댄다. 세 가지가 배타 아닌 중첩 관계로 설계되어, 한 번 lint 통과하면 전부 충족.

| 축 | 기원 | 우리 파이프라인 안에서 판정 |
|---|---|---|
| 5원칙 | 우리 설계서 | geo-lint.ts 결정적 검증 |
| 이중 독자 | 우리 설계서 | 첫 문장·구조·가드레일 규칙 |
| E-E-A-T | Google Quality Rater Guidelines | 본문 시그널 + frontmatter 메타 + 저자 페이지 |
| 구조 명확성 | 리드젠랩 방법론 | Canonical + Schema + 엔티티 정의 문단 |

---

## 1. E-E-A-T를 콘텐츠 본문에 "어떻게" 심는가

Google은 Mar 2026 core update에서 **Experience(첫 번째 E)**의 가중치를 크게 올렸다. 단순히 사실 나열이 아니라 **1차 경험·고유 관찰·검증 가능한 저자 크레딧**이 있는 콘텐츠가 상위 노출.

우리는 AI 생성 콘텐츠라서 1차 "체험"이 없다는 한계가 있다. 이를 보완하는 방법은 **데이터 1차 관찰**로 치환 — 즉 네이버 검색광고 API 집계·FTC 정보공개서 원본 수치를 "직접 집계해 발견한 사실"로 제시하는 것. 이건 실제로 우리가 수행하는 행위이므로 허위 주장 아님.

### E-E-A-T 4축 본문·메타 매핑

| 축 | 본문에 심는 방법 | Frontmatter/메타에 심는 방법 |
|---|---|---|
| **Experience** (1차 경험) | "2026년 4월 네이버 검색광고 API 집계 결과, 120 alias의 월간 검색량을 **직접 집계**하여 비교" 문장 1회 이상 / 데이터 이상치(파리바게뜨 alias 12배 사례 등) 관찰 멘트 1회 / 집계 방법 1~2문장 명시 | `author: 프랜도어 편집팀` / `reviewed_by: (담당자명)` / `data_collected_at: 2026-04-XX` |
| **Expertise** (전문성) | 업종 맥락 해설 1단락 (예: "치킨 프랜차이즈는 교촌·BHC·BBQ 3강 구조이나 검색량 기준으로는 교촌이…") / 수치 해석 가이드 카드 | `category: {14 타입 중 1}` / `tags: ["치킨","관심도랭킹","2026-04"]` |
| **Authoritativeness** (권위성) | 공정위 정보공개서·네이버 검색광고 API·공공데이터포털 **기관명 + URL** 본문 내 1회 이상 / 대체 소스 2개 이상 교차 | frontmatter `sources: ["https://franchise.ftc.go.kr/...", "https://searchad.naver.com/..."]` |
| **Trustworthiness** (신뢰성) | 기준월 YYYY-MM 모든 수치 옆·메타박스 필수 / 갱신 주기 명시 / 데이터 한계 각주 (예: "< 10 처리 규칙") / 창업불가 브랜드 뱃지·사유 | `date: YYYY-MM-DD` / `dateModified: YYYY-MM-DD` / `measurement_notes: "alias-max 집계, <10은 5로 치환"` |

### 필수 본문 블록 (모든 `.md` 공통)

생성기는 본문에 아래 4개 블록을 **반드시** 포함시킨다:

1. **엔티티 정의 리드**: 첫 H2 직후 1문단에 "브랜드/주제 = 업종 + 기준월 + 핵심 수치 2개 + 출처" 압축.
2. **비교·해설 본문**: H2 3~5개, 각 800자 이내.
3. **해석 가이드 카드**: "이 수치가 의미하는 것 / 의미하지 않는 것" 대비 구조.
4. **출처·집계 방식 섹션**: 데이터 소스·기준월·갱신 주기·데이터 한계 각주.

---

## 2. 리드젠랩 원칙에서 우리가 쓸 것 / 버릴 것

| 원칙 | 처리 | 이유 |
|---|---|---|
| Canonical Tag 자기참조 | ✅ 채택 | 블로그 엔진이 자동 처리하되 랭킹 페이지는 수동 설정 필요 |
| Schema.org JSON-LD (Article/Organization/FAQ) | ✅ 채택 | 블로그는 엔진 자동, 랭킹은 ItemList+Dataset 수동 |
| 엔티티 중심(키워드 → 엔티티) | ✅ 채택 | 첫 등장 공식명 + 브랜드 엔티티 자동 링크 |
| H1 1개 · H2 3~5 · 계층 | ✅ 채택 | geo-lint 규칙으로 강제 |
| 내부링크 최소 3개 | ✅ 채택 | 관련 브랜드·업종·콘텐츠 크로스링크 |
| 이미지 Alt "브랜드명 + 설명" | ✅ 채택 | 썸네일 alt 규칙, 과도한 키워드 도배 금지 |
| Meta Title 50~60자 + 엔티티 포함 | ✅ 채택 | frontmatter `title` lint로 길이 검증 |
| Core Web Vitals (LCP/CLS/INP) | ⚠️ 플랫폼 담당 | 콘텐츠 생성 단계에서 관여 불가, 블로그 엔진 레벨 이슈 |
| AI 언급률(mention rate) 측정 | ✅ 채택 | 성공 지표로 채택 (월 테스트 쿼리 30건) |
| "도메인 점수 중심 최적화" 회피 | ✅ 채택 | 우리는 처음부터 엔티티·구조 중심이라 해당 없음 |

---

## 3. 생성기 프롬프트에 추가할 규칙 (Sonnet·GPT 각각)

### GPT (서칭 단계) 프롬프트 확장

```
ADDITIONAL RULES:
- For every fact, return source_title in the form "{기관명} {문서명}"
  (예: "공정거래위원회 정보공개서 2025년판" / "네이버 검색광고 API keywordstool endpoint")
- For every fact, require at least ONE of: (a) 공정위/공공데이터포털/공식API URL,
  (b) 브랜드 공식 홈페이지 URL.
- If the only available source is a secondary blog/news aggregator, set
  "authoritativeness": "secondary" and flag `conflicts: [{field, reason: "no primary source"}]`.
- Capture `collected_at: YYYY-MM-DD` timestamp at the top level.
- If a value is a floor value ("< 10" from 네이버 API), return `measurement_floor: true`.
```

### Sonnet (작성 단계) 프롬프트 확장

```
E-E-A-T EMBEDDING RULES (in addition to prior 5원칙):
① Experience — include 1 sentence describing "우리가 실제로 집계한 방법".
   Example: "2026년 4월 네이버 검색광고 API로 120개 alias의 월간 검색량을 직접 집계함."
② Expertise — include 1 paragraph of 업종 context linking numbers to market structure.
③ Authoritativeness — cite 기관명 + URL inline at least once in body.
   Forbidden: paraphrased attribution without 기관명.
④ Trustworthiness — every numeric must have 기준월 within same sentence or in the section caption.
   If `measurement_floor` is true, write "(< 10, 5로 치환)" marginalia.

ENTITY DEFINITION LEAD (required first paragraph after first H2):
Pattern: "{브랜드/주제}는 {업종} 프랜차이즈로, {YYYY-MM} 기준 {지표1: 수치} · {지표2: 수치}.
출처: {기관명 ≥1개}."

FORBIDDEN OUTPUTS:
- H1 생성 (블로그 엔진이 title을 H1로 자동 렌더)
- 수치 없는 FAQ 답변
- "많은 전문가들이 말하기를…" 같은 근거 없는 권위 주장
- "업계 관계자에 따르면" — 1차 출처로 대체해야 함
```

---

## 4. geo-lint.ts 규칙 확장 (결정적 검증)

기존 5원칙 lint + 아래 EEAT/구조 규칙 추가. 모두 코드로 판정 가능.

| 규칙 | 패턴/로직 | 위반 시 |
|---|---|---|
| L01 금지어 | `/(약|대략|정도|쯤|아마도|업계\s*관계자|많은\s*전문가)/` | ERROR |
| L02 기준월 존재 | `/\d{4}-\d{2}|\d{4}년\s*\d{1,2}월/` 본문에 1회 이상 | ERROR |
| L03 첫 H2 리드 숫자 | 첫 H2 뒤 500자 내 숫자 literal ≥ 2개 | ERROR |
| L04 엔티티 정의 패턴 | 첫 H2 리드에 `.*(프랜차이즈|브랜드|업종).*기준.*(출처|네이버|공정위)` | ERROR |
| L05 기관명 출처 | 본문에 `/공정거래위원회|공정위|네이버\s*검색광고|공공데이터포털/` 1회 이상 | ERROR |
| L06 URL 출처 | 본문/frontmatter sources에 https URL 1개 이상 | ERROR |
| L07 H1 금지 | 본문에 `^# ` 없음 (블로그 엔진이 title→H1 처리) | ERROR |
| L08 H2 개수 | 3 ≤ H2 ≤ 6 | WARN→ERROR |
| L09 H3 계층 | H3는 H2 뒤에만 등장 (orphan H3 금지) | ERROR |
| L10 FAQ 카운트 | frontmatter faq 배열 길이 ≥ 2 | ERROR |
| L11 FAQ 답변 숫자 | 각 faq.a에 숫자 literal ≥ 1 | ERROR |
| L12 매트릭스 준수 | frontmatter category + 본문 등장 브랜드 → matrix-guard 검증 | ERROR |
| L13 창업불가 뱃지 | 창업불가 브랜드 등장 시 `❌` 또는 `직영` 사유 1줄 | ERROR |
| L14 해석 가이드 블록 | 본문에 "의미하는|의미하지 않는" 또는 "(참고|유의)" 카드 섹션 | WARN |
| L15 출처·집계 방식 | 본문 마지막 H2 `출처` 또는 `집계` 포함 | WARN |
| L16 Title 길이 | frontmatter title 한글 25~45자 (영문 50~60자 상당) | WARN |
| L17 description 길이 | 80~120자 | WARN |
| L18 tags 개수 | 3~5개 | WARN |
| L19 thumbnail 상대경로 | `/^\/images\/[a-z0-9][a-z0-9-]*\.(jpg\|jpeg\|png\|webp)$/i` (외부 URL 금지, public/images/ 업로드 필수) | ERROR |
| L20 author 메타 | frontmatter `author` 존재 | WARN |
| L21 dateModified | frontmatter `dateModified` 존재 (갱신 시 필수) | WARN |
| L22 measurement_floor 표기 | floor 사실 포함 시 본문에 "(< 10" 또는 "최소값" 문구 | WARN |
| L23 내부 링크 | 본문에 `[.*](/.*)` Markdown 내부 링크 ≥ 3개 | WARN |
| L24 이중 소스 | GPT facts에 source_url ≥ 2개 고유 도메인 (검증 게이트) | ERROR |

**ERROR = PR 생성 차단. WARN = PR 코멘트로 남김.**

---

## 5. 균일 퀄리티 보장: "한 번에 PASS" 설계

생성 1건당 게이트 3단:

```
GATE-1 (GPT 단계): Zod schema validation + authoritativeness ≠ "secondary" (또는 쌍대 소스 있음)
GATE-2 (Sonnet 출력): geo-lint.ts 통과 (ERROR 0건)
GATE-3 (Cross-check): GPT JSON facts ↔ Sonnet 본문 숫자 완전 일치
```

세 게이트를 모두 통과한 경우에만 `frandoor-pr.ts`가 GitHub PR 생성. 게이트 실패 로그는 Slack #geo-pipeline 채널로 자동 전송.

---

## 6. 샘플 합격 콘텐츠 1건 (치트시트)

```markdown
---
title: "2026년 4월 치킨 프랜차이즈 관심도 TOP 10 — 교촌 40만 · BHC 35만"
description: "2026-04 네이버 검색광고 API 기준 치킨 프랜차이즈 검색량 TOP 10. 1위 교촌치킨(40만), 2위 BHC(35만). 출처: 네이버 검색광고 API."
slug: "chicken-franchise-interest-ranking-2026-04"
category: "관심도 랭킹"
date: "2026-04-22"
dateModified: "2026-04-22"
author: "프랜도어 편집팀"
tags: ["치킨", "관심도랭킹", "2026-04"]
thumbnail: "/images/chicken-franchise-2026-04.jpg"
sources:
  - "https://searchad.naver.com/"
  - "https://franchise.ftc.go.kr/"
measurement_notes: "alias-max 집계, 네이버 API '< 10'은 5로 치환"
faq:
  - q: "2026년 4월 검색량 1위 치킨 프랜차이즈는?"
    a: "교촌치킨(40만회, 네이버 검색광고 API 2026-04 집계)."
  - q: "치킨 프랜차이즈 중 창업 가능한 브랜드는?"
    a: "TOP 10 중 10개 모두 가맹 형태. 공정거래위원회 정보공개서 기준."
---

## 2026년 4월 치킨 프랜차이즈 검색량 순위

치킨 프랜차이즈는 2026년 4월 네이버 검색광고 API 집계에서 교촌치킨(40만회) · BHC(35만회) · BBQ(32만회) 순으로 나타났다. 프랜도어가 120개 alias를 직접 집계한 결과이며, 기준월은 2026-04. 출처: 네이버 검색광고 API.

## 업종 맥락

치킨 프랜차이즈는 국내 외식 3강 구조(교촌·BHC·BBQ)로 알려져 있으나, 검색량 기준 1위는 교촌이며 이는 공정거래위원회 정보공개서상 가맹점 수 순위와 일치…

## 해석 가이드

**이 수치가 의미하는 것**: 소비자 관심 총량. **의미하지 않는 것**: 창업 매력도·가맹 수익성은 별도 지표로 확인 필요.

## 출처·집계 방식

- 데이터: 네이버 검색광고 API `/keywordstool`, 2026-04 월간 집계
- 교차검증: 공정거래위원회 정보공개서 (https://franchise.ftc.go.kr)
- 갱신 주기: 월 1회
- 데이터 한계: alias 간 표기 차이로 검색량 편차 발생 가능 (alias-max 방식 채택)
```

위 샘플은 5원칙 + E-E-A-T 4축 + 리드젠 구조 명확성 + 이중 독자 요구사항을 한 번에 통과.

---

## 7. 운용 원칙

1. **수정은 가드 문서에 먼저 반영**, 그 다음 프롬프트와 lint 코드에 동기화.
2. **lint ERROR 룰을 늘릴 때마다** 과거 산출 샘플 10건을 회귀 테스트해 false positive 확인.
3. **분기 1회 EEAT 트렌드 리뷰** (Google Search Central 블로그 + 리드젠랩 최신 글) → 가드 문서 v 업.
4. 콘텐츠 담당이 "직접 쓰는 글"도 이 가드를 동일 적용 — AI·사람 어느 쪽이 써도 동일 기준.

---

## 부록 · 참고

- Google E-E-A-T 2026 업데이트: Experience 가중치 증가, 저자 페이지·크레딧 영향 커짐.
- 리드젠랩 방법론 추출 노트: `outputs/leadgen_team_methodology_extraction.md`
- 리드젠랩 기반 lint 규칙 JSON 초안: `outputs/frandoor_geo_lint_checklist.json`
