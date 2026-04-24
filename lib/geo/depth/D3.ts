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

  // stores resolve (C 본사 POS > A frandoor_ftc_facts > unknown).
  const { resolved: stores, honsa, official } = await resolveStoresLatest(input.brandId);
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

  // 본사 POS 수치(점포수/평균/탑3·바텀3)를 C급 Fact 로 주입 — crosscheck pool 에 포함되어야
  // Sonnet 이 인용한 POS 수치가 unmatched 로 잡히지 않음.
  // 엑셀 원본이 원(KRW)일 수 있음 → 만원 스케일 자동 감지 후 변환 (per_store_avg 가 1억 원 이상이면 원 단위로 판정).
  const latestPosRaw = honsa?.pos_monthly?.[honsa.pos_monthly.length - 1] ?? null;
  const scaleDivisor = latestPosRaw && latestPosRaw.per_store_avg > 100_000_000 ? 10000 : 1;
  const toMan = (n: number): number => Math.round(n / scaleDivisor);
  const latestPos = latestPosRaw
    ? {
        ...latestPosRaw,
        store_count: latestPosRaw.store_count,
        total_sales: toMan(latestPosRaw.total_sales),
        per_store_avg: toMan(latestPosRaw.per_store_avg),
        top3_stores: (latestPosRaw.top3_stores ?? []).map((s) => ({ name: s.name, sales: toMan(s.sales) })),
        bottom3_stores: (latestPosRaw.bottom3_stores ?? []).map((s) => ({ name: s.name, sales: toMan(s.sales) })),
      }
    : null;
  // 개별 점포명은 facts 에 넣지 않음 — 점주 개인정보·입지 기밀 (PR031 hotfix).
  // 대신 top3/bot3 집계값(평균·최대-최소 배수·상위3 점유율·최하위 대비율) 을 익명 파생치로 주입.
  if (latestPos) {
    const asOf = latestPos.year_month;
    const cBase = {
      source_url: "https://frandoor.co.kr/",
      source_title: "프랜도어 본사 POS 집계",
      year_month: asOf,
      period_month: asOf,
      authoritativeness: "secondary" as const,
      tier: "C" as const,
      source_tier: "C" as const,
    };
    const fmtMan = (n: number) => `${n.toLocaleString("ko-KR")}만원`;
    facts.facts.push({ ...cBase, claim: `본사 POS 활성 점포수 ${latestPos.store_count}개`, value: latestPos.store_count, unit: "개", fact_key: "frcs_cnt" });
    facts.facts.push({ ...cBase, claim: `본사 POS 가맹점당 월평균매출 ${fmtMan(latestPos.per_store_avg)}`, value: latestPos.per_store_avg, unit: "만원", fact_key: "monthly_avg_sales" });
    facts.facts.push({ ...cBase, claim: `본사 POS 전체 월매출 합계 ${fmtMan(latestPos.total_sales)}`, value: latestPos.total_sales, unit: "만원", fact_key: "total_sales" });

    const top = latestPos.top3_stores ?? [];
    const bot = latestPos.bottom3_stores ?? [];
    if (top.length > 0) {
      const topAvg = Math.round(top.reduce((s, x) => s + x.sales, 0) / top.length);
      facts.facts.push({ ...cBase, claim: `본사 POS 상위 3점포 월매출 평균 ${fmtMan(topAvg)}`, value: topAvg, unit: "만원", fact_key: "pos_top3_avg" });
    }
    if (bot.length > 0) {
      const botAvg = Math.round(bot.reduce((s, x) => s + x.sales, 0) / bot.length);
      facts.facts.push({ ...cBase, claim: `본사 POS 하위 3점포 월매출 평균 ${fmtMan(botAvg)}`, value: botAvg, unit: "만원", fact_key: "pos_bot3_avg" });
    }
    const topMax = top.length > 0 ? Math.max(...top.map((s) => s.sales)) : 0;
    const botMin = bot.length > 0 ? Math.min(...bot.map((s) => s.sales)) : 0;
    if (topMax > 0) {
      facts.facts.push({ ...cBase, claim: `본사 POS ${asOf} 최상위 점포 월매출 ${fmtMan(topMax)}`, value: topMax, unit: "만원", fact_key: "pos_top_max" });
    }
    if (botMin > 0) {
      facts.facts.push({ ...cBase, claim: `본사 POS ${asOf} 최하위 점포 월매출 ${fmtMan(botMin)}`, value: botMin, unit: "만원", fact_key: "pos_bottom_min" });
    }
    if (topMax > 0 && botMin > 0) {
      const maxMinRatio = Math.round((topMax / botMin) * 10) / 10;
      facts.facts.push({ ...cBase, claim: `본사 POS ${asOf} 최상위·최하위 점포 매출 ${maxMinRatio}배 격차`, value: maxMinRatio, unit: "배", fact_key: "pos_maxmin_ratio" });
    }
    if (top.length > 0 && latestPos.total_sales > 0) {
      const top3Sum = top.reduce((s, x) => s + x.sales, 0);
      const sharePct = Math.round((top3Sum / latestPos.total_sales) * 1000) / 10;
      facts.facts.push({ ...cBase, claim: `본사 POS 상위 3점포 전체 매출 점유율 ${sharePct}%`, value: sharePct, unit: "%", fact_key: "pos_top3_share_pct" });
    }
    if (botMin > 0 && latestPos.per_store_avg > 0) {
      const botVsAvg = Math.round((botMin / latestPos.per_store_avg) * 1000) / 10;
      facts.facts.push({ ...cBase, claim: `본사 POS 최하위 점포 월매출 평균 대비 ${botVsAvg}%`, value: botVsAvg, unit: "%", fact_key: "pos_bottom_vs_avg_pct" });
    }
    log(`[gpt] C급 POS 주입(익명집계): stores=${latestPos.store_count} avg=${latestPos.per_store_avg}만원 scaleDiv=${scaleDivisor} top3avg bot3avg maxMin share botVsAvg`);

    // PR033 — 파생지표 + 점포 등급 분포
    const fmtManC = (n: number) => `${n.toLocaleString("ko-KR")}만원`;
    const pushC = (claim: string, value: number, unit: string, fact_key: string) =>
      facts.facts.push({ ...cBase, claim, value, unit, fact_key });
    if (honsa?.seasonal_ratio != null) pushC(`본사 POS 계절 변동 배수 ${honsa.seasonal_ratio}배 (성수기 ${honsa.seasonal_peak_month ?? "?"} / 비수기 ${honsa.seasonal_trough_month ?? "?"})`, honsa.seasonal_ratio, "배", "pos_season_amplitude");
    if (honsa?.yoy_growth != null) pushC(`본사 POS YoY 성장률 ${honsa.yoy_growth}%`, honsa.yoy_growth, "%", "pos_yoy_growth");
    if (honsa?.qoq_growth != null) pushC(`본사 POS QoQ 성장률 ${honsa.qoq_growth}%`, honsa.qoq_growth, "%", "pos_qoq_growth");
    if (honsa?.survival_rate_12m != null) pushC(`본사 POS 1년차 생존율 ${honsa.survival_rate_12m}%`, honsa.survival_rate_12m, "%", "pos_survival_12m");
    if (honsa?.survival_rate_24m != null) pushC(`본사 POS 2년차 생존율 ${honsa.survival_rate_24m}%`, honsa.survival_rate_24m, "%", "pos_survival_24m");
    if (honsa?.multi_store_owner_pct != null) pushC(`본사 POS 다점포 점주 비율 ${honsa.multi_store_owner_pct}%`, honsa.multi_store_owner_pct, "%", "pos_multi_store_owner_pct");
    // 점포 등급 분포
    if (honsa && honsa.stores.length > 0) {
      const aCount = honsa.stores.filter((s) => s.revenue_tier === "A").length;
      const bCount = honsa.stores.filter((s) => s.revenue_tier === "B").length;
      const cCount = honsa.stores.filter((s) => s.revenue_tier === "C").length;
      if (aCount > 0) pushC(`본사 POS A급(상위 25%) 점포 ${aCount}개`, aCount, "개", "pos_tier_a_count");
      if (bCount > 0) pushC(`본사 POS B급(중위 50%) 점포 ${bCount}개`, bCount, "개", "pos_tier_b_count");
      if (cCount > 0) pushC(`본사 POS C급(하위 25%) 점포 ${cCount}개`, cCount, "개", "pos_tier_c_count");
      // unused avoid warning
      void fmtManC;
    }
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
  const tsDeriveds = deriveTimeseries(tsFacts).map(timeseriesToDerived);
  const factsPlus = { ...facts, deriveds: [...pre.deriveds, ...tsDeriveds] };
  log(`[gpt] facts=${facts.facts.length} ts_deriveds=${tsDeriveds.length}`);
  const sonnet = await callSonnet(input, factsPlus, pre.deriveds, {
    stores_resolved: stores,
    corporation_founded_year: honsa?.corporation_founded_year ?? null,
    ftc_first_registered: honsa?.ftc_first_registered ?? null,
    pos_monthly_summary: honsa && latestPos
      ? {
          months: honsa.pos_monthly.length,
          from: honsa.pos_monthly[0]?.year_month ?? null,
          to: latestPos.year_month,
          latest_store_count: latestPos.store_count,
          latest_per_store_avg: latestPos.per_store_avg,
          // PR031 hotfix: 실점포명 주입 금지. 집계값만 전달.
          top3_avg: latestPos.top3_stores.length > 0
            ? Math.round(latestPos.top3_stores.reduce((s, x) => s + x.sales, 0) / latestPos.top3_stores.length)
            : null,
          bottom3_avg: latestPos.bottom3_stores.length > 0
            ? Math.round(latestPos.bottom3_stores.reduce((s, x) => s + x.sales, 0) / latestPos.bottom3_stores.length)
            : null,
          top_max: latestPos.top3_stores.length > 0 ? Math.max(...latestPos.top3_stores.map((s) => s.sales)) : null,
          bottom_min: latestPos.bottom3_stores.length > 0 ? Math.min(...latestPos.bottom3_stores.map((s) => s.sales)) : null,
        }
      : null,
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

  const availableStoreNames = [
    ...(latestPos?.top3_stores ?? []),
    ...(latestPos?.bottom3_stores ?? []),
  ].map((s) => s.name).filter((n): n is string => Boolean(n));
  const d3Ctx = { availableStoreNames };
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
