export type TourSpot = {
  contentId: string;
  title: string;
  addr: string;
  areaCode: string;
  sigunguCode: string;
  cat1: string;
  cat2: string;
  cat3: string;
  firstImage: string;
  mapX: string;
  mapY: string;
};

export type TourFestival = {
  contentId: string;
  title: string;
  addr: string;
  eventStartDate: string;
  eventEndDate: string;
  firstImage: string;
  areaCode: string;
};

export type NtsBusinessStatus = {
  bizNo: string;
  taxType: string;
  taxTypeCode: string;
  businessStatus: string;
  closedAt: string;
  raw: Record<string, string>;
};

export type SbizStore = {
  storeId: string;
  storeName: string;
  branchName: string;
  indutyLclasNm: string;
  indutyMlsfcNm: string;
  indutySclasNm: string;
  standardIndustryCode: string;
  ctprvnNm: string;
  signguNm: string;
  adongNm: string;
  lnoAddr: string;
  rdnmAddr: string;
  lon: string;
  lat: string;
  bizesNo?: string;
};

export type KosisMarketSize = {
  period: string;
  industry: string;
  value: number;
  unit: string;
};

export type FoodSafetyIncident = {
  type: "recall" | "hygiene";
  bizName: string;
  productName: string;
  reason: string;
  occurredAt: string;
  grade: string;
  raw: Record<string, string>;
};

export type ConglomerateGroup = {
  groupName: string;
  rank: number;
  totalAssets: number;
  companyCount: number;
  representative: string;
};

export type ConglomerateAffiliate = {
  groupName: string;
  companyName: string;
  industry: string;
  isListed: boolean;
  revenue: number;
  netIncome: number;
};
