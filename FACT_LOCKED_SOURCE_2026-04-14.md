# 팩트 데이터 잠금 — docx 단일 소스 방식 (2026-04-14)

> **본 문서는 `FACT_EXTRACT_REDESIGN_2026-04-14.md` 를 대체합니다.**
> 기존 문서의 label enum / 공정위 구조화 / 대용량 맵-리듀스 설계는
> docx 단일 소스 정책으로 인해 대부분 불필요해졌습니다.

---

## 핵심 원칙

> **"담당자가 수집·검증해서 docx 에 적어놓은 것만 블로그에 쓸 수 있다."**

- 담당자는 공정위·브로셔·POS·언론·SNS 등 모든 출처를 **직접 검증**해서 docx 한 파일에 정리함
- 담당자가 docx 에 쓰지 않은 내용은 = **사용하지 않기로 결정한 내용**
- 블로그 자동 생성 시 GPT 가 자체 지식·웹검색·추측으로 **외부 정보를 끌어오면 안 됨**

이 원칙 하나로 다음 문제가 **전부 원천 차단**됨:
- ❌ "공정위 공시 순마진 17~23%" 같은 허위 인용 (docx 에 출처가 "본사 카톡" 이면 아예 추출 안 됨)
- ❌ 존재하지 않는 연환산 12억원 같은 환각 수치
- ❌ 검증되지 않은 업종 평균·통계 인용
- ❌ 오래된 공정위 공시와 최신 POS 데이터의 혼용

---

## 변경 요약

| 영역 | 현재 | 변경 후 |
|---|---|---|
| **파일 업로드** | 여러 파일 (pdf·xlsx·docx·txt 등) | **docx 1개만** |
| **팩트 추출** | 파일 파싱 + 공정위 웹검색 + 홈페이지 스크래핑 | **docx 에서만 추출, 외부 호출 0** |
| **저장 데이터** | 파일별 fact_data + officialData + raw_text | **docx markdown 원본 + 추출 팩트** |
| **블로그 생성** | fact_data 요약 + GPT 자유 작성 | **docx 원본을 SOURCE 로 주입 + 엄격 인용 강제** |
| **검증** | 없음 | **본문의 모든 수치·고유명사가 SOURCE 에 있는지 확인** |

---

## Phase 1: 업로드 UI 제한

### 1-1. 파일 업로드 영역

**파일**: `app/(groupware)/frandoor/page.tsx` 의 브랜드 관리 업로드 섹션

**변경**:
- `<input type="file">` 속성 수정
  - `accept=".docx"` (docx 만 허용)
  - `multiple` 제거
- 여러 파일 리스트 UI → 단일 파일 영역
- 기존에 다른 확장자 파일이 업로드된 경우 → 브라우저에서 차단 + 알림
- 이미 docx 가 업로드된 상태에서 새 docx 선택 시 "교체하시겠습니까?" 확인

**문구 변경**:
- 기존: "팩트 추출용 자료 파일을 업로드하세요 (PDF, Excel, Word, 텍스트 지원)"
- 변경: "브랜드 수집 자료 docx 를 업로드하세요. 이 파일에 적힌 내용만 블로그에 사용됩니다."

### 1-2. 기존 파일 정리

DB 에 이미 쌓인 파일 중 docx 가 아닌 것은 사용 중단 처리:
- 즉시 삭제하지 않음 (과거 데이터 보존)
- `brand_files.active = false` 컬럼 추가해서 비활성화
- 팩트 추출 / 블로그 생성 로직은 `active = true AND file_name LIKE '%.docx'` 파일만 사용

### 1-3. 신규 가드

API 라우트에서도 방어:
- `app/api/geo/upload-brand-file/route.ts` (또는 유사)
- 확장자가 `.docx` 가 아니면 400 반환
- 파일당 최대 10MB (docx 는 일반적으로 1MB 미만)

---

## Phase 2: 팩트 추출 단순화

