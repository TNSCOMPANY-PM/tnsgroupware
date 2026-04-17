# 팩트 데이터 이중 소스 + 차이 자동 콘텐츠화 (2026-04-14)

> 본 문서가 최종 설계다. 아래 두 문서는 무시:
> - `FACT_EXTRACT_REDESIGN_2026-04-14.md` (초기 설계, supersede)
> - `FACT_LOCKED_SOURCE_2026-04-14.md` (docx 단일 소스 설계, supersede)

---

## 핵심 아이디어

> **"담당자가 정제한 docx + 공신력 있는 공개 자료(공정위 등) 두 소스만 허용.
> 두 소스 수치가 다르면 '왜 다른지' 자동으로 분석해서 블로그 섹션으로 만든다."**

이 "차이 분석 섹션" 이 블로그의 **킬러 콘텐츠**. 예시:

> ### 공정위 공시 월 5,210만원 vs 본사 POS 평균 3,902만원 — 왜 다른가?
> 공정위 정보공개서는 **2024년 초기 서울 중심 21개점 평균**입니다.
> 본사 POS 집계는 **2026년 3월 기준 52개점 전체 평균**으로, 2025년 한 해에만
> 28개점이 신규 오픈하면서 평균이 재조정됐습니다. 신규 매장은 오픈 초기 매출이
> 낮아 평균을 끌어내리지만, 상위 매장(등촌점 26.3 1억 391만원)은 공정위 공시
> 평균을 2배 이상 상회합니다.

이런 섹션이 **자동 생성**되면:
- 독자의 가장 큰 의문 ("홈피 수치랑 공정위 수치가 왜 달라?")을 선제 해소
- AEO·GEO 관점에서 AI 검색엔진이 "이 브랜드는 왜 수치가 다른가?" 질의에 이 글을 답으로 채택할 확률 ↑
- 담당자가 매번 수동으로 비교 안 해도 됨

---

## 허용된 두 소스

### 소스 A: Private Source (docx 1개)

- 브랜드 담당자가 수집·정제한 자료
- 브로셔 / 본사 제공 POS / SNS / 언론 보도 등 담당자가 직접 검증한 출처만 표기
- **"본사 카카오톡 확인" 류 구두 확인 수치는 추출 시 탈락** (근거 약함)
- 브랜드당 1개만 업로드, 덮어쓰기 방식

### 소스 B: Public Source (GPT 가 가져옴)

화이트리스트 도메인에서만 웹검색·페이지 fetch 허용:

```ts
// utils/publicSourceWhitelist.ts
export const PUBLIC_SOURCE_WHITELIST = [
  // 정부·공공기관
  "franchise.ftc.go.kr",      // 공정거래위원회 가맹사업정보제공시스템
  "ftc.go.kr",                 // 공정위 본 사이트
  "kosis.kr",                  // 통계청 KOSIS
  "kostat.go.kr",              // 통계청
  "krei.re.kr",                // 농촌경제연구원
  "sbiz.or.kr",                // 소상공인시장진흥공단
  "semas.or.kr",               // 소상공인시장진흥공단 (구)
  "data.go.kr",                // 공공데이터포털
  "mss.go.kr",                 // 중소벤처기업부
  "mafra.go.kr",               // 농림축산식품부
  "haccp.or.kr",               // 한국식품안전관리인증원
  // 언론 (팩트 체크 용도로만)
  "yna.co.kr", "yonhapnews.co.kr", "news1.kr", "newsis.com",
  "hankyung.com", "mk.co.kr", "seoul.co.kr", "sentv.co.kr",
] as const;
```

도메인이 이 리스트에 없으면 GPT 가 fetch 못하게 시스템 레벨에서 차단.

---

## 데이터 구조

### brand_source_doc (docx 원본)

```
- brand_id (PK)
- file_name
- markdown_text  (docx → markdown 변환본, 표 구조 보존)
- file_hash
- uploaded_at
```

### brand_fact_data (팩트 레코드)

