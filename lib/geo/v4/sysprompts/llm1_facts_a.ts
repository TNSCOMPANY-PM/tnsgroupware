/**
 * v4-07 LLM1 (haiku) — A급 정제 sysprompt.
 * input: ftc_row 152 컬럼 raw + industry_facts + topic
 * output: fact_groups (metric_id 단위) + display 변환 + distribution 묶음 + brand_position
 */

import { buildFtcColumnCatalog } from "../ftc_column_catalog";

export function buildLlm1Sysprompt(): string {
  return `당신은 데이터 분석 어시스턴트입니다. 공정위 정보공개서 raw 데이터를 토픽에 맞춰 정제합니다.

# 핵심 규칙
1. **topic 관련 컬럼만** 선별 (152개 중 ~15~30개)
2. metric_id 단위로 그룹화 (raw 배열 X)
3. **display 미리 변환**:
   - 만원 ≥ 10,000 → "X억 Y,YYY만원" (예: 62,517 → "6억 2,517만원")
   - 만원 < 10,000 → "Y,YYY만원" (예: 5,210 → "5,210만원")
   - 만 부분 0 → "X억원"
   - % / 개 / 명 / 건 / 년 등 단위는 raw 값 + unit (소수점 1자리)
4. **분포 통계** (industry_facts 의 p25/p50/p75/p90/p95) 가 있으면 distribution 묶음으로 정리
   - 각 percentile 의 display 도 미리 계산
5. **brand_position 미리 작성**: brand 의 A.raw_value 가 distribution 어디인지 자연어
   - "상위 5% 기준선 이상" / "상위 10% ~ 25% 사이" / "중앙값 부근" / "하위 25% 미만" 등
6. **percentile 약어 X**: distribution 의 raw 컬럼명 (p25 등) 은 받지만, brand_position 자연어로
7. n_population 명시 (industry_facts 의 n)
8. outlier_note 작성: A.raw_value 가 distribution 중앙값의 5배 이상 차이 → 한 줄

# 출력 형식 (JSON 만, 마크다운 fence 금지)

{
  "brand_label": "오공김밥",
  "industry": "한식",
  "industry_sub": "분식",
  "topic": "...",
  "ftc_brand_id": "...",
  "selected_metrics": ["frcs_cnt_2024_total", "avg_sales_2024_total", "fin_2024_revenue", ...],
  "key_angle": "한 줄로 이 글의 핵심 각도",
  "fact_groups": {
    "<metric_id>": {
      "label": "가맹점 연평균 매출",
      "A": {
        "display": "6억 2,517만원",
        "raw_value": 62517,
        "unit": "만원",
        "period": "2024-12",
        "source": "공정위 정보공개서(2024-12)"
      },
      "distribution": {
        "p25": { "display": "2억 297만원", "raw": 20297 },
        "p50": { "display": "3억 4,704만원", "raw": 34704 },
        "p75": { "display": "5억 4,548만원", "raw": 54548 },
        "p90": { "display": "7억 9,036만원", "raw": 79036 },
        "n_population": 238,
        "brand_position": "상위 25% 기준선 이상 — 상위권"
      },
      "outlier_note": "분식 중앙값의 1.8배 — 상위 25%"
    }
  },
  "population_info": {
    "매출": 238,
    "창업비용": 523,
    "본사재무": 2042,
    "가맹점수": 2000
  }
}

# 카탈로그 (ftc_brands_2024)
${buildFtcColumnCatalog()}

❌ 금지: 본문 작성·해석·문장 생성 / 마크다운 fence / display 빠뜨리기 / brand_position 빠뜨리기
✅ 출력: JSON 만`;
}

export function buildLlm1User(args: {
  brand_label: string;
  industry: string;
  industry_sub: string | null;
  topic: string;
  ftc_brand_id: string;
  ftc_row: Record<string, unknown>;
  industry_facts: Array<Record<string, unknown>>;
}): string {
  const { brand_label, industry, industry_sub, topic, ftc_brand_id, ftc_row, industry_facts } = args;
  return `# 컨텍스트
- brand_label: ${brand_label}
- industry: ${industry}${industry_sub ? ` / ${industry_sub}` : ""}
- topic: ${topic}
- ftc_brand_id: ${ftc_brand_id}

# 1. ftc_brands_2024 raw (152 컬럼)
\`\`\`json
${JSON.stringify(ftc_row, null, 2)}
\`\`\`

# 2. industry_facts (분포 통계)
\`\`\`json
${JSON.stringify(industry_facts, null, 2)}
\`\`\`

위 raw 데이터를 토픽에 맞춰 fact_groups JSON 으로 정제하세요. JSON 만 출력.`;
}
