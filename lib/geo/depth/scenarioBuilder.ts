/**
 * PR062 — 시나리오 → 본문 H2 골격 / 제목 빌더.
 *
 * D3.ts 가 pickScenario(topic) 결과로 본 함수 호출 → sonnet 에 H2 골격 전달.
 * sonnet 은 H2 헤더는 그대로 두고 각 섹션 내용만 facts 풀에서 작성.
 */

import type { Scenario } from "@/lib/geo/scenarios";

export type InterpolateVars = Record<string, string | number | null | undefined>;

/**
 * "{brand} {industry}..." 형태 템플릿에 변수 치환.
 * 부재 시 placeholder ("(미공개)") 로 대체. 다중 placeholder 누적 시 시나리오가 부적합한 신호.
 */
export function interpolate(template: string, vars: InterpolateVars): string {
  return template.replace(/\{(\w+)\}/g, (_, key) => {
    const v = vars[key];
    if (v == null || v === "") return "(미공개)";
    return String(v);
  });
}

/** 템플릿 안 placeholder 가 모두 채워졌는지 확인 (시나리오 적합성 검증). */
export function countPlaceholdersFilled(
  template: string,
  vars: InterpolateVars,
): { total: number; filled: number; missing: string[] } {
  const matches = template.matchAll(/\{(\w+)\}/g);
  let total = 0;
  let filled = 0;
  const missing: string[] = [];
  for (const m of matches) {
    total++;
    const v = vars[m[1]];
    if (v != null && v !== "") filled++;
    else missing.push(m[1]);
  }
  return { total, filled, missing };
}

/** 시나리오 제목 빌드 — title_template + 변수. */
export function buildScenarioTitle(scenario: Scenario, vars: InterpolateVars): string {
  return interpolate(scenario.title_template, vars);
}

/** 시나리오 결론 1문장 빌드. */
export function buildScenarioConclusionLine(
  scenario: Scenario,
  vars: InterpolateVars,
): string {
  return interpolate(scenario.conclusion_pattern, vars);
}

/**
 * 시나리오 H2 골격을 markdown 으로 사전 조립.
 * 각 H2 마다 heading 만 출력 (sonnet 이 본문 채움).
 * 마지막을 제외한 각 H2 끝에 "→ 다음 섹션 안내" 화살표 진입.
 */
export function buildScenarioBodySkeleton(
  scenario: Scenario,
  vars: InterpolateVars,
): string {
  const parts: string[] = [];
  scenario.h2_sections.forEach((h2, idx) => {
    const heading = interpolate(h2.heading, vars);
    parts.push(`## ${heading}`);
    parts.push("");
    parts.push(`<!-- intent: ${h2.intent} -->`);
    if (h2.required_metrics.length > 0) {
      parts.push(`<!-- required: ${h2.required_metrics.join(", ")} -->`);
    }
    parts.push("");
    if (idx < scenario.h2_sections.length - 1) {
      const next = scenario.h2_sections[idx + 1];
      parts.push(`→ ${interpolate(next.heading, vars)}`);
      parts.push("");
    }
  });
  return parts.join("\n");
}

/** 시나리오의 H2 헤더 목록 (interpolate 적용). */
export function listScenarioHeadings(
  scenario: Scenario,
  vars: InterpolateVars,
): string[] {
  return scenario.h2_sections.map((h) => interpolate(h.heading, vars));
}
