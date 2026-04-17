# 클코 핸드오프: 데이터시트 시스템 보수 및 확장

## 현재 상태

프랜도어(Frandoor) 데이터시트 시스템 DS-01~DS-16이 구현되어 있다.
UI는 멀티셀렉트 칩 + 추천조합 형태로 전환 완료. API route도 `ds_types` 배열을 받아 복수 DS를 순차 생성한다.

---

## 긴급: datasheetBuilder.ts 파일 복구

`utils/datasheetBuilder.ts`가 43줄에서 잘려있다. `renderDatasheetHtml()` 함수 본문이 중간에 끊김.
아래 `DatasheetInput` 인터페이스 기준으로 완전한 HTML 렌더러를 복구해야 한다:

```ts
export interface DatasheetInput {
  dsType: string;
  title: string;
  lede: string;        // 도입 문장
  tables: Array<{
    caption?: string;
    headers: string[];
    rows: string[][];
  }>;
  notes?: string[];     // 비고/주석
  sources: string[];    // 출처
  baseDate: string;     // 기준일자
}
```

복구 시 렌더링 규칙:
- 인라인 CSS만 사용 (블로그/티스토리 임베딩용이라 class 불가)
- 테이블: border-collapse, 줄무늬(#fff/#f9fafb), 13px 폰트
- lede: 16px 문단, notes: 12px ul/li, sources: 11px 회색 문단
- 전체를 하나의 `<article>` 태그로 감싸기
- title은 `<h2>`, baseDate는 작은 회색 텍스트

---

## 할 일 목록

### 1. datasheetBuilder.ts 복구 (최우선)
위 설명 참고. 잘린 파일을 완전하게 재작성.

### 2. dsGenerators.ts 점검

현재 936줄, DS-01~DS-16 구현됨. 확인할 것:
- `yr()` 함수: `new Date().getFullYear() - 2`를 반환해야 함 (공정위 데이터는 2년 전 기준)
- DS-01 필드: `smtnAmt`(합계), `avrgFrcsAmt`(가맹금), `avrgFntnAmt`(교육비), `avrgJngEtcAmt`(기타)
- DS-12~14: `lawApi.ts`의 `fetchLawArticles`, `searchLaw` 사용, 전부 async

### 3. 콘텐츠 품질 개선

현재 DS 출력이 빈약한 경우가 있다 (1~2행짜리 테이블). 각 DS generator에서:
- **lede에 맥락 문장 추가**: "2024년 기준 치킨 업종 평균 창업비용은 X만원으로, 전체 외식업 평균 대비 Y% 높은 수준입니다" 같은 해석
- **notes에 비교 정보 추가**: "전년 대비 증감", "업종 평균 대비" 등
- 데이터가 1행뿐이면 관련 상위/하위 업종도 포함해서 최소 3~5행 되게 확장

### 4. ftcDataPortal.ts 미사용 함수 연결

현재 export된 함수:
- `fetchBrandFrcsStats(yr)` — DS-02, DS-03, DS-06, DS-07, DS-08에서 사용
- `findBrandFrcsStat(opts)` — DS-09에서 사용
- `fetchIndutyStrtupCost(yr, lclas)` — DS-01에서 사용
- `fetchAreaIndutyAvr(yr, lclas)` — DS-04에서 사용
- `fetchAreaIndutyFrcsCount(yr)` — DS-05에서 사용

### 5. 합성 콘텐츠 HTML 렌더링

현재 멀티 DS 선택 시 각각 별도 카드로 표시된다.
추후 `renderCompositeHtml(inputs: DatasheetInput[])` 함수를 만들어서 하나의 통합 HTML 아티클로 합성하는 것을 고려:
- 공통 title 자동 생성 (예: "치킨 업종 종합 분석 — 창업비용·폐점률·매출")
- 각 DS의 테이블을 `<section>`으로 묶어 하나의 article에 담기
- 통합 lede / 통합 sources

### 6. 결정문 API (미구현)

data.go.kr에서 2개 API 추가 신청 필요 (아직 미승인):
- 공정위 시정조치 결정문
- 분쟁조정 결정문

승인되면 DS-17, DS-18로 추가.

---

## 파일 구조

```
utils/
  dsGenerators.ts      — DS-01~DS-16 생성 함수 (936줄)
  datasheetBuilder.ts  — HTML 렌더러 (잘림! 복구 필요)
  lawApi.ts            — 국가법령정보 API 래퍼 (139줄)
  ftcDataPortal.ts     — 공공데이터포털 API 래퍼 (207줄)
  ftcFranchise.ts      — 공정위 정보공개서 API 래퍼
  ftcContentParser.ts  — 정보공개서 파싱

app/api/geo/datasheet/route.ts — POST, ds_types 배열 수신, 각각 생성 후 DB 저장
app/(groupware)/content/datasheet/page.tsx — 멀티셀렉트 칩 UI + 추천조합
```

---

## 환경변수 (이미 .env.local에 설정됨)

- `FTC_DATAPORTAL_KEY` — 공공데이터포털 (64자 hex)
- `FTC_FRANCHISE_KEY` — 공정위 정보공개서
- `LAW_API_KEY` — 국가법령정보 OC값 (`frandoor-law-api`)
- `KOSIS_API_KEY` — 통계청 (미사용)
- `FOODSAFETY_API_KEY` — 식품안전나라 (미사용)

---

## 주의사항

- `any` 타입 금지 (CLAUDE.md 규칙)
- .env 커밋 금지
- yr() 는 반드시 2년 전 (공정위 API 데이터 지연)
- DS-12~14는 async (law.go.kr API 호출)
- Vercel serverless maxDuration=60 제한 있음
