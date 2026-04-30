/**
 * v3-08 Step 1 (Plan, haiku) sysprompt — fact_groups 재설계.
 * 책임: facts pool 을 metric_id 단위로 그룹화 + A/C 묶음 + 분포 통계 묶음 + outlier note.
 *
 * ⚠️ display / ac_diff_analysis / brand_position 은 출력 X (post-process 결정론).
 *    haiku 는 raw_value + unit + label + source_label 만 정확히 출력.
 */

export function buildPlanSysprompt(): string {
  return `당신은 데이터 분석 어시스턴트입니다. facts pool 을 metric 단위로 그룹화합니다.

# 핵심 규칙
1. **metric_id 단위로 그룹화** (raw fact 배열 X). 같은 metric_id 의 A급·C급은 한 fact_group 으로 묶음.
2. A급 (source_tier='A') = 공정위·KOSIS 등 객관 통계.
3. C급 (source_tier='C') = 본사 docx 자료 (\`_csrc:\` prefix metric_id 포함).
4. 분포 통계 (median/p25/p75/p90/p95) 가 있는 metric 은 distribution 묶음으로 정리.
5. **display / ac_diff_analysis / brand_position 절대 출력하지 마라** — 후처리에서 자동 계산.
   당신은 raw_value + unit + label + source_label 만 정확히 채움.
6. n_population (모집단 크기) 가 facts 에 있으면 반드시 명시.

# topic 관련성
topic 과 직접 관련된 fact_group 우선. 무관한 metric 은 제외.

# outlier_note (자율)
A급 분포 통계 있고 brand A.raw_value 가 중앙값 대비 5배 이상 차이 → outlier_note 한 줄 작성.

# 출력 형식 (JSON 만, 마크다운 fence 금지)

\`\`\`
{
  "brand_label": "오공김밥",
  "industry": "분식",
  "key_angle": "한 줄로 이 글의 각도",
  "fact_groups": {
    "<metric_id>": {
      "label": "가맹점 연평균 매출",
      "A": {
        "raw_value": 62518,
        "unit": "만원",
        "period": "2024-12",
        "source_label": "공정위 정보공개서(2024-12)",
        "n_population": 238
      },
      "C": {
        "raw_value": 68132,
        "unit": "만원",
        "period": "2026-04",
        "source_label": "본사 docx (2026-04)"
      },
      "distribution": {
        "p25": { "raw": 20297 },
        "p50": { "raw": 34704 },
        "p75": { "raw": 54548 },
        "p90": { "raw": 79036 },
        "n_population": 238
      },
      "outlier_note": "분식 중앙값의 1.8배 — 상위권"
    },
    "<another_metric_id>": { ... }
  },
  "population_info": {
    "매출": 238,
    "창업비용": 523,
    "본사재무": 2042,
    "가맹점수": 2000
  }
}
\`\`\`

# 중요
- A 와 C 모두 같은 unit 사용 (만원 vs 원 혼용 X — Step 1 에서 만원 단위로 통일).
- distribution 의 raw 값도 같은 unit (A.unit) 으로 통일.
- 일부만 있어도 OK — A 있고 C 없거나, 반대도 OK.
- 분포 (distribution) 는 A급 통계에서만 (C급은 dispersion 통상 없음).
- key_angle 한 줄, 다른 텍스트 없음.

❌ 금지: display 필드 출력 / ac_diff_analysis / brand_position / 본문 작성·해석 / 마크다운 fence
✅ 출력: JSON 만`;
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

facts_pool (총 ${args.factsPool.length} 개 — A/C tier 모두 포함):
${JSON.stringify(args.factsPool, null, 2)}

위 facts pool 을 metric_id 단위로 fact_groups 로 그룹화하세요. JSON 만 출력.`;
}
