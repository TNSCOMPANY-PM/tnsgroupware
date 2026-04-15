/**
 * 식약처 식품안전나라 OpenAPI row 타입.
 * API 응답의 row 필드는 모두 string.
 *
 * 주의: 서비스 ID 별로 필드명이 서로 다르고, 키 별 접근 권한도 별도 승인 필요.
 * 현재 프로젝트 키(FOODSAFETY_API_KEY)는 I0490 만 승인됨.
 */

// I0490 — 부적합 회수·판매중지 (실제 응답 기준).
// 식약처 OpenAPI 포털에서는 "식품접객업소 위생등급" 으로 표기되나
// 실제 필드는 제품·회수 관련 스키마. 이에 맞춰 타입 정의.
export type RecallRow = {
  PRDTNM?: string;                       // 제품명
  PRDLST_TYPE?: string;                  // 품목유형 (가공식품/즉석조리식품 등)
  PRDLST_CD_NM?: string;                 // 품목명
  ADDR?: string;                         // 업소 소재지
  TELNO?: string;
  RTRVLPRVNS?: string;                   // 회수 사유
  RTRVLPLANDOC_RTRVLMTHD?: string;       // 회수 방법
  MNFDT?: string;                        // 제조일자
  DISTBTMLMT?: string;                   // 유통기한
  CRET_DTM?: string;                     // 작성일시
  LCNS_NO?: string;                      // 면허번호
  BRCDNO?: string;                       // 바코드
  IMG_FILE_PATH?: string;
  PRDLST_REPORT_NO?: string;
  FRMLCUNIT?: string;                    // 제형단위·용량
};

// 이하 서비스는 별도 키 승인 필요. 승인 시 타입 재확인 필요.
// I2570 · I2790 · COOKRCP01 · I1250 는 현재 키로 호출 불가.
export type HygieneRow = RecallRow;       // placeholder (I0490 응답 재활용)
export type NutritionRow = Record<string, string>;
export type RecipeRow = Record<string, string>;
export type HealthFuncRow = Record<string, string>;