### 2-1. extract-facts/route.ts 전면 축소

**제거할 블록**:
- 공정위 웹검색 호출 (gpt 웹검색 툴 호출 블록)
- 홈페이지 landing URL fetch + HTML 텍스트 변환
- 다중 파일 loop (`for (const f of files)`)
- `__official_data__`, `__blog_ref_links__`, `__brand_plan__` 등 복합 메타 필드

**남길 블록**:
- docx 1개 → `parseFile()` → markdown 텍스트
- GPT 호출 1회 → 구조화된 팩트 추출 (label/value/source_type/keyword)
- DB 저장: 추출된 팩트 + `__raw_text__` (docx 전체 markdown)

### 2-2. source_type enum (축소판)

담당자가 docx 에 표기한 출처 표현을 그대로 보존:

```ts
// utils/factSchema.ts
export const FACT_SOURCE_TYPE = [
  "공정위",        // "공정거래위원회", "공정위 정보공개서"
  "본사_브로셔",   // "공식 브로셔", "브로셔 기재"
  "POS_실거래",    // "본사 제공 POS 엑셀", "POS 집계"
  "공식_홈페이지", // "공식 홈페이지"
  "언론_보도",     // 기사 URL 이 있는 것
  "정부_통계",     // 공정위 가맹통계, KREI, KOSIS
  "공식_SNS",      // 본사 운영 공식 계정 (유튜브·인스타)
  "공식_인증",     // HACCP, 수상 내역 (공식 발표 확인된 것)
] as const;
export type FactSourceType = typeof FACT_SOURCE_TYPE[number];
```

**탈락 규칙** (추출 안 함):
- `"본사 카카오톡"`, `"본사 담당자 확인"`, `"본사 확인"`, `"담당자 구두 확인"`
- `"본사 주장"`, `"본사 전달"`
- `"추정"`, `"추산"` (정확한 출처 없는 것)

### 2-3. 추출 프롬프트 핵심 지시

```
당신은 브랜드 수집 자료 docx 에서 검증 가능한 팩트만 추출한다.

규칙:
1. 표(markdown table) 의 각 행은 하나의 팩트 후보다.
2. 표의 "출처", "비고", "확인" 컬럼, 또는 섹션 상단의 "※ 출처: ..." 주석에서
   source_type 을 결정한다.
3. source_type 이 아래 enum 에 없거나, "본사 카카오톡"·"담당자 확인" 류이면
   해당 행은 절대 추출하지 마라.
4. 숫자는 원본 문서에 쓰인 그대로 보존한다. 환산하거나 요약하지 마라.
   (예: "625,178천원 (약 6억 2,518만원)" 그대로)
5. 섹션 헤더 "※ 출처: 공정거래위원회 정보공개서" 가 있으면 해당 섹션 내
   모든 팩트의 source_type 은 "공정위" 로 상속한다.
6. 문서 외부 지식으로 팩트를 만들어내지 마라. docx 에 쓰인 것만 추출한다.
```

### 2-4. DB 스키마 단순화

```
brand_fact_data
- brand_id
- label       (FACT_LABEL_ENUM)
- value       (string)
- source_type (FACT_SOURCE_TYPE)
- source_note (string, 원문에 써있던 출처 문구 그대로)
- keyword     (배열)
```

추가로 브랜드당 하나:

```
brand_source_doc
- brand_id (PK)
- file_name
- markdown_text  (docx → markdown, 블로그 생성 시 SOURCE 로 통째로 주입)
- uploaded_at
- file_hash
```

---

## Phase 3: 블로그 생성 제약

### 3-1. 프롬프트 구조 (blog-generate/route.ts)