```
- id
- brand_id
- label       : FACT_LABEL_ENUM 의 표준 라벨 (예: "월평균매출")
- value       : 원문 그대로의 수치 ("약 5,210만원")
- value_normalized : 비교용 정규화 값 (숫자만 52100000)
- source_type : "공정위" | "본사_브로셔" | "POS_실거래" | "공식_홈페이지"
                | "언론_보도" | "정부_통계" | "공식_SNS" | "공식_인증"
- source_note : 원문에 쓰여있던 출처 문구 (예: "2024년 서울 21개점 평균")
- source_url  : 있으면 URL (공정위 페이지, 기사 링크 등)
- provenance  : "docx" | "public_fetch"  — 어느 소스에서 왔는지
- fetched_at  : public 이면 fetch 시각
```

**핵심**: 같은 `label` 에 대해 **여러 레코드가 공존** 가능. docx 에 있는 수치와 공정위 웹에서 가져온 수치가 각각 저장됨.

### brand_fact_diffs (차이 레코드)

```
- id
- brand_id
- label       : 어느 라벨에서 차이가 났는지
- value_a     : 레코드 A (보통 docx)
- value_b     : 레코드 B (보통 공정위)
- diff_ratio  : |a - b| / max(a, b)
- diff_reason : GPT 가 분석한 차이 원인 (자연어 3~5문장)
- diff_status : "confirmed" | "pending" | "dismissed"
- generated_at
```

---

## 파이프라인

### 1단계. docx 추출

- docx 업로드 → `parseFile()` → markdown
- GPT 호출 1회 → 팩트 추출 (`provenance: "docx"`)
- `brand_source_doc.markdown_text` 에 markdown 저장
- `brand_fact_data` 에 개별 팩트 저장

### 2단계. Public 수집

docx 추출이 끝나면 자동 실행:

- GPT 에게 브랜드명 + label 목록 제공
- 화이트리스트 도메인에서만 fetch (시스템 guard)
- 주요 수집 대상:
  - **공정위 정보공개서**: franchise.ftc.go.kr 에서 해당 브랜드 조회
  - **정부 통계**: KOSIS·공정위 가맹사업 통계 (업종 평균)
  - **언론 보도**: 최근 1년 내 기사 (팩트 체크용)
- 수집된 각 수치를 `brand_fact_data` 에 `provenance: "public_fetch"` 로 저장

### 3단계. 교차 대조

- 같은 `label` 에 여러 레코드가 있으면 → 비교
- 정규화 값(`value_normalized`) 기준 `diff_ratio > 0.05` (5% 이상 차이)면 플래그
- 플래그된 쌍을 `brand_fact_diffs` 에 기록
- 각 diff 에 대해 GPT 호출 → 차이 원인 분석
  - 입력: value_a, value_b, source_note_a, source_note_b, docx 원문 관련 섹션
  - 출력: 3~5문장 자연어 분석 (시점 차이 / 표본 차이 / 기준 차이 / 범위 차이 등)

### 4단계. 블로그 생성

프롬프트에 세 블록 주입:

```
[DOCX_SOURCE]
{brand_source_doc.markdown_text 전체}
[/DOCX_SOURCE]

[PUBLIC_FACTS]
공정위 공시 등 공신력 소스에서 수집한 팩트 리스트
- label / value / source_type / source_url / fetched_at
[/PUBLIC_FACTS]

[DIFFS_AUTO]
교차 대조에서 플래그된 차이 + GPT 가 분석한 원인
- label / value_a / value_b / diff_reason
[/DIFFS_AUTO]
```

### 블로그 작성 규칙

```
1. [DOCX_SOURCE] 와 [PUBLIC_FACTS] 에 명시된 팩트만 사용. 이 두 블록 밖의
   수치·주장은 절대 쓰지 마라. (GPT 자체 지식으로 업종 평균·통계 끌어오지 말 것)

2. 같은 label 에 대해 두 소스의 수치가 다를 때:
   - 두 수치를 모두 제시하라 (공정위 공시 X, 본사 POS Y)
   - [DIFFS_AUTO] 의 diff_reason 을 차이 분석 섹션으로 자연스럽게 포함하라
   - "왜 다른가?" 소제목의 별도 섹션을 두는 것이 원칙

3. 출처 인용 표기:
   - source_type = "공정위" → "공정거래위원회 정보공개서 기준"
   - source_type = "본사_브로셔" → "본사 공식 브로셔 기준"
   - source_type = "POS_실거래" → "본사 POS 집계 기준"
   - source_type = "정부_통계" → "공정거래위원회 가맹사업 통계 기준"
   - source_type = "언론_보도" → 매체명 명시

4. 웹검색 툴(tools) 사용 금지. 이미 수집된 [PUBLIC_FACTS] 만 사용하라.
```

