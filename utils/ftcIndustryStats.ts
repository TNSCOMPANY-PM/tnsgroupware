/**
 * 공정위 OpenAPI 업종 집계 B급 유틸 (PR039).
 *
 * ⚠️ 이 파일은 B급 업종 집계만 제공합니다.
 * 개별 브랜드 수치 (frcsCnt 단독 조회) 는 A급 오해를 유발하므로 금지.
 * A급 브랜드 수치는 frandoor_ftc_facts (프랜도어 엑셀 업로드) 만 사용하세요.
 *
 * 출력 coverage 라벨은 항상 "외식업 프랜차이즈 한정 (공정위 정보공개서 집계)".
 * KOSIS (자영업 포함) 와 모집단이 다르므로 본문 인용 시 반드시 라벨 유지.
 */

import "server-only";
import {
  fetchIndutyOpenCloseRate,
  fetchAreaIndutyAvr,
  fetchBrandFrcsStats,
  type IndutyLclas,
} from "./ftcDataPortal";

export const FTC_COVERAGE_FRANCHISE = "외식업 프랜차이즈 한정 (공정위 정보공개서 집계)";

export type FtcIndustryStat = {
  industry_key: string;
  industry_kor: string;
  year: string;
  brand_count: number;
  total_stores: number;
  avg_stores: number;
  avg_new_stores: number;
  avg_contract_end: number;
  avg_contract_terminate: number;
  avg_closure_rate: number;
  avg_monthly_revenue: number | null;
  coverage: typeof FTC_COVERAGE_FRANCHISE;
  source_year: string;
};

const FALLBACK_YEARS = ["2024", "2023", "2022"];

function normalize(s: string): string {
  return s.replace(/\s+/g, "").trim();
}

function matchesIndustry(target: string, candidate: string): boolean {
  const t = normalize(target);
  const c = normalize(candidate);
  if (!t || !c) return false;
  return c.includes(t) || t.includes(c);
}

async function computeFromBrandStats(
  industryKor: string,
  year: string,
): Promise<FtcIndustryStat | null> {
  const all = await fetchBrandFrcsStats(year).catch(() => []);
  if (all.length === 0) return null;
  const rows = all.filter(
    (r) =>
      r.indutyLclasNm === "외식" &&
      (matchesIndustry(industryKor, r.indutyMlsfcNm) || matchesIndustry(industryKor, r.indutyLclasNm)),
  );
  if (rows.length === 0) return null;

  const totalStores = rows.reduce((s, r) => s + (r.frcsCnt ?? 0), 0);
  const totalNew = rows.reduce((s, r) => s + (r.newFrcsRgsCnt ?? 0), 0);
  const totalEnd = rows.reduce((s, r) => s + (r.ctrtEndCnt ?? 0), 0);
  const totalCanc = rows.reduce((s, r) => s + (r.ctrtCncltnCnt ?? 0), 0);
  const n = rows.length;
  const closureRate =
    totalStores > 0 ? Math.round(((totalEnd + totalCanc) / totalStores) * 1000) / 10 : 0;
  const revRows = rows.filter((r) => r.avrgSlsAmt > 0);
  const avgMonthlyRevenueMan =
    revRows.length > 0
      ? Math.round(revRows.reduce((s, r) => s + r.avrgSlsAmt, 0) / revRows.length / 10 / 12)
      : null;
  // avrgSlsAmt 는 천원 단위 연매출. 만원 월매출로 환산: /10 (천원→만원) /12 (연→월).

  return {
    industry_key: `외식_${industryKor}`,
    industry_kor: industryKor,
    year,
    brand_count: n,
    total_stores: totalStores,
    avg_stores: n > 0 ? Math.round(totalStores / n) : 0,
    avg_new_stores: n > 0 ? Math.round(totalNew / n) : 0,
    avg_contract_end: n > 0 ? Math.round(totalEnd / n) : 0,
    avg_contract_terminate: n > 0 ? Math.round(totalCanc / n) : 0,
    avg_closure_rate: closureRate,
    avg_monthly_revenue: avgMonthlyRevenueMan,
    coverage: FTC_COVERAGE_FRANCHISE,
    source_year: year,
  };
}

