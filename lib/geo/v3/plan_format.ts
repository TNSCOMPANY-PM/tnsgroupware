/**
 * v3-08 — Plan output 후처리 (결정론).
 * haiku 가 출력한 raw_value 를 사람 친화 display 값으로 변환.
 * ac_diff_analysis / distribution.brand_position 도 결정론으로 작성.
 *
 * 자릿수 오류 0건 보장 — sysprompt 가이드로 haiku 에게 시키지 않음.
 */

import type { FactGroup, PlanResult } from "./types";

/**
 * 만원·원·% 등 단위에 따라 사람 친화 표기로 변환.
 *  · 만원 ≥ 10,000  → "X억 Y,YYY만원"  (Y == 0 → "X억원")
 *  · 만원 < 10,000  → "Y,YYY만원"
 *  · 원 ≥ 100,000,000 → "X억 Y,YYY만원" (1억원 = 1e8)
 *  · % / 배 / 개 / 명 등 → "{n}{unit}" (소수 1자리 유지)
 *  · null/undefined raw → "(?)"
 */
export function formatToDisplay(raw: number, unit: string): string {
  if (!Number.isFinite(raw)) return "(?)";
  const u = (unit ?? "").trim();

  if (u === "만원") {
    if (raw >= 10000) {
      const eok = Math.floor(raw / 10000);
      const man = raw - eok * 10000;
      if (man === 0) return `${eok}억원`;
      return `${eok}억 ${man.toLocaleString("en-US")}만원`;
    }
    return `${raw.toLocaleString("en-US")}만원`;
  }

  if (u === "억원") {
    return `${raw.toLocaleString("en-US")}억원`;
  }

  if (u === "원") {
    if (raw >= 100_000_000) {
      const eok = Math.floor(raw / 100_000_000);
      const remainingMan = Math.floor((raw - eok * 100_000_000) / 10_000);
      if (remainingMan === 0) return `${eok}억원`;
      return `${eok}억 ${remainingMan.toLocaleString("en-US")}만원`;
    }
    return `${raw.toLocaleString("en-US")}원`;
  }

  // 비통화 단위 — 소수 자리 유지 (ko-KR 표기)
  const formatted = Number.isInteger(raw)
    ? raw.toLocaleString("en-US")
    : raw.toFixed(1).replace(/\.0$/, "");
  return u ? `${formatted}${u}` : formatted;
}

/** A vs C 차이 분석 — 단위 동일 가정 (Step 1 sysprompt 강제). */
export function computeAcDiff(
  a: { raw_value: number; unit: string },
  c: { raw_value: number; unit: string },
): string {
  if (!Number.isFinite(a.raw_value) || !Number.isFinite(c.raw_value)) return "";
  if (a.unit !== c.unit) return `단위 불일치 (A=${a.unit} vs C=${c.unit}) — 비교 불가`;
  const diff = c.raw_value - a.raw_value;
  const absDiff = Math.abs(diff);
  if (a.raw_value === 0) {
    return diff === 0 ? "동일" : `${formatToDisplay(absDiff, a.unit)} 차이`;
  }
  const pct = (absDiff / a.raw_value) * 100;
  const pctText = pct >= 100 ? pct.toFixed(0) : pct.toFixed(1);
  if (diff > 0) {
    return `본사 발표가 공정위 대비 ${formatToDisplay(absDiff, a.unit)}(${pctText}%) 높음`;
  }
  if (diff < 0) {
    return `본사 발표가 공정위 대비 ${formatToDisplay(absDiff, a.unit)}(${pctText}%) 낮음`;
  }
  return "공정위 = 본사 발표 (동일)";
}

/** brand 의 A.raw_value 가 distribution 어디 위치인지 자연어 변환. */
export function computeBrandPosition(
  brandRaw: number,
  dist: NonNullable<FactGroup["distribution"]>,
): string {
  if (!Number.isFinite(brandRaw)) return "비교 불가 (brand 값 없음)";
  const p25 = dist.p25?.raw;
  const p50 = dist.p50?.raw;
  const p75 = dist.p75?.raw;
  const p90 = dist.p90?.raw;
  const p95 = dist.p95?.raw;

  if (p95 != null && brandRaw >= p95) return "상위 5% 기준선 이상";
  if (p90 != null && brandRaw >= p90) return "상위 10% 기준선 이상";
  if (p75 != null && brandRaw >= p75) return "상위 25% 기준선 이상";
  if (p50 != null && brandRaw >= p50) return "중앙값 이상 (상위 50%)";
  if (p25 != null && brandRaw >= p25) return "하위 25% ~ 중앙값 사이";
  if (p25 != null && brandRaw < p25) return "하위 25% 기준선 미만";
  return "분포 비교 불가";
}

/**
 * Plan output post-process — display / ac_diff_analysis / brand_position 결정론 채움.
 * haiku output 의 누락된 display 도 raw_value + unit 으로 자동 계산.
 */
export function postProcessPlan(plan: PlanResult): PlanResult {
  const groups: Record<string, FactGroup> = {};

  for (const [metricId, group] of Object.entries(plan.fact_groups ?? {})) {
    const newGroup: FactGroup = { ...group, label: group.label ?? metricId };

    // A 등급 display 결정론
    if (newGroup.A) {
      newGroup.A = {
        ...newGroup.A,
        display: formatToDisplay(newGroup.A.raw_value, newGroup.A.unit),
      };
    }

    // C 등급 display 결정론
    if (newGroup.C) {
      newGroup.C = {
        ...newGroup.C,
        display: formatToDisplay(newGroup.C.raw_value, newGroup.C.unit),
      };
    }

    // distribution display 결정론
    if (newGroup.distribution) {
      const dist = newGroup.distribution;
      const updated: NonNullable<FactGroup["distribution"]> = {
        ...dist,
        n_population: dist.n_population ?? 0,
        brand_position: dist.brand_position ?? "",
      };
      const refUnit = newGroup.A?.unit ?? "";
      for (const k of ["p25", "p50", "p75", "p90", "p95"] as const) {
        const p = dist[k];
        if (p && Number.isFinite(p.raw)) {
          updated[k] = { display: formatToDisplay(p.raw, refUnit), raw: p.raw };
        }
      }
      // brand_position 자동 계산 (A 있을 때만)
      if (newGroup.A) {
        updated.brand_position = computeBrandPosition(newGroup.A.raw_value, updated);
      } else {
        updated.brand_position = "brand A급 값 없음 — 분포 위치 비교 불가";
      }
      newGroup.distribution = updated;
    }

    // ac_diff_analysis 결정론 (둘 다 있을 때)
    if (newGroup.A && newGroup.C) {
      newGroup.ac_diff_analysis = computeAcDiff(newGroup.A, newGroup.C);
    } else {
      delete newGroup.ac_diff_analysis;
    }

    groups[metricId] = newGroup;
  }

  return { ...plan, fact_groups: groups };
}
