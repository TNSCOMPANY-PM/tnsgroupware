/**
 * 공정위 업종 관련 API (업종개황/창업비용/매출/가맹점수/변동/개폐점률)
 * 호출 한도: apis.data.go.kr 공통 (일 10,000건)
 * 기준문서: https://www.data.go.kr/data/15083015
 */

export {
  fetchIndutyStrtupCost,
  fetchAreaIndutyAvr,
  fetchAreaIndutyFrcsCount,
  fetchIndutyOpenCloseRate,
  fetchIndutyFrcsFluctuation,
  fetchIndutyOverview,
  fetchIndutyStartupCostRank,
  type IndutyLclas,
  type IndutyOpenCloseRate,
  type IndutyFrcsFluctuation,
  type IndutyOverview,
  type IndutyStartupCostRank,
} from "./ftcDataPortal";
