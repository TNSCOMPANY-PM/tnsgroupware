/**
 * 공정위 대규모기업집단 정보 통합 클라이언트 (지정/소속/자산순위/개요/재무/임원/주주)
 * 호출 한도: apis.data.go.kr 공통 (일 10,000건)
 * 기준문서: https://www.data.go.kr/data/15083080
 */

import type { ConglomerateGroup, ConglomerateAffiliate } from "@/types/publicApi";

const BASE = "https://apis.data.go.kr/1130000";

function getKey(): string | null {
  return process.env.FTC_DATAPORTAL_KEY ?? process.env.FTC_API_KEY ?? null;
}

function toNum(s: string | undefined): number {
  if (!s) return 0;
  const n = Number(String(s).replace(/,/g, ""));
  return isNaN(n) ? 0 : n;
}

function parseItems(xml: string): Record<string, string>[] {
  const items: Record<string, string>[] = [];
  const blockRe = /<item>([\s\S]*?)<\/item>/g;
  let m: RegExpExecArray | null;
  while ((m = blockRe.exec(xml)) !== null) {
    const rec: Record<string, string> = {};
    const fieldRe = /<([a-zA-Z0-9_]+)>([\s\S]*?)<\/\1>/g;
    let f: RegExpExecArray | null;
    while ((f = fieldRe.exec(m[1])) !== null) {
      rec[f[1]] = f[2].replace(/<!\[CDATA\[|\]\]>/g, "").trim();
    }
    items.push(rec);
  }
  return items;
}

async function fetchPortal(
  servicePath: string,
  params: Record<string, string>,
): Promise<Record<string, string>[]> {
  const key = getKey();
  if (!key) {
    if (process.env.NODE_ENV !== "production") {
      console.warn(`[ftcConglomerateApi] FTC_DATAPORTAL_KEY 미설정 (${servicePath})`);
    }
    return [];
  }
  try {
    const all: Record<string, string>[] = [];
    for (let pageNo = 1; pageNo <= 20; pageNo++) {
      const qs = new URLSearchParams({
        serviceKey: key,
        pageNo: String(pageNo),
        numOfRows: "1000",
        resultType: "xml",
        ...params,
      });
      const r = await fetch(`${BASE}/${servicePath}?${qs.toString()}`, {
        cache: "no-store",
        headers: { "User-Agent": "Mozilla/5.0" },
      });
      if (!r.ok) break;
      const text = await r.text();
      if (text.includes("<errorCn>") || text.includes("<resultCode>11<")) break;
      const items = parseItems(text);
      all.push(...items);
      if (items.length < 1000) break;
    }
    return all;
  } catch {
    return [];
  }
}

export async function fetchGroupList(yr: string): Promise<ConglomerateGroup[]> {
  const raw = await fetchPortal("typeOfBusinessGrupSttusListApi/typeOfBusinessGrupSttusList", { yr });
  return raw.map(r => ({
    groupName: r.unityGrupNm ?? r.grupNm ?? "",
    rank: toNum(r.assetRank ?? r.rankNo),
    totalAssets: toNum(r.assetSum ?? r.totalAsset),
    companyCount: toNum(r.cmpnyCnt ?? r.entrprsCnt),
    representative: r.rprsntvNm ?? "",
  }));
}

export async function fetchGroupAffiliates(yr: string, groupName?: string): Promise<ConglomerateAffiliate[]> {
  const raw = await fetchPortal("typeOfBusinessCompSttusListApi/typeOfBusinessCompSttusList", { yr });
  const list = raw.map(r => ({
    groupName: r.unityGrupNm ?? r.grupNm ?? "",
    companyName: r.entrprsNm ?? r.corpNm ?? "",
    industry: r.indutyNm ?? r.bizTypNm ?? "",
    isListed: /상장|listed/i.test(r.lstsCd ?? r.lstCd ?? r.lstYn ?? ""),
    revenue: toNum(r.slsAmt ?? r.salesAmt),
    netIncome: toNum(r.thstrfpAmt ?? r.netIncome),
  }));
  if (groupName) {
    const needle = groupName.replace(/\s+/g, "");
    return list.filter(a => a.groupName.replace(/\s+/g, "").includes(needle));
  }
  return list;
}

export async function fetchAssetRank(yr: string): Promise<ConglomerateGroup[]> {
  const groups = await fetchGroupList(yr);
  return groups.sort((a, b) => b.totalAssets - a.totalAssets);
}

export async function fetchAffiliateOverview(yr: string, companyName: string): Promise<Record<string, string> | null> {
  const raw = await fetchPortal("compBsnmInfoListApi/compBsnmInfoList", { yr });
  const norm = (s: string) => s.replace(/\s+/g, "");
  const needle = norm(companyName);
  return raw.find(r => norm(r.entrprsNm ?? r.corpNm ?? "").includes(needle)) ?? null;
}

export async function fetchAffiliateParticipation(yr: string, companyName: string): Promise<Record<string, string>[]> {
  const raw = await fetchPortal("compBsnmPartcptnListApi/compBsnmPartcptnList", { yr });
  const norm = (s: string) => s.replace(/\s+/g, "");
  const needle = norm(companyName);
  return raw.filter(r => norm(r.entrprsNm ?? r.corpNm ?? "").includes(needle));
}

export async function fetchAffiliateShareholders(yr: string, companyName: string): Promise<Record<string, string>[]> {
  const raw = await fetchPortal("compStckhldrSttusListApi/compStckhldrSttusList", { yr });
  const norm = (s: string) => s.replace(/\s+/g, "");
  const needle = norm(companyName);
  return raw.filter(r => norm(r.entrprsNm ?? r.corpNm ?? "").includes(needle));
}

export async function fetchAffiliateExecutives(yr: string, companyName: string): Promise<Record<string, string>[]> {
  const raw = await fetchPortal("compOfcrSttusListApi/compOfcrSttusList", { yr });
  const norm = (s: string) => s.replace(/\s+/g, "");
  const needle = norm(companyName);
  return raw.filter(r => norm(r.entrprsNm ?? r.corpNm ?? "").includes(needle));
}

export {
  fetchConglomerateList,
  fetchConglomerateFinancials,
  type ConglomerateEntry,
  type ConglomerateFinancial,
} from "./ftcDataPortal";
