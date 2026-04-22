# 프랜도어 콘텐츠 구성 가이드 v1

**작성일**: 2026-04-22 (사이트 담당자 업로드 `frandoor_콘텐츠_구성_가이드_v1.docx` 발췌)
**적용**: `POST /api/geo/generate` (V2) · depth D0~D3 전체

---

## 1. 분량

- **본문 최소 1,500자** (D0/D1/D3 main). D2(업종 리포트)는 2,000자 이상.
- 문단 2~4개로 분할. 한 단락 500자 초과 금지.

## 2. 상위 100개 집중

- 월간 신규 글 상한 50건, 기존 글 수정 포함 100건.
- 검색량 상위 100개 키워드 · 브랜드에 자원 집중.
- 나머지는 canonical 재활용 + syndicate 파생으로 커버.

## 3. 5대 핵심 지표 (D3 필수, D2 권장)

| # | 지표 | 단위 | 근거 |
|---|---|---|---|
| 1 | **실투자금** | 만원 | 가맹금+교육비+보증금+기타비용 |
| 2 | **투자회수기간** | 개월 | 실투자금 / (연매출 × 순마진율 / 12) |
| 3 | **순마진율** | % | 업종 평균 대비 배수 기반 추정 |
| 4 | **업종 내 포지션** | % (백분위) | 매출 기준 peer 순위 |
| 5 | **실질 폐점률** | % | (계약종료+해지+명의변경) / 기초가맹점수 × 100 |

- 5대 지표를 본문에 최소 3개 이상 인용해야 D3 lint(L27) 통과.
- 모든 Tier D 수치 옆 **"(frandoor 산출)"** 라벨 필수 (L28).

## 4. 파생지표 추가 3종 (D2/D3 선택)

- **확장배수** = 신규개점 / 기초점포수 (배)
- **양도양수비율** = 명의변경 / 기초점포수 × 100 (%)
- **순확장수** = 신규 - (계약종료+해지) (개)

## 5. URL 경로 규약

| depth | URL 형식 | 예시 |
|---|---|---|
| D0/D1 | `/blog/{slug}` | `/blog/chicken-franchise-interest-2026-04` |
| D2 | `/industry/{slug}` | `/industry/chicken` |
| D3 | `/franchise/{slug}` | `/franchise/kyochon` |

- slug: 영어 소문자 + 하이픈만. 핵심 키워드 포함.
- 모든 depth 에서 `frontmatter.canonicalUrl` 또는 payload 에 canonical 자기참조 필수 (L29).

## 6. FAQ 구성

| depth | 문항 수 |
|---|---|
| D0/D1/D2 | 5 |
| D3 | 10 |

- 각 답변에 숫자 + 출처 + 기준월 포함 (L10, L11).
- 금지: "대략 몇 %", "전문가에 따르면" 같은 추정 답변.

## 7. 금지어 확장 (L25)

- `수령확인서` (오해 소지)
- `1위` / `업계 1위` (특정 브랜드 우위 단정 금지)
- `최고` / `추천` (주관적 평가 금지)
- V1 금지어 그대로 유지: `약`, `대략`, `정도`, `쯤`, `아마도`, `업계 관계자`, `많은 전문가`

## 8. thumbnail 정책 (L19)

- `/images/{영어-하이픈}.{jpg|jpeg|png|webp}` 상대경로만.
- 외부 URL (Unsplash 직접 링크 등) 금지.
- public/images/ 에 파일 업로드 선행.

## 9. JSON-LD (L30)

| depth | 필수 |
|---|---|
| D0/D1 | FAQPage + BreadcrumbList |
| D2 | FAQPage + BreadcrumbList (+ ItemList 권장) |
| D3 | FAQPage + BreadcrumbList + **FoodEstablishment** (또는 LocalBusiness) |

`lib/geo/render/jsonLd.ts` 의 `buildFaqPage`, `buildBreadcrumb`, `buildFoodEstablishment` 사용.

## 10. crosscheck 엄격도 (2026-04-22 결정)

- D0/D1/D2: advisory (로그만 남기고 통과)
- D3: **strict** (본문 숫자가 facts/deriveds 에 없으면 throw)

## 11. canonical 저장 + syndicate

- generate 성공 시 `geo_canonical` upsert (conflict: canonical_url).
- syndicate 는 canonical 이 있어야만 동작. 7 angle × 3 platform.
- 원본에 없는 숫자 절대 생성 금지. `rel=canonical` + "원문:" 앵커 강제.
