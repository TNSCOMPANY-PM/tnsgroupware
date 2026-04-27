import "server-only";
import type { GeoInput, GeoOutput, FaqItem, DerivedMetric } from "@/lib/geo/types";
import { runMatrixGate, runPrefetch, canonicalUrlFor, resolveStoresLatest } from "./shared";
import { callGpt } from "@/lib/geo/write/gpt";
import { callSonnet } from "@/lib/geo/write/sonnet";
import { assembleFranchiseDoc } from "@/lib/geo/render/franchiseDoc";
import { normalizeFaqs } from "@/lib/geo/render/faq25";
import {
  buildFaqPage,
  buildBreadcrumb,
  buildFoodEstablishment,
  defaultBreadcrumbs,
} from "@/lib/geo/render/jsonLd";
import { lintForDepth } from "@/lib/geo/gates/lint";
import { crosscheckForDepth } from "@/lib/geo/gates/crosscheck";
import { upsertCanonical } from "@/lib/geo/canonicalStore";
import { deriveTimeseries, type TimeseriesDerived, type TimeseriesFact } from "@/lib/geo/metrics/derived";
import { InsufficientDataError } from "@/lib/geo/types";
import { routeTopicToFacts } from "@/lib/geo/prefetch/topicRouter";
import { fetchFrandoorDocx, extractHomepageFacts } from "@/lib/geo/prefetch/frandoorDocx";
import {
  pickMetaPattern,
  buildFormulaItems,
  buildLedeMarkdown,
  buildConclusionMarkdown,
  buildFormulaMarkdown,
  detectUsedFormulas,
} from "@/lib/geo/write/lede";
import { buildAvsCRows, renderMarkdownTable } from "@/lib/geo/write/compareTable";
import { chooseTitle } from "@/lib/geo/write/titler";
import { buildFrontmatter, renderFrontmatterYaml } from "@/lib/geo/write/frontmatter";
import { buildCategoryFunnelMarkdown } from "@/lib/geo/write/categorySlug";

const TIMESERIES_META: Record<
  TimeseriesDerived["metric_id"],
  { key: DerivedMetric["key"]; label: string; unit: DerivedMetric["unit"] }
> = {
  frcs_growth: { key: "frcs_growth", label: "가맹점 증가수(A→C)", unit: "개" },
  frcs_multiplier: { key: "frcs_multiplier", label: "가맹점 확장배수(A→C)", unit: "배" },
  annualized_pos_sales: { key: "annualized_pos_sales", label: "C급 연환산 가맹점 평균매출", unit: "만원" },
  avg_sales_dilution: { key: "avg_sales_dilution", label: "평균매출 희석률(A→C)", unit: "%" },
};

function timeseriesToDerived(ts: TimeseriesDerived): DerivedMetric {
  const meta = TIMESERIES_META[ts.metric_id];
  const [aPeriod, cPeriod] = ts.period_compare;
  const period = aPeriod && cPeriod ? `${aPeriod}→${cPeriod}` : aPeriod || cPeriod || "";
  return {
    key: meta.key,
    label: meta.label,
    value: ts.value,
    unit: meta.unit,
    basis: ts.formula,
    formula: ts.formula,
    inputs: { period_A: aPeriod, period_C: cPeriod },
    period,
    confidence: "medium",
  };
}