```
[SOURCE — 이 블록의 내용만 블로그에 사용할 수 있다]
{brand_source_doc.markdown_text 전체}
[/SOURCE]

[작성 규칙]
1. 본문의 모든 수치·고유명사·주장은 SOURCE 에 명시된 것만 사용한다.
2. SOURCE 에 없는 수치(업종 평균, 통계, 비교값 등)는 절대 쓰지 마라.
3. 출처 인용 시 SOURCE 에 쓰인 표현을 따른다:
   - SOURCE 에서 "공정위 정보공개서" 로 표기된 수치 → "공정위 공시"
   - SOURCE 에서 "브로셔 수치" 로 표기된 수치 → "본사 발표"
   - SOURCE 에서 "POS 실거래" 로 표기된 수치 → "본사 POS 집계"
4. 숫자는 SOURCE 에 쓰인 그대로 인용하라. 환산 계산을 블로그에서
   새로 하지 마라. (공정위 5,210만원, POS 3,902만원 등 원본 그대로)
5. SOURCE 에 "본사 카카오톡 확인" 이라고 된 수치는 절대 쓰지 마라.
   (이미 fact 추출에서 탈락되었으나 원본 markdown 에 남아있을 수 있음)
6. 업종 평균·경쟁사 비교·외부 통계는 SOURCE 의 "업계 비교" 섹션에
   명시된 것만 쓸 수 있다.
```

### 3-2. GPT 설정

- `tools: []` — **웹검색 툴 비활성화**
- `response_format` — Structured Outputs 로 본문 + 사용된 source 구간 리스트
- temperature 0.2~0.3 (창의성보다 정확성)

### 3-3. 출력 스키마

```ts
{
  title: string,
  sections: Array<{
    heading: string,
    body: string,
    citations: Array<{
      quoted_text: string,      // 본문에 쓴 수치·문장
      source_excerpt: string,    // SOURCE 에서 발췌한 원본 구간
      source_type: FactSourceType,
    }>,
  }>,
}
```

모든 수치와 주장은 `citations[]` 에 SOURCE 발췌와 매칭되어야 함. 매칭 안 되면 저장 거부.

---

## Phase 4: 자동 검증 파이프라인

### 4-1. utils/blogFactCheck.ts 신규

블로그 저장 직전 자동 실행:

```ts
export type FactCheckResult = {
  passed: boolean;
  violations: Array<{
    type: "number_not_in_source" | "entity_not_in_source" | "unquoted_claim";
    text: string;
    location: string;  // 섹션명
  }>;
};

export function checkBlogAgainstSource(
  blogText: string,
  sourceMarkdown: string,
): FactCheckResult {
  const violations = [];

  // 1) 블로그 본문의 숫자 추출 (원, 만원, 억, %, 개, 년, 배 등 단위 포함)
  const numbers = extractNumbers(blogText);
  for (const n of numbers) {
    if (!sourceMarkdown.includes(n.normalized) &&
        !isDerivable(n, sourceMarkdown)) {
      violations.push({ type: "number_not_in_source", text: n.original, ... });
    }
  }

  // 2) 고유명사 추출 (브랜드명·매장명·지역·수상명·기관명)
  const entities = extractEntities(blogText);
  for (const e of entities) {
    if (!sourceMarkdown.includes(e)) {
      violations.push({ type: "entity_not_in_source", text: e, ... });
    }
  }

  // 3) 통계·평균·비교 주장 ("업계 평균 X%", "경쟁사 대비 Y배")
  //    → citation 이 붙어있지 않으면 violation
  const claims = extractStatClaims(blogText);
  for (const c of claims) {
    if (!hasCitation(c)) {
      violations.push({ type: "unquoted_claim", text: c, ... });
    }
  }

  return { passed: violations.length === 0, violations };
}

function isDerivable(n, source) {
  // "5,210만원 × 12" 같은 단순 산술은 허용 (SOURCE 의 월매출 × 12 = 연매출)
  // 복잡한 추정·비교는 불허
}
```

### 4-2. UI 반영

