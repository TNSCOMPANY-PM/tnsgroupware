/**
 * 공정위 브랜드 관련 API (브랜드 목록/개요/가맹점현황/직영분포/신규등록)
 * 호출 한도: apis.data.go.kr 공통 (일 10,000건)
 * 기준문서: https://www.data.go.kr/data/15083033
 */

export {
  fetchBrandFrcsStats,
  findBrandFrcsStat,
  fetchBrandOverviewStats,
  fetchBrandDirectFrcsRatio,
  fetchNewBrandList,
  type BrandFrcsStat,
  type BrandOverviewStat,
  type DirectFrcsByScale,
  type NewBrandEntry,
} from "./ftcDataPortal";
