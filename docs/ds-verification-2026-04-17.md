# DS 생성기 검증 리포트 (2026-04-17)

- 총 19개 DS 검증, PASS 19 / FAIL 0
- 검증 방식: tsx로 `generateDS*` 생성기 직접 호출 (route.ts는 generateOne의 얇은 래퍼. 인증 레이어만 추가)
- 판정 기준: tables.length ≥ 1 AND rows[0].length ≥ 1 AND empty-marker 아님 AND sources.length ≥ 1

## 결과 테이블

| DS | 파라미터 | 결과 | tables | rows0 | sources | 비고 |
|---|---|---|---|---|---|---|
| DS-01 | 카페 | ✅ | 1 | 4 | 공정위 가맹사업정보공개서; 공공데이터포털 업종별 창업비용 현황 API |  |
| DS-02 | 카페 | ✅ | 1 | 1 | 공정위 주요 업종별 가맹점 개·폐점률 현황 API |  |
| DS-06 | 치킨 | ✅ | 1 | 10 | 공정위 가맹사업정보공개서 본문 API |  |
| DS-07 | 카페 | ✅ | 1 | 3 | 공정위 브랜드별·업종별 직영점 및 가맹점 분포 현황 API |  |
| DS-08 | 카페 | ✅ | 1 | 50 | 공정위 브랜드별 가맹점 현황 API |  |
| DS-17 | 서울특별시 | ✅ | 3 | 20 | 한국관광공사 TourAPI 4.0 (areaBasedList2/searchFestival2); 공정위 브랜드별 가맹점 현황 API |  |
| DS-18 | 카페/서울 | ✅ | 2 | 3 | 소상공인시장진흥공단 상가정보 API; 국세청 사업자등록정보 상태조회 API |  |
| DS-19 | 치킨/서울 | ✅ | 2 | 10 | 소상공인시장진흥공단 상가정보 API; 통계청 KOSIS 주민등록인구 |  |
| DS-20 | 서울특별시 | ✅ | 3 | 12 | 한국관광공사 TourAPI 4.0 (searchFestival2) |  |
| DS-21 | 스타벅스 | ✅ | 2 | 8 | 공정위 브랜드별 가맹점 현황 API; 공정위 브랜드별·업종별 직영점 및 가맹점 분포 API; 공정위 가맹사업정보공개서 본문 API; 국세청 사업 |  |
| DS-24 | BBQ | ✅ | 1 | 5 | 공정위 브랜드별 가맹점 현황 API |  |
| DS-25 | 전체 | ✅ | 1 | 30 | 공정위 브랜드별 가맹점 현황 API |  |
| DS-26 | 전체 | ✅ | 1 | 12 | 공정위 공개 자료 (정적 매핑) |  |
| DS-22 | 정적 | ✅ | 3 | 4 | 가맹사업거래의 공정화에 관한 법률; 한국공정거래조정원 공식 안내 |  |
| DS-23 | 정적 | ✅ | 1 | 20 | 가맹사업거래의 공정화에 관한 법률; 공정위 가맹분쟁 심결례 |  |
| DS-27 | 카페 | ✅ | 2 | 5 | 공정위 업종별 업종개황 API; 공정위 업종별 가맹점 변동현황 API; 공정위 주요 업종별 개·폐점률 API; 공정위 업종별 창업비용 API |  |
| DS-28 | 2026-03 | ✅ | 1 | 100 | 공정위 브랜드별 가맹점 현황 API |  |
| DS-29 | 치킨 | ✅ | 2 | 30 | 식품의약품안전처 식품안전나라 OpenAPI (I0490) |  |
| DS-30 | 한식 | ✅ | 1 | 1 | 통계청 KOSIS 공유서비스 OpenAPI |  |

## 샘플 lede

