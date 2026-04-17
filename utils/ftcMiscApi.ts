/**
 * 공정위 기타 공공데이터 (통신판매사업자, 외국계 가맹본부, 법인·개인 비율)
 * 호출 한도: apis.data.go.kr 공통 (일 10,000건)
 * 기준문서: https://www.data.go.kr/data/15008000
 */

export {
  fetchTelecomSellerList,
  fetchForeignFranchisor,
  fetchCorpTypeRatio,
  type TelecomSeller,
  type ForeignFranchisor,
  type CorpTypeRatio,
} from "./ftcDataPortal";
