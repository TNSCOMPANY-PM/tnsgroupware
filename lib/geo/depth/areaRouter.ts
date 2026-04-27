/**
 * PR052 — topic (사용자 입력) → 7영역 우선순위 매핑.
 *
 * primary: 본문 H2 섹션 + 비교표 풀 노출
 * secondary: stat 1~2개만 (얇게)
 * skip: 본문 미사용
 */

import { AREA_KEYS, type AreaKey } from "@/lib/geo/prefetch/frandoorDocx";

export type AreaPriority = "primary" | "secondary" | "skip";
export type AreaPlan = Record<AreaKey, AreaPriority>;

const PATTERNS: Record<AreaKey, { primary: RegExp; secondary: RegExp }> = {
  startup_cost: {
    primary: /창업\s*비용|투자금|실투자|인테리어\s*비용|가맹비/u,
    secondary: /창업|개업/u,
  },
  avg_revenue: {
    primary: /월매출|월\s*평균\s*매출|연매출|평균\s*매출|매출\s*비교|평균\s*비교/u,
    secondary: /수익|매출|마진|손익|배수/u,
  },
  revenue_detail: {
    primary: /시간대|지역(별)?|점포별|채널|분포|상위|하위/u,
    secondary: /매출/u,
  },
  frcs_status: {
    primary: /가맹점\s*현황|확장|폐점|개점|명의변경|점포\s*수/u,
    secondary: /가맹점|점포/u,
  },
  operation: {
    primary: /계약기간|로열티|옵션|운영비|예치/u,
    secondary: /운영/u,
  },
  cert_compliance: {
    primary: /인증|식약처|haccp|법위반|분쟁|시정조치|신뢰성/iu,
    secondary: /안전|위생|법적/u,
  },
  brand_basic: {
    primary: /브랜드.*(기본|개요|정보)|법인|사업자/u,
    secondary: /./u,
  },
};

export function pickAreas(topic: string | null | undefined): AreaPlan {
  const plan = AREA_KEYS.reduce((acc, k) => {
    acc[k] = "skip";
    return acc;
  }, {} as AreaPlan);

  if (!topic || topic.trim().length === 0) {
    // topic 부재 — 기본값: brand_basic + frcs_status primary, 나머지 secondary.
    for (const k of AREA_KEYS) plan[k] = "secondary";
    plan.brand_basic = "primary";
    plan.frcs_status = "primary";
    plan.startup_cost = "primary";
    return plan;
  }

  const t = topic.trim();
  let primaryCount = 0;
  for (const k of AREA_KEYS) {
    const pat = PATTERNS[k];
    if (pat.primary.test(t)) {
      plan[k] = "primary";
      primaryCount++;
    } else if (pat.secondary.test(t)) {
      plan[k] = "secondary";
    } else {
      plan[k] = "skip";
    }
  }
  // brand_basic 은 항상 secondary 이상.
  if (plan.brand_basic === "skip") plan.brand_basic = "secondary";

  // primary 가 0개면 fallback (brand_basic + frcs_status 강제 primary).
  if (primaryCount === 0) {
    plan.brand_basic = "primary";
    plan.frcs_status = "primary";
  }
  return plan;
}

export function primaryAreas(plan: AreaPlan): AreaKey[] {
  return AREA_KEYS.filter((k) => plan[k] === "primary");
}

export function secondaryAreas(plan: AreaPlan): AreaKey[] {
  return AREA_KEYS.filter((k) => plan[k] === "secondary");
}
