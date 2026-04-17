# 공공데이터 API 연동 감사 (2026-04-17, 정비 후)

## 연동 매트릭스

| API | env 키 | 클라이언트 파일 | 사용 DS | 상태 |
|---|---|---|---|---|
| 정보공개서 목록/목차/본문 | FTC_FRANCHISE_KEY | [utils/ftcFranchise.ts](utils/ftcFranchise.ts) | DS-06, DS-09, DS-10, DS-11, DS-21 | ✅ |
| 브랜드별 가맹점 현황 | FTC_DATAPORTAL_KEY | [utils/ftcBrandApi.ts](utils/ftcBrandApi.ts) | DS-03, DS-06, DS-09, DS-15, DS-17, DS-24 | ✅ |
| 브랜드 개요 통계 | FTC_DATAPORTAL_KEY | [utils/ftcBrandApi.ts](utils/ftcBrandApi.ts) | (사용 가능) | ✅ |
| 브랜드별·업종별 직영/가맹 분포 | FTC_DATAPORTAL_KEY | [utils/ftcBrandApi.ts](utils/ftcBrandApi.ts) | DS-07, DS-21 | ✅ |
| 신규등록 브랜드 목록 | FTC_DATAPORTAL_KEY | [utils/ftcBrandApi.ts](utils/ftcBrandApi.ts) | DS-08, DS-28 | ✅ |
| 주요 업종별 가맹점 개·폐점률 | FTC_DATAPORTAL_KEY | [utils/ftcIndustryApi.ts](utils/ftcIndustryApi.ts) | DS-02, DS-27 | ✅ |
| 업종별 가맹점 변동현황 | FTC_DATAPORTAL_KEY | [utils/ftcIndustryApi.ts](utils/ftcIndustryApi.ts) | DS-27 | ✅ |
| 업종별 업종개황 | FTC_DATAPORTAL_KEY | [utils/ftcIndustryApi.ts](utils/ftcIndustryApi.ts) | DS-27 | ✅ |
| 업종별 창업비용 현황 | FTC_DATAPORTAL_KEY | [utils/ftcIndustryApi.ts](utils/ftcIndustryApi.ts) | DS-01, DS-16, DS-27 | ✅ |
| 지역별 업종별 평균매출 | FTC_DATAPORTAL_KEY | [utils/ftcIndustryApi.ts](utils/ftcIndustryApi.ts) | DS-04 | ✅ |
| 지역별 업종별 가맹점수 | FTC_DATAPORTAL_KEY | [utils/ftcIndustryApi.ts](utils/ftcIndustryApi.ts) | DS-05 | ✅ |
| 업종별 창업비용 랭킹 | FTC_DATAPORTAL_KEY | [utils/ftcIndustryApi.ts](utils/ftcIndustryApi.ts) | (사용 가능) | ✅ |
| 외국계 가맹본부 일반정보 | FTC_DATAPORTAL_KEY | [utils/ftcMiscApi.ts](utils/ftcMiscApi.ts) | DS-25 | ✅ |
| 가맹본부 법인·개인 비율 | FTC_DATAPORTAL_KEY | [utils/ftcMiscApi.ts](utils/ftcMiscApi.ts) | (사용 가능) | ✅ |
| 통신판매사업자 등록현황 | FTC_DATAPORTAL_KEY | [utils/ftcMiscApi.ts](utils/ftcMiscApi.ts) | (사용 가능) | ✅ |
| 대규모기업집단 지정/자산순위 | FTC_DATAPORTAL_KEY | [utils/ftcConglomerateApi.ts](utils/ftcConglomerateApi.ts) | DS-26 | ✅ |
| 대규모기업집단 소속회사 | FTC_DATAPORTAL_KEY | [utils/ftcConglomerateApi.ts](utils/ftcConglomerateApi.ts) | DS-26 | ✅ |
| 소속회사 개요·참여업종·주주·임원·재무 | FTC_DATAPORTAL_KEY | [utils/ftcConglomerateApi.ts](utils/ftcConglomerateApi.ts) | DS-26 | ✅ |
| 한국관광공사 TourAPI 4.0 | TOUR_API_KEY | [utils/tourApi.ts](utils/tourApi.ts) | DS-17, DS-20 | ✅ |
| 국세청 사업자상태 조회 | NTS_API_KEY | [utils/ntsApi.ts](utils/ntsApi.ts) | DS-18, DS-21 | ✅ |
| 소상공인 상가(상권)정보 | SBIZ_API_KEY | [utils/sbizApi.ts](utils/sbizApi.ts) | DS-18, DS-19 | ✅ |
| 통계청 KOSIS 공유서비스 | KOSIS_API_KEY | [utils/kosisApi.ts](utils/kosisApi.ts), [utils/kosis.ts](utils/kosis.ts) | DS-19, DS-30, blog-generate | ✅ |
| 식품안전나라 (I0490 리콜·위반) | FOODSAFETY_API_KEY | [utils/foodSafetyApi.ts](utils/foodSafetyApi.ts), [utils/foodSafety.ts](utils/foodSafety.ts) | DS-29, blog-generate | ✅ |
| 국가법령정보센터 | LAW_API_KEY | [utils/lawApi.ts](utils/lawApi.ts) | DS-12, DS-13, DS-14 | ✅ |

## 공통 규칙

- env 키 부재 시 **빈 배열 반환** (throw 금지). 외부 API 래퍼(tourApi/ntsApi/sbizApi/ftcConglomerateApi)는 `process.env.NODE_ENV !== "production"`에서만 경고 출력.
- 타입은 [types/publicApi.ts](types/publicApi.ts) 통합 export.
- 페이지네이션·chunking(NTS 100건 청크 등)은 내부 자동 처리.
- 재시도 로직 없음 (호출 한도 보호).

## 리팩터링 결과

| DS | 이전 구현 | 현 구현 |
|---|---|---|
| DS-02 | `fetchBrandFrcsStats` → 중분류 수동 집계 | `fetchIndutyOpenCloseRate` 정식 집계 |
| DS-07 | 정보공개서 본문 정규식 파싱 (상위 5개) | `fetchBrandDirectFrcsRatio` 정식 분포 (전 브랜드 상위 30) |
| DS-08 | `frcsCnt <= 20` 추정 필터 | `fetchNewBrandList` 실제 등록일 기반 |
| DS-06 | 정보공개서 본문 파싱 | 유지 (키워드만 확장, 상위 10개로 확장) |

## DS 총괄 (30종)

| 그룹 | DS |
|---|---|
| 업종 | DS-01, DS-02, DS-03, DS-04, DS-05, DS-06, DS-07, DS-08, DS-27, DS-28 |
| 지역·컨텍스트 | DS-17, DS-18, DS-19, DS-20 |
| 브랜드 | DS-09, DS-10, DS-11, DS-21, DS-24 |
| 시장·계보 | DS-25, DS-26 |
| 법령·실무 | DS-12, DS-13, DS-14, DS-22, DS-23 |
| 식품·시장 | DS-29, DS-30 |
| 월간 자동 | DS-15, DS-16 |