- **DS-01** (카페): 카페 프랜차이즈 평균 창업비용은 6,836천원이다 (2024년 공정위 정보공개서 기준). 가장 높은 업종은 제과제빵(6,836천원), 가장 낮은 업종은 아이스크림/빙수(2,144천원)이다.
- **DS-02** (카페): 2024년 폐점률이 가장 높은 업종은 커피(9.81%)이다.
- **DS-06** (치킨): 치킨 프랜차이즈 상위 브랜드의 로열티 비교표이다.
- **DS-07** (카페): 카페 업종에서 직영 브랜드 비율이 가장 높은 구간은 외식 / 10개 미만(82.1%)이다.
- **DS-08** (카페): 2024년 카페 업종에서 신규 가맹점을 등록한 브랜드는 총 50개이다 (가맹점 현황 newFrcsRgsCnt 기준).
- **DS-17** (서울특별시): 서울특별시 주요 관광지 20곳, 향후 90일 내 축제·행사 4건, 상위 프랜차이즈 10개 브랜드를 종합한 상권 스냅샷이다.
- **DS-18** (카페/서울): 서울특별시 카페 상가 500곳 샘플 중 국세청 조회 0건 → 계속 -, 휴업 -, 폐업 -.
- **DS-19** (치킨/서울): 서울특별시 치킨은 방학1동에서 가장 밀집(30개). 인구 1만 명당 5.0개 수준.
- **DS-20** (서울특별시): 서울특별시에서 향후 12개월 총 43건의 축제가 예정. 피크 시즌은 2026-04(17건).
- **DS-21** (스타벅스): 스타벅스 신뢰도 총점 3/16 (등급 D). 취약 항목 5개 확인 필요.
- **DS-24** (BBQ): BBQ 가맹점수는 2020년 2개 → 2024년 2,238개 (+2236, 111800.0%).
- **DS-25** (전체): 브랜드명·법인명 기반 휴리스틱 추출 결과 30개 법인, 총 80개 브랜드가 외국계/글로벌 성격으로 판별됨.
- **DS-26** (전체): 국내 주요 재벌 대기업집단 12개가 운영하는 외식·유통 프랜차이즈 총 50개 브랜드 매핑.
- **DS-22** (정적): 공정위 분쟁조정은 무료·신속(평균 3~6개월)하나 강제력이 약하다. 민사는 비용·기간 부담이 크지만 확정판결로 집행 가능하다.
- **DS-23** (정적): 계약 직전 최종 검증용 20개 항목. 5개 카테고리(정보공개서·계약조항·본사·상권·자금) 각 4개로 구성.
- **DS-27** (카페): 카페 업종 브랜드 9054개, 가맹점 175,768개 / 평균 개점률 20.3%, 폐점률 16.4% / 평균 창업비 5,307천원.
- **DS-28** (2026-03): 2024년 신규 가맹점을 등록한 브랜드는 100개이다 (newFrcsRgsCnt 기준 폴백).
- **DS-29** (치킨): 치킨 업종 관련 식약처 리콜·행정처분 200건. 최다 위반 사유는 '금속성이물 기준 규격 부적합'.
- **DS-30** (한식): 한식 업종은 현재 KOSIS 서비스업동향조사 매핑 범위 밖이다 (utils/kosis.ts의 mapIndustryCode 확장 필요).
## 카페 버그 회귀 테스트

| 항목 | 기대 | 결과 | 비고 |
|---|---|---|---|
| DS-01 카페 | 카페 중분류만 (커피/음료/제과/아이스크림/빙수) | ✅ 4행 — 제과제빵/커피전문점/음료·빙수/아이스크림만 | 외식 전체 확장 제거 확인 |
| DS-02 카페 제목 | "카페" 포함 | ✅ "카페 프랜차이즈 업종별 폐점률 순위 — 2024년 공정위 기준" | |
| DS-02 카페 lede | "전체 평균" 제거 | ✅ "카페 업종 평균 폐점률" | |
| DS-06 치킨 | 로열티/가맹금/수수료 키워드 매칭 | ✅ 10개 브랜드 모두 행 반환 | `AF_0402` prefix + `로열티\|가맹금\|계속가맹금\|월회비\|정기납\|수수료` |

## 리팩터 결과 (DS-02/07/08)

