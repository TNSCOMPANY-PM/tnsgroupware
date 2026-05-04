/**
 * v4-10 LLM1 (sonnet) — selected_metrics + key_angle 만 출력 (단순화).
 *
 * Haiku 의 큰 JSON output (~6,000 token) 만성 parse 실패 → Sonnet 으로 모델 변경.
 * display 변환 / distribution 묶음 / brand_position 자연어 → 코드 후처리 (build_a_facts.ts).
 * LLM 은 자연어 판단만 (토픽 매칭 + key_angle).
 */
import { buildFtcColumnCatalog } from "../ftc_column_catalog";

export function buildLlm1Sysprompt(): string {
  return `당신은 ftc_brands_2024 (152 컬럼) 에서 사용자 토픽에 필요한 컬럼만 선별합니다.

# ★ 절대 룰 (top priority)
1. **valid JSON 만 출력** — JSON 외 어떤 텍스트도 금지 (마크다운 fence / 설명 / 후기 X)
2. **property name double-quoted**
3. **trailing comma 금지**

# 출력 형식 (JSON 만)

{
  "selected_metrics": ["metric_id1", "metric_id2", ...],
  "key_angle": "한 줄 핵심 각도"
}

# 규칙
- selected_metrics: 토픽 유관 metric_id 15~30개 string array (ftc_column_catalog 기준)
- key_angle: 본문 작성 시 강조할 핵심 각도 한 줄
- display 변환·distribution 묶음·brand_position 자연어 → **출력 X** (코드에서 후처리)

# ftc_column_catalog
${buildFtcColumnCatalog()}

❌ 금지: fact_groups·display·raw_value·distribution·population_info 등 출력 / 본문 작성
✅ 출력: { selected_metrics, key_angle } JSON 만`;
}

export function buildLlm1User(args: {
  brand_label: string;
  industry: string;
  industry_sub: string | null;
  topic: string;
  ftc_brand_id: string;
  ftc_row?: Record<string, unknown>; // v4-10: 사용 안 함 (호환 용)
  industry_facts?: Array<Record<string, unknown>>; // v4-10: 사용 안 함 (호환 용)
}): string {
  const { brand_label, industry, industry_sub, topic } = args;
  return `# 컨텍스트
- brand_label: ${brand_label}
- industry: ${industry}${industry_sub ? ` / ${industry_sub}` : ""}
- topic: ${topic}

# 토픽 분석
위 topic 에 본문 작성 시 어떤 ftc_brands_2024 컬럼이 필요한지 selected_metrics 로 선별 (15~30개).
key_angle 한 줄로 핵심 각도 작성.

JSON 만 출력 — { "selected_metrics": [...], "key_angle": "..." }`;
}
