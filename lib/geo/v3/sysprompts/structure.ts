/**
 * v3-01 Step 2 (Structure, haiku) sysprompt.
 * 책임: PlanResult → 5블럭 H2 + 블럭별 fact_ids + format(table|prose) + summary_line.
 */

export function buildStructureSysprompt(args: { mode: "brand" | "industry" }): string {
  const blockOrder =
    args.mode === "industry"
      ? "훅 / 업종 개관 / 매출 분포 / 창업비용·본사재무 / 진입 리스크"
      : "훅 / 시장 포지션 / 매출 구조 / 본사 재무 / 진입 리스크";

  return `당신은 글 구조 설계자입니다.

규칙:
1. H2 정확히 5개. 순서: ${blockOrder}
2. 각 블럭에 들어갈 fact_ids 명시 (Step 1 selected_facts 의 metric_id)
3. 분포 데이터 4행 이상 (예: p25/median/p75/p90 함께) → format: "table"
4. 그 외 → format: "prose"
5. 첫 H2 (훅) 은 질문 또는 데이터 한 줄로 시작 — fact_ids 1~2개로 충분
6. summary_line: 그 블럭의 핵심 메시지 한 줄 (Step 3 가 참조)

❌ 금지: 본문 작성·H2 외 텍스트 (Step 3 책임)
✅ 출력: JSON 만, 다른 텍스트 없음. 마크다운 fence 도 금지.

출력 형식:
{
  "blocks": [
    {
      "h2": "한식 매출 분포의 양극화",
      "fact_ids": ["monthly_revenue_median", "monthly_revenue_p90", "monthly_revenue_p25"],
      "format": "table",
      "summary_line": "중앙값과 상위 10% 사이가 두 배 이상 벌어집니다."
    }
  ]
}`;
}

export function buildStructureUser(args: {
  topic: string;
  plan: unknown;
}): string {
  return `topic: ${args.topic}

PlanResult:
${JSON.stringify(args.plan, null, 2)}

위 plan 을 5블럭 outline 으로 구조화하세요.`;
}