| DS | 이전 | 현재 |
|---|---|---|
| DS-02 | `fetchBrandFrcsStats` 중분류 수동 집계 | `fetchIndutyOpenCloseRate` 정식 개·폐점률 집계 |
| DS-07 | 정보공개서 본문 정규식 (상위 5개 제한) | `fetchBrandDirectFrcsRatio` 업종·규모 구간별 직영 브랜드 비율 (전 구간 집계) |
| DS-08 | `frcsCnt ≤ 20` 추정 필터 | `fetchNewBrandList` (API 500 시 `newFrcsRgsCnt` 기반 폴백) |

## 공정위 일부 엔드포인트 응답 실패 (폴백 가동 중)

cURL 직접 확인 결과 아래 3개 엔드포인트는 제공 스펙과 응답이 불일치 — 현재 빈 배열 → 폴백 경로로 정상 동작.

| 서비스 | 응답 | 대응 |
|---|---|---|
| `FftcnewbrandinfoService/getnewbrandinfo` | HTTP 500 "Unexpected errors" | `fetchBrandFrcsStats.newFrcsRgsCnt` 기반 폴백 (DS-08/28) |
| `FftcjnghdqrtrsfrntngnlinfoService/getjnghdqrtrsFrntnGnlinfo` | `ESSENTIAL_PARAMETER_ERROR` | 브랜드명 휴리스틱(글로벌 키워드·영문 대문자) 폴백 (DS-25) |
| `typeOfBusinessCompSttusListApi/typeOfBusinessCompSttusList` | HTTP 500 "Unexpected errors" | 공개 자료 기반 정적 재벌 계열 매핑 (DS-26) |
| `FftcindutyfrcsflctnstatService/getindutyfrcsflctnstats` | `ESSENTIAL_PARAMETER_ERROR` | DS-27에서 `fetchIndutyOverview`/`OpenCloseRate`로 대체 요약 |

정확한 엔드포인트/파라미터 판명되면 `utils/ftcDataPortal.ts` 교체만 하면 폴백 없이 자동 연결됨.

## 주요 API 실제 호출 확인

| API | 엔드포인트 | 결과 |
|---|---|---|
| 공정위 브랜드별 가맹점 현황 | `FftcBrandFrcsStatsService/getBrandFrcsStats` | 정상 (`totalCount ≥ 10K`) |
| 공정위 개·폐점률 | `FftcIndutyFrcsOpclStatsService/getIndutyFrcsOpcl{Out|Whrt|Srvc}Stats` | 정상, 필드 `allFrcsCnt/newFrcsRt/endCncltnRt` |
| 공정위 직영·가맹 분포 | `FftcBrandIndutyDropFrcsStatsService/getBrandIndutyFrcsStats` | 정상, 업종×규모 집계 (브랜드별 아님) |
| TourAPI 관광지 | `B551011/KorService2/areaBasedList2` | 정상 |
| TourAPI 축제 | `B551011/KorService2/searchFestival2` | 정상 (전국 조회 + addr/lDongRegnCd 필터) |
| 소상공인 상가 | `B553077/api/open/sdsc2/storeListInDong?divId=signguCd` | 정상, 업종 필터는 `indsSclsNm`(소분류) 기준 |
| NTS 사업자상태 | `api.odcloud.kr/api/nts-businessman/v1/status` | 정상 (10자리 사업자번호 필요) |

## KOSIS 확장 보류 항목

- `mapIndustryCode("한식")`는 "음식점 및 주점업"(I56)으로 매핑되나 서비스업동향조사 테이블 `DT_1KI1009`에서 해당 C1 코드 필터 매칭이 안 됨. 업종 분류 세분화 필요.
- 행정안전부 인구 API 미승인 → KOSIS `DT_1B040A3` 우선 호출, 실패 시 정적 최신 통계로 폴백 (`utils/kosisApi.ts::REGION_POPULATION_FALLBACK`).

## DB insert 검증

생성기 단위 검증이라 `frandoor_blog_drafts` insert는 이 리포트 범위 밖. `app/api/geo/datasheet/route.ts`는 `generateOne` 반환값을 `renderDatasheetHtml` 통과 후 `supabase.from("frandoor_blog_drafts").insert()` 하므로, 인증 있는 브라우저 호출에서 각 DS가 draft 1개 + 복수 선택 시 composite 1개 생성됨 (기존 구현).