### 5단계. 본문 검증

- `utils/blogFactCheck.ts` 실행
- 본문의 모든 수치·고유명사가 `[DOCX_SOURCE]` 또는 `[PUBLIC_FACTS]` 에 있는지 확인
- 차이 분석 섹션의 주장이 `[DIFFS_AUTO]` 의 diff_reason 에 기반했는지 확인
- violations 있으면 저장/발행 차단

---

## FACT_LABEL_ENUM (교차 대조 가능한 표준 라벨)

두 소스를 비교하려면 **표준 라벨이 필수**. 라벨이 다르면 매칭 불가.

```ts
// utils/factSchema.ts
export const FACT_LABEL_ENUM = [
  // 매출·수익
  "연평균매출",
  "월평균매출",
  "최고월매출",
  "영업이익률",
  "당기순이익",

  // 창업비용
  "창업비용총액",
  "가맹비",
  "교육비",
  "보증금",
  "인테리어비",
  "기타창업비용",

  // 가맹사업
  "가맹점수_전체",
  "가맹점수_직영",
  "신규개점수",
  "계약해지수",
  "계약기간",

  // 재무 (공정위 본사 재무)
  "자산",
  "부채",
  "자본",
  "매출액_본사",

  // 운영
  "적정평수",
  "운영인원",
  "투자회수기간",
  "로열티",

  // 기타
  "법위반이력",
  "가맹사업개시일",
  "브랜드수",
] as const;
```

이 enum 으로 GPT 에게 Structured Outputs 강제.
→ docx 의 "월 환산 평균" 도 `"월평균매출"` 로 매핑, 공정위 페이지의 "1개월 평균매출액" 도 `"월평균매출"` 로 매핑 → 교차 대조 가능.

---

## 작업 순서

**Phase 1: 기반 스키마**
1. `utils/factSchema.ts` — FACT_LABEL_ENUM, FACT_SOURCE_TYPE, JSON Schema 정의
2. `utils/publicSourceWhitelist.ts` — 화이트리스트 도메인
3. DB 마이그레이션: `brand_source_doc`, `brand_fact_data`(재구성), `brand_fact_diffs` 신규

**Phase 2: docx 추출**
4. `app/api/geo/upload-brand-file` — docx 만 허용, 10MB 제한
5. `app/api/geo/extract-facts` — docx 1개 → markdown → 팩트 Structured Outputs
6. 추출 프롬프트에 "본사 카톡 탈락" 규칙 명시

**Phase 3: Public 수집**
7. `app/api/geo/fetch-public-facts` 신규
8. GPT 웹검색을 화이트리스트로 제한 (guard middleware)
9. 공정위 franchise.ftc.go.kr 에서 브랜드명 조회 → 정보공개서 페이지 파싱
10. 동일 label 로 normalized 저장

**Phase 4: 교차 대조**
11. `app/api/geo/compute-diffs` 신규
12. label 별로 레코드 쌍 조회 → diff_ratio 계산 → GPT 로 원인 분석
13. `brand_fact_diffs` 저장

**Phase 5: 블로그 생성 개편**
14. `app/api/geo/blog-generate` 프롬프트에 세 블록 주입
15. `tools` 는 공정위 화이트리스트 웹검색만 허용 (또는 아예 비활성화 + 사전 수집만 사용)
16. Structured Outputs 로 citations[] 강제