- 블로그 생성 완료 후 검증 실행
- violations 가 있으면 경고 박스에 리스트 표시
- 사용자가 수동으로 확인 후 "그래도 저장" 또는 "재생성" 선택
- 자동 발행 경로에서는 violations 가 1개라도 있으면 발행 차단

---

## Phase 5: 마이그레이션

### 5-1. 기존 브랜드 처리

각 브랜드에 대해:
1. 담당자가 docx 수집 자료를 준비했는지 확인
2. 없으면 해당 브랜드는 **블로그 생성 비활성화**
3. 있으면 docx 업로드 → 팩트 재추출

### 5-2. 기존 팩트 데이터 처리

- `brand_fact_data` 전체 백업 후 삭제
- docx 기반으로 재추출
- UI 에서 "재추출" 버튼 누르면 기존 팩트 덮어쓰기

### 5-3. 블로그 히스토리

- 과거 블로그는 그대로 둠 (참고용)
- 신규 생성부터 새 규칙 적용

---

## 작업 순서 (클로드 코드용)

**Phase 1: UI 제한 (먼저)**
1. `page.tsx` 업로드 input `accept=".docx"`, `multiple` 제거
2. 업로드 API 확장자 가드
3. 기존 파일 중 비-docx 는 `active=false`

**Phase 2: 추출 단순화**
4. `utils/factSchema.ts` 축소판 enum 정의
5. `extract-facts/route.ts` 웹검색·landing URL·다중파일 loop 전부 제거
6. `brand_source_doc` 테이블 생성 마이그레이션
7. 추출 프롬프트에 "본사 카톡 탈락" 규칙 명시
8. docx 의 markdown 전체를 `brand_source_doc.markdown_text` 에 저장

**Phase 3: 생성 제약**
9. `blog-generate/route.ts` 프롬프트에 `[SOURCE]` 블록 + 인용 규칙 7개 추가
10. `tools: []` 로 웹검색 차단
11. Structured Outputs 로 `citations[]` 강제

**Phase 4: 검증**
12. `utils/blogFactCheck.ts` 구현
13. 블로그 저장 전 자동 실행
14. violations UI 표시

**Phase 5: 마이그레이션**
15. 오공김밥 v5 docx 로 실제 재추출 → 블로그 재생성 테스트
16. 문제 없으면 나머지 브랜드 순차 마이그레이션

---

## 완료 기준

1. 브랜드 관리 페이지에서 **docx 만 업로드 가능**
2. 팩트 추출 시 **외부 API 호출 0회** (docx 만 파싱)
3. "본사 카카오톡 확인" 류 수치는 팩트 DB 에 저장 안 됨
4. 블로그 생성 시 **GPT 웹검색 비활성화**
5. 블로그 본문의 모든 수치·고유명사가 docx 에 존재함을 자동 검증
6. 검증 실패 시 저장/발행 차단
7. 오공김밥 v5 docx 로 재생성한 블로그에 "공정위 공시 17~23%" 같은 허위 인용 없음

---

## 예상 효과

| 지표 | 현재 | 변경 후 |
|---|---|---|
| 블로그 당 허위 인용 개수 | 5~10건 (추정) | **0건** |
| 환각 수치 (연환산 12억 같은 것) | 빈번 | **0건** |
| GPT 호출 비용 (추출) | $0.5~0.8/브랜드 | **$0.1/브랜드** |
| GPT 호출 비용 (생성) | $0.3/글 | **$0.4/글** (SOURCE 주입으로 토큰 증가) |
| 추출 시간 | 1~5분 | **30초~1분** |
| 담당자 수집 자료 작성 부담 | 없음 (대충 파일만 올림) | **증가** (docx 정제 필요) |
| 블로그 품질 | 불량 (허위 다수) | **담당자 수집 품질에 비례** |

**트레이드오프**:
담당자가 docx 를 **철저히 정제**해야 블로그 품질이 올라감.
대충 작성하면 블로그도 부실해짐.
→ 담당자 교육 자료 / docx 템플릿 제공 필요 (별도 작업)
