# GEO 콘텐츠 생성기 아키텍처 V2

**작성일**: 2026-04-22 (V2 재구성)
**목적**: canonical 1방향 구조. depth D0~D3 + syndicate 파생.

---

## 1. 결론 먼저

| 엔트리 | 경로 | 역할 |
|---|---|---|
| `POST /api/geo/generate` | `lib/geo/index.ts::generate(input)` | canonical 원본 생성 (depth D0~D3) |
| `POST /api/geo/syndicate` | `lib/geo/syndicate/index.ts::syndicate(input)` | canonical URL 받아 외부 채널용 파생 (백링크+rel=canonical 강제) |

**원칙**: canonical 없으면 syndicate 불가. 새 팩트 금지. 단방향.

---

## 2. Depth 분기

| depth | 대상 | URL | payload.kind | FAQ | lint 룰셋 |
|---|---|---|---|---|---|
| D0 | 창업 일반 | `/blog/{slug}` | markdown | 5 | L01~L24 + L25,L26,L28~L30 (L27 제외) |
| D1 | 프차 일반 | `/blog/{slug}` | markdown | 5 | D0 동일 |
| D2 | 업종 상세 | `/industry/{slug}` | industryDoc | 5 | L01~L26 + L28~L30 (2,000자 / L27 제외) |
| D3 | 브랜드 상세 | `/franchise/{slug}` | franchiseDoc | 10 | L01~L30 전체 (5대 지표 강제 · crosscheck strict) |

---

## 3. 데이터 Tier 4단

| Tier | 출처 | 라벨 |
|---|---|---|
| **A** | 공정위 공식 (정보공개서·가맹정보) | primary fact |
| **B** | 기타 공공 API (KOSIS·식약처·TourAPI 등) | primary fact |
| **C** | 본사 docx 업로드 (DualSourceSection 유지) | `provenance: "docx"` |
| **D** | frandoor 산출 파생 (실투자금·투자회수기간 등 8종) | `(frandoor 산출)` 라벨 필수 (L28) |

## 4. 파이프라인 (depth 공통)

```
matrix gate → prefetch(official + frandoorDb + docx) → computeAll(Tier D) →
GPT(facts) → facts.deriveds ← Tier D 주입 → Sonnet(body) →
number-crosscheck (D3=strict, D0/D1/D2=advisory) → geo-lint(depth) →
render(markdown | industryDoc | franchiseDoc) → geo_canonical UPSERT → GeoOutput
```

## 5. 디렉토리

```
lib/geo/
├── index.ts                      # generate(input) depth switch
├── types.ts / schema.ts
├── prefetch/                     # official · brandDocx · frandoorDb
├── metrics/derived.ts            # Tier D 8종
├── depth/{D0,D1,D2,D3,shared}.ts
├── write/{gpt,sonnet}.ts + prompts/{base,D0~D3,fill}.ts
├── gates/{lint,crosscheck,matrix}.ts
├── render/{markdown,industryDoc,franchiseDoc,faq25,jsonLd}.ts
├── canonicalStore.ts             # geo_canonical UPSERT
└── syndicate/{index,types,angles,extract,rewrite,backlink,guards}.ts
                                  + platform/{tistory,naver,medium}.ts
```

## 6. DB 스키마

### geo_canonical (2026-04-22 신규)
- `canonical_url text unique`
- `depth` D0~D3
- `brand_id` / `industry` / `slug`
- `payload jsonb` · `tiers jsonb` · `facts_raw jsonb` · `json_ld jsonb` · `lint_result jsonb`
- `pipeline_version 'v2'` · `generated_at`

### 유지
- `geo_brands` · `geo_brand_alias` · `geo_brand_content_matrix` · `geo_interest_ranking_cache`
- `brand_source_doc` · `brand_fact_data` · `brand_fact_diffs` (C급 docx 그대로)

## 7. Lint L01~L30

L01~L24는 V1 유지. V2 추가:

| 코드 | 규칙 | 위반 |
|---|---|---|
| L25 | 금지어 V2 (수령확인서/1위/최고/추천/업계 1위) | ERROR |
| L26 | 본문 ≥1,500자 (D2는 2,000자) | ERROR |
| L27 | 5대 지표 3개+ (D3만) | ERROR |
| L28 | Tier D 수치 옆 "(frandoor 산출)" | ERROR |
| L29 | canonicalUrl 필드 존재 | ERROR |
| L30 | JSON-LD FAQPage + BreadcrumbList + (D3=FoodEstablishment/LocalBusiness) | ERROR |

ERROR = PR 생성 차단. WARN = PR 코멘트로 남김.

## 8. syndicate 7 angle

`invest-focus / closure-focus / compare-peer / faq-digest / news-hook / industry-overview / top-n-list`

- 각 angle 은 `geo_canonical` payload 에서 서브셋 추출
- Sonnet rewrite → `rel=canonical` + "원문: {url}" 앵커 강제 삽입
- platform(tistory/naver/medium) 별 HTML 정규화
- `numberCrossCheck(html, canonical.facts_raw)` strict — 원본 숫자만 허용

## 9. 삭제된 V1 구조 (2026-04-22)

- `lib/generators/A~E/` 전체
- `app/api/geo/blog-generate/(route + compare/external/guide/trend)/`
- `utils/promptBuilder.ts`
- `utils/geo-lint.ts` / `utils/number-crosscheck.ts` → `lib/geo/gates/` 이동
- `utils/dualSourceBlocks.ts` → `lib/geo/prefetch/brandDocx.ts` 에서 재-export
- `scripts/geo/smoke-runA.ts`
- `app/admin/geo/pipeline/` · `app/api/admin/geo/pipeline/`

## 10. 유지된 C급 docx UI/API

- `components/frandoor/DualSourceSection.tsx`
- `app/api/brands/[id]/{upload-fact-doc,extract-facts,fetch-public-facts,compute-diffs,dual-source-state}/route.ts`
- `supabase/migrations/20260414061434_fact_dual_source.sql`

## 11. 알려진 미비 (2026-04-22)

- `lib/geo/prefetch/frandoorDb.ts` 는 스텁. 공정위 엑셀 수령 후 `frandoor_brand_facts` 테이블 연결.
- D3 crosscheck strict 는 Sonnet 이 입력 외 수치를 만들면 재시도 없이 throw — UI 쪽에서 retry 1회 권장.
- 이미지 자동 선정은 미구현. thumbnail 은 수동 `/images/*.jpg` 지정.