async function fromOpenCloseRate(
  industryKor: string,
  year: string,
): Promise<Partial<FtcIndustryStat> | null> {
  const rows = await fetchIndutyOpenCloseRate(year, "외식").catch(() => []);
  if (rows.length === 0) return null;
  const match = rows.find((r) => matchesIndustry(industryKor, r.industry));
  if (!match) return null;
  return {
    avg_closure_rate: match.closeRate,
    total_stores: match.totalStores,
  };
}

async function fromAreaAvg(
  industryKor: string,
  year: string,
): Promise<number | null> {
  const rows = await fetchAreaIndutyAvr(year, "외식").catch(() => []);
  if (rows.length === 0) return null;
  const matches = rows.filter((r) => matchesIndustry(industryKor, r.indutyMlsfcNm ?? ""));
  if (matches.length === 0) return null;
  const vals = matches
    .map((r) => Number(String(r.avrgSlsAmt ?? "").replace(/,/g, "")))
    .filter((v) => Number.isFinite(v) && v > 0);
  if (vals.length === 0) return null;
  const avgThousand = vals.reduce((s, v) => s + v, 0) / vals.length;
  return Math.round(avgThousand / 10 / 12);
}

export async function fetchFtcIndustryStat(opts: {
  industryKor: string;
  year?: string;
}): Promise<FtcIndustryStat | null> {
  const years = opts.year ? [opts.year, ...FALLBACK_YEARS.filter((y) => y !== opts.year)] : FALLBACK_YEARS;
  for (const yr of years) {
    const base = await computeFromBrandStats(opts.industryKor, yr);
    if (!base) continue;

    const [opcl, areaRevMan] = await Promise.all([
      fromOpenCloseRate(opts.industryKor, yr),
      opts.industryKor ? fromAreaAvg(opts.industryKor, yr) : null,
    ]);

    return {
      ...base,
      avg_closure_rate: opcl?.avg_closure_rate ?? base.avg_closure_rate,
      avg_monthly_revenue: areaRevMan ?? base.avg_monthly_revenue,
    };
  }
  return null;
}

export async function fetchFtcIndustryStatList(opts: {
  year?: string;
} = {}): Promise<FtcIndustryStat[]> {
  const years = opts.year ? [opts.year] : FALLBACK_YEARS;
  for (const yr of years) {
    const all = await fetchBrandFrcsStats(yr).catch((): Awaited<ReturnType<typeof fetchBrandFrcsStats>> => []);
    if (all.length === 0) continue;
    const byIndustry = new Map<string, typeof all>();
    for (const r of all) {
      if (r.indutyLclasNm !== "외식") continue;
      const key = r.indutyMlsfcNm || "외식";
      if (!byIndustry.has(key)) byIndustry.set(key, []);
      byIndustry.get(key)!.push(r);
    }
    const out: FtcIndustryStat[] = [];
    for (const [industryKor, rows] of byIndustry) {
      const totalStores = rows.reduce((s, r) => s + r.frcsCnt, 0);
      const totalEnd = rows.reduce((s, r) => s + r.ctrtEndCnt, 0);
      const totalCanc = rows.reduce((s, r) => s + r.ctrtCncltnCnt, 0);
      const revRows = rows.filter((r) => r.avrgSlsAmt > 0);
      out.push({
        industry_key: `외식_${industryKor}`,
        industry_kor: industryKor,
        year: yr,
        brand_count: rows.length,
        total_stores: totalStores,
        avg_stores: rows.length > 0 ? Math.round(totalStores / rows.length) : 0,
        avg_new_stores: rows.length > 0
          ? Math.round(rows.reduce((s, r) => s + r.newFrcsRgsCnt, 0) / rows.length)
          : 0,
        avg_contract_end: rows.length > 0 ? Math.round(totalEnd / rows.length) : 0,
        avg_contract_terminate: rows.length > 0 ? Math.round(totalCanc / rows.length) : 0,
        avg_closure_rate:
          totalStores > 0 ? Math.round(((totalEnd + totalCanc) / totalStores) * 1000) / 10 : 0,
        avg_monthly_revenue:
          revRows.length > 0
            ? Math.round(revRows.reduce((s, r) => s + r.avrgSlsAmt, 0) / revRows.length / 10 / 12)
            : null,
        coverage: FTC_COVERAGE_FRANCHISE,
        source_year: yr,
      });
    }
    return out;
  }
  return [];
}

/** lint 보조: 외식 lclas 한정 fetch 를 다른 파일이 import 할 때 쓸 수 있도록 재노출. */
export type { IndutyLclas };
