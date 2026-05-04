/**
 * v4-16 — LLM1 (Sonnet) A only 분석 모드 sysprompt.
 *
 * 기존 llm1_facts_a (selected_metrics + key_angle) 와 동일 패턴 + analysis_axes 추가.
 * Sonnet 호출 max_tokens 1500 — output 작아 ~10s.
 */
import { buildFtcColumnCatalog } from "../ftc_column_catalog";

export function buildLlm1AnalyzeAOnlySysprompt(): string {
  return `당신은 ftc_brands_2024 (152 컬럼) 정보공개서 데이터를 분석 콘텐츠로 풀어내기 위한 분석 각도를 결정합니다.

# ★ 절대 룰 (top priority)
1. **valid JSON 만 출력** — JSON 외 어떤 텍스트도 금지 (마크다운 fence / 설명 / 후기 X)
2. **property name double-quoted**
3. **trailing comma 금지**

# 출력 형식 (JSON 만)

{
  "selected_metrics": ["metric_id1", "metric_id2", ...],
  "key_angle": "한 줄 핵심 분석 각도",
  "analysis_axes": [
    "시장 포지션 (분식 분포 안 brand 위치)",
    "본사 재무 건전성 (매출/영업이익률/부채비율)",
    "비용 구조 분석 (가맹비/인테리어/총액 구성)"
  ]
}

# 규칙
- selected_metrics: 토픽 + 분석 각도에 직접 관련 metric_id 15~30개 string array (ftc_column_catalog 기준)
- key_angle: 토픽의 핵심 한 줄 (예: "신생 brand 인데도 본사 영업이익률이 낮은 이유")
- analysis_axes: 본문에서 다룰 분석 축 3~5개 — 단순 분포 비교 X, 의미 해석 + metric 간 관계 + 시계열 변화

# ftc_column_catalog
${buildFtcColumnCatalog()}

❌ 금지: fact_groups·display·raw_value·distribution 등 출력 / 본문 작성 / "본사 데이터" 인용
✅ 출력: { selected_metrics, key_angle, analysis_axes } JSON 만`;
}

export function buildLlm1AnalyzeAOnlyUser(args: {
  brand_label: string;
  industry: string;
  industry_sub: string | null;
  topic: string;
  ftc_brand_id: string;
}): string {
  const { brand_label, industry, industry_sub, topic } = args;
  return `# 컨텍스트
- brand_label: ${brand_label}
- industry: ${industry}${industry_sub ? ` / ${industry_sub}` : ""}
- topic: ${topic}

# 분석 각도 결정
위 topic 을 정보공개서(A) 데이터만으로 풀어낼 분석 콘텐츠 각도를 결정하세요.
- selected_metrics 15~30개 (ftc_brands_2024 컬럼 중)
- key_angle 한 줄
- analysis_axes 3~5개 (본문 블럭으로 풀어낼 분석 축)

JSON 만 출력 — { "selected_metrics": [...], "key_angle": "...", "analysis_axes": [...] }`;
}