**Phase 6: 검증·UI**
17. `utils/blogFactCheck.ts` 구현
18. 브랜드 관리 UI 에 "팩트 재추출" / "Public 재수집" / "차이 분석 보기" 버튼
19. 오공김밥 v5 docx 로 실증 (공정위 5,210만 ↔ 본사 POS 3,902만 차이 분석 섹션이 자동 생성되는지)

---

## 완료 기준

1. docx 1개만 업로드 가능 (브랜드당)
2. Public 수집은 화이트리스트 도메인에서만 가능, 시스템 guard 로 차단
3. 같은 label 에 docx 수치 + 공정위 수치가 병존 저장됨
4. 수치 차이 5% 이상일 때 `brand_fact_diffs` 에 자동 기록 + 원인 분석 생성
5. 블로그 본문의 모든 수치가 docx 또는 public_fetch 에 존재함을 자동 검증
6. 오공김밥 v5 로 재생성한 블로그에 **"왜 다른가" 차이 분석 섹션 자동 포함**
7. 블로그에 "공정위 공시 순마진 17~23%" 같은 허위 인용 없음 (본사 카톡 수치는 아예 추출 안 됨)

---

## 차이 분석 GPT 프롬프트 템플릿

`utils/diffReasonGenerator.ts`:

```
당신은 프랜차이즈 데이터 분석가다. 같은 브랜드·같은 항목에 대한 두 출처의
수치가 다를 때, 그 차이의 원인을 객관적으로 분석한다.

입력:
- 항목: {label}
- 수치 A: {value_a} (출처: {source_a}, 메타: {note_a}, 시점: {fetched_a})
- 수치 B: {value_b} (출처: {source_b}, 메타: {note_b}, 시점: {fetched_b})
- 관련 docx 원문: {docx_excerpt}

분석 규칙:
1. 두 수치가 다른 이유를 3~5문장으로 객관적으로 설명하라.
2. 가능한 원인:
   - 집계 시점 차이 (예: 2024년 초기 vs 2026년 현재)
   - 표본 범위 차이 (예: 서울 21개점 vs 전국 52개점)
   - 산정 기준 차이 (예: 월 환산 vs 연간 / 상위 매장 vs 전체 평균)
   - 공시 갱신 주기 차이 (공정위는 연 1회, POS 는 실시간)
   - 공식 문서 vs 마케팅 자료 차이
3. 어느 한쪽이 틀렸다고 단정하지 마라. 서로 다른 맥락의 정당한 차이로 서술하라.
4. 독자(예비 창업자)가 어느 수치를 언제 참고해야 하는지 마지막 문장에 언급하라.

출력:
자연스러운 한국어 3~5문장. 머리말·꼬리말·이모지 금지.
```

---

## 오공김밥 v5 기준 예상 출력

Phase 6 검증 시 자동 생성되어야 할 차이 분석 예시 4개:

### 차이 1: 월평균매출
- 공정위(2024): 5,210만원 (서울 21개점)
- POS(2026.3): 3,902만원 (전국 52개점)
- → "2025년 한 해 28개점 신규 오픈으로 표본 확대, 초기 매장 집중 시기보다 평균 하락. 공정위 수치는 초기 검증된 매장 중심, POS 는 현재 운영 전체 기준."

### 차이 2: 가맹비
- 공정위: 550만원
- 브로셔: 300만원
- → "공정위는 최초 등록 시점의 공시 수치, 브로셔는 현행 이벤트·할인 반영 가능."

### 차이 3: 인테리어비
- 공정위: 1,980만원 (10평 기준)
- 브로셔: 3,000만원 (20평 기준)
- → "기준 평수 차이. 공정위 공시는 33㎡(10평) 표준, 브로셔는 20평 기준 예시."

### 차이 4: 가맹점수
- 공정위(2024 말): 21개
- 본사(2026.3): 52개
- → "공정위 정보공개서는 연 1회 갱신되어 시차 발생. 2025년 한 해 28개점 신규 오픈분이 차기 공시에 반영 예정."

이 네 섹션이 블로그에 자동 포함되면 **독자의 모든 의문을 선제 해소** + AEO 측면에서 "오공김밥 공정위 vs 실제" 류 질의의 답변 지위 확보.