export async function runD3(input: GeoInput): Promise<GeoOutput> {
  if (input.depth !== "D3") throw new Error("runD3 requires depth=D3");
  const logs: string[] = [];
  const log = (s: string) => { logs.push(s); console.log(s); };

  await runMatrixGate(input);
  log(`[gate:matrix] D3 ${input.brand} pass`);

  const pre = await runPrefetch(input);
  log(`[prefetch] deriveds=${pre.deriveds.length}`);

  // stores resolve (A frandoor_ftc_facts > unknown). PR043: honsa(xlsx) 경로 제거.
  const { resolved: stores, official } = await resolveStoresLatest(input.brandId);
  log(`[stores] ${input.brand}: count=${stores.count} source=${stores.source} as_of=${stores.as_of}${stores.note ? ` note=${stores.note}` : ""}`);

  const nowYear = new Date().getFullYear();

  const { facts } = await callGpt(input, pre.block);
  // L24 안전망: GPT 가 단일 도메인만 반환하면 KOSIS 참조 fact 를 1 건 주입해 도메인 다양성 확보
  const uniqueDomains = new Set<string>();
  for (const f of facts.facts) {
    try { uniqueDomains.add(new URL(f.source_url).hostname); } catch { /* noop */ }
  }
  if (uniqueDomains.size < 2) {
    facts.facts.push({
      claim: "외식산업 업종 평균 참조",
      value: "KOSIS 외식산업 연간지표 참고",
      unit: null,
      source_url: "https://kosis.kr/",
      source_title: "통계청 KOSIS 외식산업 통계",
      year_month: new Date().toISOString().slice(0, 7),
      authoritativeness: "secondary",
      tier: "B",
    });
    log(`[gpt] L24 보조출처 주입 (kosis.kr)`);
  }

  // A급 Fact 주입 — frandoor_ftc_facts v2 (master + timeseries + regional)
  if (official) {
    const m = official.master;
    const yr = m.latest_year ?? m.source_year ?? "";
    const sourceLabel = `${input.brand} 공정위 정보공개서 (${m.source_registered_at ?? yr ?? "등록일 미상"})`;
    const ym = yr ? `${yr}-12` : (m.source_registered_at ?? "").slice(0, 7);
    const aBase = {
      source_url: "https://franchise.ftc.go.kr/",
      source_title: sourceLabel,
      year_month: ym || "2024-12",
      period_month: ym || "2024-12",
      authoritativeness: "primary" as const,
      tier: "A" as const,
      source_tier: "A" as const,
    };
    const pushA = (claim: string, value: number, unit: string, fact_key: string) =>
      facts.facts.push({ ...aBase, claim, value, unit, fact_key });
    const fmtMan = (n: number) => `${n.toLocaleString("ko-KR")}만원`;

    // 마스터 핵심
    if (m.stores_total != null) pushA(`공정위 정보공개서 ${yr} 연말 누적 가맹점 ${m.stores_total.toLocaleString()}개`, m.stores_total, "개", "ftc_stores_total");
    if (m.avg_monthly_revenue != null) pushA(`공정위 정보공개서 ${yr} 기준 가맹점당 월평균매출 ${fmtMan(m.avg_monthly_revenue)}`, m.avg_monthly_revenue, "만원", "ftc_avg_monthly_revenue");
    if (m.latest_avg_annual_revenue != null) pushA(`공정위 정보공개서 ${yr} 기준 가맹점당 연평균매출 ${fmtMan(m.latest_avg_annual_revenue)}`, m.latest_avg_annual_revenue, "만원", "ftc_avg_annual_revenue");
    if (m.latest_avg_revenue_per_unit_area != null) pushA(`공정위 정보공개서 ${yr} 기준 면적당(3.3㎡) 연매출 ${fmtMan(m.latest_avg_revenue_per_unit_area)}`, m.latest_avg_revenue_per_unit_area, "만원", "ftc_avg_revenue_per_unit_area");
    if (m.cost_total != null) pushA(`공정위 정보공개서 ${yr} 창업비용 총액 ${fmtMan(m.cost_total)}`, m.cost_total, "만원", "ftc_cost_total");
    if (m.franchise_fee != null) pushA(`공정위 정보공개서 ${yr} 가맹비 ${fmtMan(m.franchise_fee)}`, m.franchise_fee, "만원", "ftc_franchise_fee");
    if (m.education_fee != null) pushA(`공정위 정보공개서 ${yr} 교육비 ${fmtMan(m.education_fee)}`, m.education_fee, "만원", "ftc_education_fee");
    if (m.deposit != null) pushA(`공정위 정보공개서 ${yr} 보증금 ${fmtMan(m.deposit)}`, m.deposit, "만원", "ftc_deposit");
    if (m.other_cost != null) pushA(`공정위 정보공개서 ${yr} 기타비용 ${fmtMan(m.other_cost)}`, m.other_cost, "만원", "ftc_other_cost");
    if (m.interior_total != null) pushA(`공정위 정보공개서 ${yr} 인테리어 총액 ${fmtMan(m.interior_total)}`, m.interior_total, "만원", "ftc_interior_total");
    if (m.interior_per_unit_area != null) pushA(`공정위 정보공개서 ${yr} 평당 인테리어 ${fmtMan(m.interior_per_unit_area)}`, m.interior_per_unit_area, "만원", "ftc_interior_per_unit_area");
    if (m.reference_area != null) pushA(`공정위 정보공개서 ${yr} 기준 점포 면적 ${m.reference_area}㎡`, m.reference_area, "㎡", "ftc_reference_area");
    if (m.contract_initial_years != null) pushA(`공정위 정보공개서 ${yr} 최초 계약기간 ${m.contract_initial_years}년`, m.contract_initial_years, "년", "ftc_contract_initial_years");
    if (m.contract_extension_years != null) pushA(`공정위 정보공개서 ${yr} 연장 계약기간 ${m.contract_extension_years}년`, m.contract_extension_years, "년", "ftc_contract_extension_years");
    if (m.closure_rate != null) pushA(`공정위 정보공개서 ${yr} 폐점률 ${m.closure_rate}%`, m.closure_rate, "%", "ftc_closure_rate");
    if (m.industry_avg_revenue != null) pushA(`공정위 정보공개서 ${yr} 업종 평균 월매출 ${fmtMan(m.industry_avg_revenue)}`, m.industry_avg_revenue, "만원", "ftc_industry_avg_revenue");
    if (m.violations_total != null) pushA(`공정위 정보공개서 ${yr} 법위반 합계 ${m.violations_total}건`, m.violations_total, "건", "ftc_violations_total");
    if (m.violations_ftc != null) pushA(`공정위 시정조치 ${m.violations_ftc}건`, m.violations_ftc, "건", "ftc_violations_ftc");
    if (m.brand_count != null) pushA(`본사 운영 브랜드 수 ${m.brand_count}개`, m.brand_count, "개", "ftc_brand_count");
    if (m.affiliate_count != null) pushA(`본사 계열사 수 ${m.affiliate_count}개`, m.affiliate_count, "개", "ftc_affiliate_count");

    // 최신 연도 timeseries (재무·임직원·광고)
    const latestTs = official.timeseries[0] ?? null;
    if (latestTs) {
      const tYr = String(latestTs.year);
      if (latestTs.revenue != null) pushA(`공정위 정보공개서 ${tYr} 본사 매출 ${fmtMan(latestTs.revenue)}`, latestTs.revenue, "만원", "ftc_ts_revenue");
      if (latestTs.operating_profit != null) pushA(`공정위 정보공개서 ${tYr} 본사 영업이익 ${fmtMan(latestTs.operating_profit)}`, latestTs.operating_profit, "만원", "ftc_ts_operating_profit");
      if (latestTs.net_profit != null) pushA(`공정위 정보공개서 ${tYr} 본사 당기순이익 ${fmtMan(latestTs.net_profit)}`, latestTs.net_profit, "만원", "ftc_ts_net_profit");
      if (latestTs.assets != null) pushA(`공정위 정보공개서 ${tYr} 본사 자산 ${fmtMan(latestTs.assets)}`, latestTs.assets, "만원", "ftc_ts_assets");
      if (latestTs.liabilities != null) pushA(`공정위 정보공개서 ${tYr} 본사 부채 ${fmtMan(latestTs.liabilities)}`, latestTs.liabilities, "만원", "ftc_ts_liabilities");
      if (latestTs.equity != null) pushA(`공정위 정보공개서 ${tYr} 본사 자본 ${fmtMan(latestTs.equity)}`, latestTs.equity, "만원", "ftc_ts_equity");
      if (latestTs.employees != null) pushA(`공정위 정보공개서 ${tYr} 본사 직원수 ${latestTs.employees}명`, latestTs.employees, "명", "ftc_ts_employees");
      if (latestTs.advertising != null) pushA(`공정위 정보공개서 ${tYr} 광고비 ${fmtMan(latestTs.advertising)}`, latestTs.advertising, "만원", "ftc_ts_advertising");
      if (latestTs.promotion != null) pushA(`공정위 정보공개서 ${tYr} 판촉비 ${fmtMan(latestTs.promotion)}`, latestTs.promotion, "만원", "ftc_ts_promotion");

      // 파생 (fact 로 pre-compute)
      if (latestTs.liabilities != null && latestTs.equity && latestTs.equity > 0) {
        const debtRatio = Math.round((latestTs.liabilities / latestTs.equity) * 1000) / 10;
        pushA(`공정위 정보공개서 ${tYr} 부채비율 ${debtRatio}%`, debtRatio, "%", "ftc_debt_ratio");
      }
      if (latestTs.operating_profit != null && latestTs.revenue && latestTs.revenue > 0) {
        const opMargin = Math.round((latestTs.operating_profit / latestTs.revenue) * 1000) / 10;
        pushA(`공정위 정보공개서 ${tYr} 영업이익률 ${opMargin}%`, opMargin, "%", "ftc_operating_margin");
      }
      if (latestTs.advertising != null && latestTs.stores_total && latestTs.stores_total > 0) {
        const adPerStore = Math.round(latestTs.advertising / latestTs.stores_total);
        pushA(`공정위 정보공개서 ${tYr} 점포당 광고비 ${fmtMan(adPerStore)}`, adPerStore, "만원", "ftc_ad_per_store");
      }
      if (latestTs.new_opens != null) pushA(`공정위 정보공개서 ${tYr} 신규개점 ${latestTs.new_opens}개`, latestTs.new_opens, "개", "ftc_ts_new_opens");
      if (latestTs.contract_end != null) pushA(`공정위 정보공개서 ${tYr} 계약종료 ${latestTs.contract_end}건`, latestTs.contract_end, "건", "ftc_ts_contract_end");
      if (latestTs.contract_terminate != null) pushA(`공정위 정보공개서 ${tYr} 계약해지 ${latestTs.contract_terminate}건`, latestTs.contract_terminate, "건", "ftc_ts_contract_terminate");
      if (latestTs.stores_total != null) pushA(`공정위 정보공개서 ${tYr} 전체 점포수 ${latestTs.stores_total}개`, latestTs.stores_total, "개", "ftc_ts_stores_total");
      if (latestTs.stores_direct != null) pushA(`공정위 정보공개서 ${tYr} 직영점 ${latestTs.stores_direct}개`, latestTs.stores_direct, "개", "ftc_ts_stores_direct");
    }

    // 지역 편중도 — 최신 연도 regional
    const latestRegYear = official.regional.length > 0 ? Math.max(...official.regional.map((r) => r.year)) : 0;
    const latestReg = official.regional.filter((r) => r.year === latestRegYear);
    if (latestReg.length > 0) {
      const totalFr = latestReg.reduce((s, r) => s + (r.stores_franchise ?? 0), 0);
      if (totalFr > 0) {
        const sorted = [...latestReg].sort((a, b) => (b.stores_franchise ?? 0) - (a.stores_franchise ?? 0));
        const topReg = sorted[0];
        const share = Math.round(((topReg.stores_franchise ?? 0) / totalFr) * 1000) / 10;
        pushA(`공정위 정보공개서 ${latestRegYear} 최다 분포 지역 ${topReg.region} 점유율 ${share}%`, share, "%", "ftc_region_top_share");
      }
    }

    // PR034 추가 파생지표
    // 1) 점포당 직원수 (직원 1인당 담당 점포)
    if (latestTs?.employees != null && latestTs.employees > 0 && latestTs.stores_total != null && latestTs.stores_total > 0) {
      const storesPerEmp = Math.round((latestTs.stores_total / latestTs.employees) * 10) / 10;
      pushA(`공정위 정보공개서 ${latestTs.year} 본사 직원 1인당 담당 점포 ${storesPerEmp}개`, storesPerEmp, "개", "ftc_stores_per_employee");
    }
    // 2) 인테리어 비중 (interior_total / cost_total)
    if (m.interior_total != null && m.cost_total != null && m.cost_total > 0) {
      const interiorPct = Math.round((m.interior_total / m.cost_total) * 1000) / 10;
      pushA(`공정위 정보공개서 ${yr} 창업비용 중 인테리어 비중 ${interiorPct}%`, interiorPct, "%", "ftc_interior_ratio");
    }
    // 3) 점포수 YoY (최근 2년 비교)
    if (official.timeseries.length >= 2) {
      const sorted = [...official.timeseries].sort((a, b) => b.year - a.year);
      const cur = sorted[0];
      const prev = sorted[1];
      if (cur.stores_total != null && prev.stores_total != null && prev.stores_total > 0) {
        const yoy = Math.round((cur.stores_total / prev.stores_total - 1) * 1000) / 10;
        pushA(`공정위 정보공개서 기준 점포수 YoY ${yoy}% (${prev.year} ${prev.stores_total}개 → ${cur.year} ${cur.stores_total}개)`, yoy, "%", "ftc_stores_yoy");
      }
    }
    // 4) 매출 YoY
    if (official.timeseries.length >= 2) {
      const sorted = [...official.timeseries].sort((a, b) => b.year - a.year);
      const cur = sorted[0], prev = sorted[1];
      if (cur.revenue != null && prev.revenue != null && prev.revenue > 0) {
        const rYoy = Math.round((cur.revenue / prev.revenue - 1) * 1000) / 10;
        pushA(`공정위 정보공개서 본사 매출 YoY ${rYoy}% (${prev.year} → ${cur.year})`, rYoy, "%", "ftc_revenue_yoy");
      }
    }
    // 5) 법인 업력 (현재 연도 - corp_founded_date 연도)
    if (m.corp_founded_date) {
      const foundedYear = parseInt(m.corp_founded_date.slice(0, 4), 10);
      if (foundedYear >= 1900) {
        const age = nowYear - foundedYear;
        pushA(`법인 업력 ${age}년 (${foundedYear}년 설립)`, age, "년", "corp_age");
      }
    }
    // 6) 가맹사업 업력 (현재 연도 - franchise_started_date 연도)
    if (m.franchise_started_date) {
      const fsYear = parseInt(m.franchise_started_date.slice(0, 4), 10);
      if (fsYear >= 1900) {
        const fsAge = nowYear - fsYear;
        pushA(`가맹사업 업력 ${fsAge}년 (${fsYear}년 개시)`, fsAge, "년", "franchise_age");
      }
    }

    log(`[gpt] A급 v2 주입: master ${Object.values(m).filter((v) => v != null).length}필드, ts=${official.timeseries.length}년, regional=${official.regional.length}행`);
  }

  // PR035 — topic → B급 라우팅 fact 주입
  const topic = (input as { topic?: string }).topic;
  if (topic && topic.trim().length > 0) {
    const industry =
      official?.master?.industry_sub ??
      official?.master?.industry_main ??
      facts.industry ??
      "외식";
    const topicRoute = await routeTopicToFacts(topic, { industry, brand: input.brand }, log);
    for (const f of topicRoute.facts) {
      facts.facts.push({
        claim: f.claim,
        value: f.value,
        unit: f.unit,
        source_url: f.source_url,
        source_title: f.source_title,
        year_month: f.year_month,
        period_month: f.period_month,
        authoritativeness: f.authoritativeness,
        tier: f.tier,
        source_tier: f.source_tier,
        fact_key: f.fact_key,
      });
    }
    log(
      `[topic] summary: matched=[${topicRoute.matched_routes.join(",")}] filled=[${topicRoute.filled_routes.join(",")}] total facts 추가=${topicRoute.facts.length}`,
    );
  }

  // PR043 — docx (geo_brands.fact_data) 기반 facts 주입. xlsx POS 경로 폐기.
  const docx = await fetchFrandoorDocx(input.brandId);
  if (docx) {
    const od = docx.official_data;
    const hp = extractHomepageFacts(docx.raw_text_chunks);

    const fmtManC = (n: number) => `${n.toLocaleString("ko-KR")}만원`;
    const sourceYearOfficial = od?.source_year ?? "";
    const docxYm = sourceYearOfficial ? `${sourceYearOfficial}-12` : "2024-12";

    const officialBase = {
      source_url: "https://franchise.ftc.go.kr/",
      source_title: `${input.brand} 공정위 정보공개서 ${sourceYearOfficial}`,
      year_month: docxYm,
      period_month: docxYm,
      authoritativeness: "primary" as const,
      tier: "A" as const,
      source_tier: "A" as const,
    };
    const pushDocxOfficial = (claim: string, value: number, unit: string, fact_key: string) =>
      facts.facts.push({ ...officialBase, claim, value, unit, fact_key });

    if (od) {
      if (od.stores_total != null)
        pushDocxOfficial(
          `공정위 정보공개서 ${sourceYearOfficial} 기준 가맹점수 ${od.stores_total.toLocaleString()}개`,
          od.stores_total,
          "개",
          "frcs_cnt", // PR044 deriveTimeseries pair
        );
      if (od.avg_monthly_revenue != null)
        pushDocxOfficial(
          `공정위 정보공개서 ${sourceYearOfficial} 기준 가맹점당 월평균매출 ${fmtManC(od.avg_monthly_revenue)}`,
          od.avg_monthly_revenue,
          "만원",
          "docx_avg_monthly_revenue",
        );
      if (od.cost_total != null)
        pushDocxOfficial(
          `공정위 정보공개서 ${sourceYearOfficial} 기준 창업비용 총액 ${fmtManC(od.cost_total)}`,
          od.cost_total,
          "만원",
          "docx_cost_total",
        );
      if (od.franchise_fee != null)
        pushDocxOfficial(
          `공정위 정보공개서 ${sourceYearOfficial} 기준 가맹비 ${fmtManC(od.franchise_fee)}`,
          od.franchise_fee,
          "만원",
          "docx_franchise_fee",
        );
      if (od.closure_rate != null)
        pushDocxOfficial(
          `공정위 정보공개서 ${sourceYearOfficial} 기준 폐점률 ${od.closure_rate}%`,
          od.closure_rate,
          "%",
          "docx_closure_rate",
        );

      // 업종 평균 — 공정위 가맹사업 현황 통계 (docx 작성자가 조사)
      if (od.industry_avg_revenue != null) {
        const industryBase = {
          source_url: "https://www.ftc.go.kr/",
          source_title: `공정위 가맹사업 현황 통계 ${sourceYearOfficial}`,
          year_month: docxYm,
          period_month: docxYm,
          authoritativeness: "primary" as const,
          tier: "B" as const,
          source_tier: "B" as const,
        };
        facts.facts.push({
          ...industryBase,
          claim: `${sourceYearOfficial} 동 업종 프랜차이즈 평균 월매출 ${fmtManC(od.industry_avg_revenue)} (공정위 가맹사업 현황 통계)`,
          value: od.industry_avg_revenue,
          unit: "만원",
          fact_key: "docx_industry_avg_revenue",
        });

        if (od.avg_monthly_revenue != null && od.industry_avg_revenue > 0) {
          const ratio = Math.round((od.avg_monthly_revenue / od.industry_avg_revenue) * 100) / 100;
          facts.facts.push({
            ...officialBase,
            claim: `${input.brand} 월평균매출은 동 업종 평균의 ${ratio}배 수준`,
            value: ratio,
            unit: "배",
            fact_key: "docx_industry_vs_brand_ratio",
            derived: true,
            formula_id: "industry_vs_brand_ratio",
          });
        }
      }
    }

    // __raw_text__ 기반 홈페이지 facts (본사 자체 공개 자료)
    const homepageBase = {
      source_url: "",
      source_title: `${input.brand} 본사 홈페이지·공개 자료`,
      year_month: new Date().toISOString().slice(0, 7),
      period_month: new Date().toISOString().slice(0, 7),
      authoritativeness: "secondary" as const,
      tier: "C" as const,
      source_tier: "C" as const,
    };
    if (hp.stores_count_self != null)
      facts.facts.push({
        ...homepageBase,
        claim: `본사 홈페이지 발표 ${hp.stores_count_self}호점 규모`,
        value: hp.stores_count_self,
        unit: "호점",
        fact_key: "frcs_cnt", // PR044 deriveTimeseries pair
      });
    if (hp.avg_monthly_revenue_homepage != null)
      facts.facts.push({
        ...homepageBase,
        claim: `본사 홈페이지 발표 평균 월매출 ${fmtManC(hp.avg_monthly_revenue_homepage)}`,
        value: hp.avg_monthly_revenue_homepage,
        unit: "만원",
        fact_key: "monthly_avg_sales", // PR044 deriveTimeseries pair
      });
    if (hp.real_investment != null)
      facts.facts.push({
        ...homepageBase,
        claim: `본사 홈페이지 발표 실투자금 ${fmtManC(hp.real_investment)}`,
        value: hp.real_investment,
        unit: "만원",
        fact_key: "docx_hp_real_investment",
      });
    if (hp.legal_disputes_self != null)
      facts.facts.push({
        ...homepageBase,
        claim: `본사 공개 자료 법적 분쟁 ${hp.legal_disputes_self}건`,
        value: hp.legal_disputes_self,
        unit: "건",
        fact_key: "docx_hp_legal_disputes",
      });
    if (hp.profit_margin != null)
      facts.facts.push({
        ...homepageBase,
        claim: `본사 공개 자료 순마진 ${hp.profit_margin}%`,
        value: hp.profit_margin,
        unit: "%",
        fact_key: "docx_hp_profit_margin",
      });
    if (hp.payback_months != null)
      facts.facts.push({
        ...homepageBase,
        claim: `본사 공개 자료 투자회수 ${hp.payback_months}개월`,
        value: hp.payback_months,
        unit: "개월",
        fact_key: "docx_hp_payback_months",
      });

    const hpFilled = Object.values(hp).filter((v) => v != null).length;
    log(`[docx] ${input.brand} — official_data=${!!od} industry_avg=${od?.industry_avg_revenue ?? "-"} homepage_extracted=${hpFilled}`);
  } else {
    log(`[docx] ${input.brand} — geo_brands.fact_data 없음`);
  }

  // PR036 — facts 기반 데이터 충분성 게이트 (tier 분류 대체).
  const aFactsCount = facts.facts.filter((f) => f.source_tier === "A").length;
  const cFactsCount = facts.facts.filter((f) => f.source_tier === "C").length;
  const totalFactsCount = facts.facts.length;
  log(`[facts] total=${totalFactsCount} A=${aFactsCount} C=${cFactsCount}`);
  if (totalFactsCount < 10 || aFactsCount < 3) {
    throw new InsufficientDataError(
      `D3 생성 불가: facts=${totalFactsCount} (A=${aFactsCount}, C=${cFactsCount}). 공정위 정보공개서 또는 본사 POS 데이터 적재 후 재시도.`,
      { total: totalFactsCount, a: aFactsCount, c: cFactsCount },
    );
  }

  const tsFacts: TimeseriesFact[] = facts.facts.map((f) => ({
    fact_key: f.fact_key,
    source_tier: f.source_tier,
    value: f.value,
    period_month: f.period_month,
    year_month: f.year_month,
  }));
  // PR044 — docx 월평균매출(A)을 ×12 해 avg_annual_sales 로 가상 tsFact 주입.
  // 본문 facts 에는 미노출 (deriveTimeseries 전용), avg_sales_dilution 파생 근거.
  if (docx?.official_data?.avg_monthly_revenue != null && docx.official_data.source_year) {
    tsFacts.push({
      fact_key: "avg_annual_sales",
      source_tier: "A",
      value: docx.official_data.avg_monthly_revenue * 12,
      period_month: `${docx.official_data.source_year}-12`,
      year_month: `${docx.official_data.source_year}-12`,
    });
  }
  const tsDeriveds = deriveTimeseries(tsFacts).map(timeseriesToDerived);
  if (tsDeriveds.length > 0) {
    log(`[deriveTimeseries] ${tsDeriveds.map((d) => `${d.key}=${d.value}${d.unit}`).join(" / ")}`);
  } else {
    log(`[deriveTimeseries] A·C pair 없음 (frcs_cnt / monthly_avg_sales / avg_annual_sales 중 매칭 실패)`);
  }
  const factsPlus = { ...facts, deriveds: [...pre.deriveds, ...tsDeriveds] };
  log(`[gpt] facts=${facts.facts.length} ts_deriveds=${tsDeriveds.length}`);

  // PR047 — 마크다운 lede / 결론 / 산식 사전 조립 + frontmatter.
  const allDeriveds = [...pre.deriveds, ...tsDeriveds];
  const compareRows = buildAvsCRows(facts.facts);
  const compareMd = renderMarkdownTable(compareRows);
  const titleYear = official?.master.latest_year
    ? String(official.master.latest_year)
    : (docx?.official_data?.source_year ?? "2024");
  const suggestedTitle = chooseTitle({
    brand: input.brand,
    facts: facts.facts,
    deriveds: allDeriveds,
    topic: (input as { topic?: string }).topic,
    year: titleYear,
  });
  const metaSelection = pickMetaPattern({ facts: facts.facts, deriveds: allDeriveds });
  const formulaItems = buildFormulaItems({ facts: facts.facts, deriveds: allDeriveds });

  // CTA (외부 링크 — master 가용 시만)
  const masterAny = official?.master as Record<string, unknown> | undefined;
  const ctaHrefRaw = (masterAny?.homepage_url as string | undefined) ?? null;
  const ctaPhone = (masterAny?.contact_phone as string | undefined) ?? null;
  const cta = ctaHrefRaw || ctaPhone
    ? { label: `${input.brand} 가맹문의`, href: ctaHrefRaw ?? undefined, phone: ctaPhone ?? undefined }
    : null;

  const ledeMd = buildLedeMarkdown({
    brand: input.brand,
    facts: facts.facts,
    deriveds: allDeriveds,
    metaPattern: metaSelection.pattern,
    metaPeriodGapMonths: metaSelection.period_gap_months,
  });
  // PR051 — 카테고리 매핑은 더 구체적인 industry_sub 우선 (예: "분식"), fallback "외식".
  const industryForCta =
    official?.master.industry_sub ?? official?.master.industry_main ?? null;
  const conclusionMd = buildConclusionMarkdown({
    brand: input.brand,
    facts: facts.facts,
    deriveds: allDeriveds,
    cta,
    industry: industryForCta,
  });
  const formulaMd = buildFormulaMarkdown(formulaItems);
  // PR051 — 카테고리 회유 마크다운 링크 (매핑 부재 시 빈 문자열).
  const categoryFunnelMd = buildCategoryFunnelMarkdown(industryForCta);

  log(
    `[md] lede=${ledeMd.length}자 compare_rows=${compareRows.length} formula=${formulaItems.length} meta=${metaSelection.pattern} title=${suggestedTitle?.pattern ?? "-"}`,
  );

  const sonnet = await callSonnet(input, factsPlus, pre.deriveds, {
    stores_resolved: stores,
    corporation_founded_year: official?.master.corp_founded_date
      ? parseInt(official.master.corp_founded_date.slice(0, 4), 10)
      : null,
    ftc_first_registered:
      official?.master.ftc_first_registered_date ??
      official?.master.source_first_registered_at ??
      null,
    lede_section_md: ledeMd,
    compare_table_md: compareMd,
    conclusion_section_md: conclusionMd,
    formula_section_md: formulaMd,
    category_funnel_md: categoryFunnelMd,
    suggested_title: suggestedTitle?.title ?? null,
    suggested_title_pattern: suggestedTitle?.pattern ?? null,
    meta_pattern: metaSelection.pattern,
    meta_period_gap_months: metaSelection.period_gap_months,
  });
  const raw = sonnet.raw as {
    canonicalUrl?: unknown;
    sections?: unknown;
    closure?: unknown;
    faq25?: unknown;
    meta?: Record<string, unknown>;
  };

  const faqs: FaqItem[] = normalizeFaqs("D3", raw.faq25);
  const payload = assembleFranchiseDoc(raw, faqs, pre.deriveds);

  // PR049 — 본문 inline 인용 검사 후 산식 박스 항목 필터링.
  // sonnet 이 모든 formulaItems 를 받아 body 에 박았으나, 본문에서 참조 안 한 항목은 박스에서 제외.
  const allBodyMd = payload.sections.map((s) => `## ${s.heading}\n\n${s.body}`).join("\n\n");
  const detected = detectUsedFormulas(allBodyMd, formulaItems);
  const visibleFormulas = detected.filter((f) => f.used_in_body);
  const filteredFormulaMd = visibleFormulas.length > 0 ? buildFormulaMarkdown(visibleFormulas) : "";
  if (formulaMd && filteredFormulaMd !== formulaMd) {
    // 본문에 이미 박힌 formula H2 섹션을 필터링된 버전으로 교체.
    for (const s of payload.sections) {
      const idx = s.body.search(/##\s*이\s*글에서\s*계산한\s*값들/m);
      if (idx >= 0) {
        const before = s.body.slice(0, idx);
        const afterMatch = s.body.slice(idx).match(/##\s*이\s*글에서\s*계산한\s*값들[\s\S]*?(?=\n##\s|$)/);
        const after = afterMatch ? s.body.slice(idx + afterMatch[0].length) : "";
        s.body = `${before}${filteredFormulaMd}${after}`.replace(/\n{3,}/g, "\n\n");
      }
    }
    log(
      `[formula] post-filter: ${formulaItems.length} → ${visibleFormulas.length} 항목 (제외: ${detected
        .filter((f) => !f.used_in_body)
        .map((f) => f.metric)
        .join(", ") || "-"})`,
    );
  }

  // PR047 — frontmatter 조립 후 payload.meta 에 부착.
  const fm = buildFrontmatter({
    brand: input.brand,
    brandId: input.brandId,
    topic: (input as { topic?: string }).topic ?? null,
    facts: facts.facts,
    deriveds: allDeriveds,
    faqs,
    industry: official?.master.industry_main ?? official?.master.industry_sub ?? null,
    suggestedTitle: suggestedTitle?.title ?? null,
    suggestedTitlePattern: suggestedTitle?.pattern ?? null,
    year: titleYear,
  });
  const frontmatterYaml = renderFrontmatterYaml(fm);
  if (payload.meta) {
    (payload.meta as Record<string, unknown>).frontmatterYaml = frontmatterYaml;
    (payload.meta as Record<string, unknown>).frontmatter = fm;
  }
  log(`[frontmatter] slug=${fm.slug} category=${fm.category} tags=[${fm.tags.join(",")}] faq=${fm.faq.length}`);

  const canonicalUrl =
    typeof raw.canonicalUrl === "string" && raw.canonicalUrl.startsWith("/")
      ? raw.canonicalUrl
      : canonicalUrlFor(input);

  const label = (raw.meta && typeof raw.meta.title === "string") ? raw.meta.title : input.brand;
  const description =
    raw.meta && typeof raw.meta.description === "string" ? raw.meta.description : undefined;
  const category = facts.category;

  const jsonLd: Record<string, unknown>[] = [
    buildFaqPage(faqs),
    buildBreadcrumb(defaultBreadcrumbs("D3", canonicalUrl, label)),
    buildFoodEstablishment({ brand: input.brand, canonicalUrl, description, category }),
  ];

  // PR043: xlsx POS 경로 폐기 → availableStoreNames 수집 대상 없음.
  const d3Ctx = { availableStoreNames: [] as string[] };
  const lint = lintForDepth("D3", payload, factsPlus, { canonicalUrl, jsonLd, d3: d3Ctx });
  const bodyAggregate = [
    ...payload.sections.map((s) => s.body),
    payload.closure.bodyHtml,
    ...payload.faq25.flatMap((f) => [f.q, f.a]),
  ].join("\n\n");
  const crosscheck = crosscheckForDepth("D3", bodyAggregate, factsPlus);
  log(`[lint] err=${lint.errors.length} / [cc] matched=${crosscheck.matchedCount} unmatched=${crosscheck.unmatched.length}`);

  // PR030: D3 crosscheck strict 완화 → advisory. 과도한 unmatched 만 차단 (25+ 는 본문 전면 불일치 신호).
  if (crosscheck.strict && crosscheck.unmatched.length >= 25) {
    throw new Error(
      `GATE crosscheck(D3) 대량 불일치: unmatched ${crosscheck.unmatched.length}건 — ${crosscheck.unmatched.slice(0, 10).join(" | ")}`,
    );
  }

  const out: GeoOutput = {
    depth: "D3",
    canonicalUrl,
    payload,
    jsonLd,
    tiers: {
      A: facts.facts.filter((f) => f.authoritativeness === "primary"),
      B: facts.facts.filter((f) => f.authoritativeness === "secondary"),
      C: [],
      D: pre.deriveds,
    },
    lint,
    crosscheck,
    logs,
  };
  await upsertCanonical(out, { brandId: input.brandId, slug: canonicalUrl.replace("/franchise/", ""), facts: factsPlus });
  return out;
}
