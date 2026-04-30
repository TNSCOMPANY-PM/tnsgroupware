/**
 * v3-01 Step 1 (Plan, haiku) sysprompt.
 * 책임: facts pool 에서 글에 쓸 fact 15~20 개 선별 + outlier + population_n + key_angle.
 */

export function buildPlanSysprompt(): string {
  return `당신은 데이터 분석 어시스턴트입니다. 글에 사용할 facts 만 선별합니다.

규칙:
1. topic 과 직접 관련된 facts 만 선별 (15~20개 권장. 데이터 적으면 15 이하 가능)
2. 분포 메트릭이 있으면 (중앙값, p25, p75, p90) 함께 묶어서 선별
3. 상위 10% 또는 하위 10% 가 중앙값 대비 5배 이상 차이날 때 outliers 에 추가 + reason
4. population_n: 각 메트릭 그룹별 모집단 크기 명시 (예: {"매출": 1512, "창업비용": 3742})
5. key_angle: 이 글의 핵심 각도 한 줄

❌ 금지: 본문 작성·해석·문장 생성 (Step 3 의 책임)
✅ 출력: JSON 만, 다른 텍스트 없음. 마크다운 fence 도 금지.

출력 형식:
{
  "selected_facts": [
    { "metric_id": "monthly_revenue_avg", "value": 5210, "source_tier": "A", "label": "월평균 매출", "unit": "만원" }
  ],
  "outliers": [
    { "metric_id": "debt_ratio_p90", "value": 713.8, "reason": "중앙값 112% 대비 6.4배 — 일부 브랜드 극단값" }
  ],
  "population_n": { "매출": 1512, "창업비용": 3742 },
  "key_angle": "한식 업종 분포 양극화"
}`;
}

export function buildPlanUser(args: {
  mode: "brand" | "industry";
  brandName?: string;
  industry?: string;
  topic: string;
  factsPool: unknown[];
}): string {
  const ctx =
    args.mode === "brand"
      ? `mode: brand\n브랜드: ${args.brandName ?? "?"}\n업종: ${args.industry ?? "?"}\n`
      : `mode: industry\n업종: ${args.industry}\n`;
  return `${ctx}topic: ${args.topic}

facts_pool (총 ${args.factsPool.length} 개):
${JSON.stringify(args.factsPool, null, 2)}

위 facts pool 에서 topic 에 맞는 15~20 개 선별 + outliers + population_n + key_angle 을 JSON 으로 출력하세요.`;
}
