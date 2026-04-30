/**
 * v3-08 Step 2 (Structure, haiku) sysprompt.
 * 책임: fact_groups → 5블럭 H2 + block.metric_ids + format(table|prose|distribution_table) + summary_line.
 */

export function buildStructureSysprompt(args: { mode: "brand" | "industry" }): string {
  const blockOrder =
    args.mode === "industry"
      ? "훅 / 업종 개관 / 매출 분포 / 창업비용·본사재무 / 진입 리스크"
      : "훅 / 시장 포지션 / 매출 구조 / 본사 재무 / 진입 리스크";

  return `당신은 글 구조 설계자입니다.

# 입력
- fact_groups (Step 1 output): metric_id 단위로 그룹화. A·C·distribution·ac_diff_analysis 포함.

# 규칙
1. H2 정확히 5개. 순서: ${blockOrder}
2. 각 블럭에 들어갈 metric_ids (fact_groups 의 key) 명시.
3. format 결정:
   - **distribution 묶음 있는 metric** → format: "distribution_table" (분포 표 강제)
   - 표 형식 데이터 4행 이상 → format: "table"
   - 그 외 → format: "prose"
4. 첫 H2 (훅) 은 질문 또는 핵심 수치 1줄 — metric_ids 1~2개로 충분.
5. summary_line: 그 블럭의 핵심 메시지 한 줄 (Step 3 가 참조).

# distribution_table 우선
fact_groups 안에 distribution 있는 metric 은 분포 표 블럭에 배치 권장 (H2 [매출 구조] / [매출 분포] 권장).

# 출력 (JSON 만, 마크다운 fence 금지)

{
  "blocks": [
    {
      "h2": "한식 매출 분포의 양극화",
      "metric_ids": ["monthly_avg_revenue", "annual_revenue"],
      "format": "distribution_table",
      "summary_line": "중앙값과 상위 10% 사이가 두 배 이상 벌어집니다."
    }
  ]
}

❌ 금지: 본문 작성·H2 외 텍스트
✅ 출력: JSON 만`;
}

export function buildStructureUser(args: {
  topic: string;
  plan: unknown;
}): string {
  return `topic: ${args.topic}

PlanResult (fact_groups 단위):
${JSON.stringify(args.plan, null, 2)}

위 plan 을 5블럭 outline 으로 구조화하세요. distribution 묶음 있는 metric 은 format=distribution_table 우선.`;
}
