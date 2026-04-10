# BLOG_GENERATE_HOTFIX_SPEC

> promptBuilder.ts + blog-generate/route.ts 긴급 수정 스펙
> 대상 파일:
> - `utils/promptBuilder.ts`
> - `app/api/geo/blog-generate/route.ts`

---

## 0. 치명적 버그 — 파일 잘림 복구

### 0-1. promptBuilder.ts (현재 388줄에서 잘림)

- `buildPrompt()` 함수의 "단독 분석" topicDirective 문자열이 중간에 끊김
- 함수 닫기(return문 + 중괄호) 누락
- `buildBrandDataFromFacts()` 함수가 존재하지 않음 — route.ts에서 import하지만 undefined
- export 문 누락 (buildPrompt, buildBrandDataFromFacts, BrandData 등)

**수정:**
```typescript
// "단독 분석" 분기 완성
} else {
  topicDirective = `
[TOPIC TYPE: 단독 분석]
이 주제는 브랜드 단독 분석 글입니다. 표준 구조(answer-box → 본론 → FAQ → 결론)를 따르되,
DATA 블록의 수치를 중심으로 해당 주제에 맞는 깊이 있는 분석을 작성합니다.`;
    }
  }

  // (2) 교차검증 지시 (아래 섹션 3 참조)
  const crossCheckDirective = buildCrossCheckDirective(data);

  // 프롬프트 조립
  const parts = [
    CHANNEL[channel](data),
    SOURCE_PRIORITY,
    READER_STAGE[readerStage],
    SEARCH_INTENT[searchIntent],
    ENGAGEMENT_FLOW_BY_CHANNEL[channel] ?? ENGAGEMENT_FLOW,
    topicDirective,
    crossCheckDirective,
    topic ? `\n[글 주제] ${topic}` : "",
    JSON_OUTPUT,
  ];

  return parts.join("\n\n");
}
```

### 0-2. buildBrandDataFromFacts() 구현

```typescript
export function buildBrandDataFromFacts(
  brandName: string,
  facts: FactKeyword[],
  landingUrl?: string
): BrandData {
  const get = (label: string): string | undefined =>
    facts.find(f => f.label === label)?.keyword;
  const getNum = (label: string): number | undefined => {
    const v = get(label);
    if (!v) return undefined;
    const n = parseFloat(v.replace(/[^0-9.]/g, ""));
    return isNaN(n) ? undefined : n;
  };

  return {
    brand: {
      name: brandName,
      name_en: get("brand_name_en"),
      slug: landingUrl,
      since: get("since"),
      contact: get("contact") ?? landingUrl,
    },
    stores: { total: getNum("stores_total") },
    cost: {
      total: getNum("cost_total"),
      franchise_fee: getNum("franchise_fee"),
      education_fee: getNum("education_fee"),
      deposit: getNum("deposit"),
      loan: {
        bank_1st: getNum("loan_bank_1st"),
        interest_free: getNum("loan_interest_free"),
      },
      actual_investment: getNum("actual_investment"),
    },
    revenue: {
      avg_monthly_min: getNum("revenue_monthly_min"),
      avg_monthly_max: getNum("revenue_monthly_max"),
      net_margin: getNum("net_margin"),
      payback_months: getNum("payback_months"),
    },
    operation: {
      min_staff: getNum("min_staff"),
      recommended_staff: getNum("recommended_staff"),
      min_pyeong: getNum("min_pyeong"),
      max_pyeong: getNum("max_pyeong"),
      automation: get("automation")?.split(",").map(s => s.trim()) ?? [],
    },
    awards: get("awards")?.split(",").map(s => s.trim()) ?? [],
    disclaimer: get("disclaimer") ?? "본 정보는 본사 제공 자료 기준이며, 실제 조건은 상이할 수 있습니다.",
    rawFacts: facts.map(f => `${f.label}: ${f.keyword}`).join("\n"),
  };
}
```

### 0-3. blog-generate/route.ts (현재 113줄에서 잘림)

프롬프트 빌드 이후 부분이 전부 누락:
- refAnalysis 결합
- provider 분기 (claude/openai)
- AI 응답에서 JSON 파싱 (```json 코드블록 strip)
- 에러 핸들링
- NextResponse.json() 반환

**수정:** route.ts 뒷부분 완성 (아래 섹션 1의 2단계 파이프라인 구조 반영)

---

## 1. 2단계 파이프라인 — GPT 웹검색 → Claude 글쓰기

### 문제
현재 SOURCE_PRIORITY에서 "웹 검색으로 공정위·통계청 최신 데이터를 반드시 확인하고 인용할 것"이라고 지시하지만, Claude API에는 웹검색 기능이 없음. Claude가 공정위 수치를 할루시네이션하는 구조.

### 해결: blog-generate API를 2단계로 변경

```
[1단계] GPT (web_search_preview)
  → "공정위 정보공개서 {브랜드명}" 검색
  → 공식 수치 JSON 추출 (가맹점수, 평균매출, 창업비용, 가맹금, 교육비, 보증금 등)
  → 검색 결과에서 연도 정보도 함께 추출

[2단계] Claude (글 작성)
  → DATA 블록에 두 세트 주입:
    - [공정위 공시 데이터 (20XX년 기준)] ← 1단계 GPT 결과
    - [본사 팩트데이터 (최신)] ← Supabase fact_data
  → "DATA 블록에 없는 수치는 절대 사용 금지" 규칙 적용
```

### 1단계 GPT 호출 프롬프트

```typescript
async function fetchOfficialData(brandName: string): Promise<OfficialData> {
  const prompt = `"${brandName}" 프랜차이즈에 대해 아래 항목을 공정거래위원회 정보공개서, 
통계청, 한국프랜차이즈산업협회 공식 자료에서 검색하여 JSON으로 반환하세요.

찾을 수 없는 항목은 null로 표시. 수치를 지어내지 말 것.

{
  "source_year": "정보공개서 기준 연도",
  "stores_total": 가맹점 수(숫자),
  "avg_monthly_revenue": 가맹점 평균 매출(만원, 숫자),
  "cost_total": 창업 총비용(만원, 숫자),
  "franchise_fee": 가맹금(만원, 숫자),
  "education_fee": 교육비(만원, 숫자),
  "deposit": 보증금(만원, 숫자),
  "closure_rate": 폐점률(%),
  "industry_avg_revenue": 동일 업종 평균 매출(만원, 숫자),
  "industry_avg_cost": 동일 업종 평균 창업비용(만원, 숫자),
  "sources": ["실제 참조한 URL 또는 출처명"]
}

JSON만 출력.`;
  
  const raw = await callOpenAI(prompt, true); // web_search_preview 활성
  return parseJSON(raw);
}
```

### 2단계 DATA 블록 변경

```typescript
function buildDataBlock(data: BrandData, official?: OfficialData): string {
  const lines: string[] = [];
  
  // 본사 팩트데이터
  lines.push(`[본사 팩트데이터 — 최신 본사 제공 수치]`);
  lines.push(`브랜드명: ${data.brand.name}`);
  // ... 기존 팩트데이터 항목들 ...
  
  // 공정위 공시 데이터 (GPT 웹검색 결과)
  if (official) {
    lines.push("");
    lines.push(`[공정위 공시 데이터 (${official.source_year ?? "연도 미확인"} 기준)]`);
    if (official.stores_total) lines.push(`가맹점 수: ${official.stores_total}개`);
    if (official.avg_monthly_revenue) lines.push(`가맹점 평균 매출: ${official.avg_monthly_revenue}만원`);
    if (official.cost_total) lines.push(`창업 총비용: ${official.cost_total}만원`);
    if (official.closure_rate) lines.push(`폐점률: ${official.closure_rate}%`);
    if (official.industry_avg_revenue) lines.push(`동일업종 평균 매출: ${official.industry_avg_revenue}만원`);
    if (official.industry_avg_cost) lines.push(`동일업종 평균 창업비용: ${official.industry_avg_cost}만원`);
    if (official.sources?.length) lines.push(`출처: ${official.sources.join(", ")}`);
  }
  
  return lines.join("\n");
}
```

---

## 2. SOURCE_PRIORITY 현실화

### 기존 (삭제)
```
- 본문 수치의 70% 이상은 1순위 공식 자료에서 인용할 것
- 웹 검색으로 공정위·통계청 최신 데이터를 반드시 확인하고 인용할 것
```

### 변경
```
[자료 규칙 — 절대 준수]
1. DATA 블록에 있는 수치만 사용. DATA에 없는 수치는 절대 사용 금지. 추정·가정 금지.
2. [공정위 공시 데이터]와 [본사 팩트데이터] 두 블록이 있으면 반드시 교차 비교.
3. 수치마다 어느 블록 출처인지 명시: "(공정위 20XX 기준)", "(본사 발표 기준)"
4. 업계 평균, 타 브랜드 수치도 DATA 블록에 없으면 쓰지 말 것.
5. 수치를 지어내는 것보다 "DATA 없음"으로 해당 항목을 빼는 것이 낫다.
```

---

## 3. 교차검증 로직 — 성장/솔직함 자동 서술

### 프롬프트에 추가할 교차검증 지시 생성 함수

```typescript
function buildCrossCheckDirective(data: BrandData, official?: OfficialData): string {
  if (!official) return "";
  
  const diffs: string[] = [];
  
  // 가맹점 수 비교
  if (data.stores.total && official.stores_total && data.stores.total !== official.stores_total) {
    if (data.stores.total > official.stores_total) {
      diffs.push(`- 가맹점 수: 공정위 ${official.stores_total}개(${official.source_year}) → 현재 ${data.stores.total}개. ▲ 성장. "공정위 공시 기준 ${official.stores_total}개에서 현재 ${data.stores.total}개로 성장" 서술.`);
    } else {
      diffs.push(`- 가맹점 수: 공정위 ${official.stores_total}개(${official.source_year}) → 현재 ${data.stores.total}개. ▼ 감소. 사유 추정하지 말 것. 수치만 병기.`);
    }
  }
  
  // 매출 비교
  if (data.revenue.avg_monthly_min && official.avg_monthly_revenue) {
    const factAvg = data.revenue.avg_monthly_max 
      ? (data.revenue.avg_monthly_min + data.revenue.avg_monthly_max) / 2 
      : data.revenue.avg_monthly_min;
    if (factAvg > official.avg_monthly_revenue) {
      diffs.push(`- 평균 매출: 공정위 ${official.avg_monthly_revenue}만원 → 본사 발표 ${factAvg}만원. ▲ 상승. 성장 맥락으로 서술하되 "공정위 기준과 차이가 있으므로 직접 확인 권고" 부기.`);
    } else if (factAvg < official.avg_monthly_revenue) {
      diffs.push(`- 평균 매출: 공정위 ${official.avg_monthly_revenue}만원 → 본사 발표 ${factAvg}만원. ▼ 하락. "본사가 과장 없이 현실적 수치를 공개하고 있다", "보수적으로 운영 데이터를 공시하는 브랜드" 프레임으로 서술. 부정적 표현 금지.`);
    }
  }
  
  // 창업비용 비교
  if (data.cost.total && official.cost_total && data.cost.total !== official.cost_total) {
    if (data.cost.total > official.cost_total) {
      diffs.push(`- 창업비용: 공정위 ${official.cost_total}만원 → 현재 ${data.cost.total}만원. ▲ 상승. 물가 상승·인테리어 고급화 등 맥락 부여.`);
    } else {
      diffs.push(`- 창업비용: 공정위 ${official.cost_total}만원 → 현재 ${data.cost.total}만원. ▼ 하락. 본사 지원 확대·효율화 맥락.`);
    }
  }
  
  if (diffs.length === 0) return "";
  
  return `
[교차검증 — 공정위 vs 팩트데이터 불일치 항목. 아래 지시대로 서술할 것]
${diffs.join("\n")}

원칙:
- 팩트 > 공정위 (수치 상승): 성장·확장 서사로 서술
- 팩트 < 공정위 (수치 하락): "과장 없는 솔직한 공시", "현실적 데이터를 제공하는 브랜드" 프레임으로 서술. 절대 부정적으로 쓰지 말 것.
- 두 수치 모두 병기하고 출처·연도 명시
- 차이 사유를 추정하지 말 것 (데이터에 근거 없는 해석 금지)
`;
}
```

---

## 4. 비교 규칙 완화 — 경쟁 브랜드 실명 허용

### 기존 (삭제)
```
- 타 브랜드 실명 절대 금지. "업계 평균 대비" 또는 "A브랜드" 표현만
```

### 변경
```
[비교 규칙]
- 공정위 정보공개서에 공시된 브랜드는 실명 사용 가능 (공개 데이터)
- 단, 비방·비하·주관적 평가 금지. 수치 비교만 허용
- 비교 수치는 반드시 출처 명시 (공정위 정보공개서 20XX년)
- DATA 블록의 [공정위 공시 데이터]에 경쟁 브랜드 수치가 있을 때만 실명 비교
- DATA에 없는 브랜드는 "업계 평균" 또는 "A브랜드"로 표기
```

### GPT 1단계에서 경쟁 브랜드 데이터도 수집

비교형 글(topic에 "vs/비교" 포함)일 경우, 1단계 GPT 검색 시 경쟁 브랜드 데이터도 함께 수집:

```typescript
// 비교형 글이면 동일 업종 상위 브랜드 3~5개 데이터도 수집
if (/vs|비교|차이|경쟁/.test(topic)) {
  const competitorPrompt = `"${brandName}"과 동일 업종(분식/김밥 등) 프랜차이즈 중 
공정위 정보공개서에 공시된 상위 브랜드 3~5개의 아래 수치를 검색하여 JSON 배열로 반환:
[{
  "name": "브랜드명",
  "stores_total": 가맹점수,
  "avg_monthly_revenue": 평균매출(만원),
  "cost_total": 창업비용(만원),
  "source_year": "기준연도"
}]
JSON만 출력.`;
  official.competitors = await callOpenAI(competitorPrompt, true);
}
```

---

## 5. 채널별 ENGAGEMENT 규칙 분리

### 문제
현재 ENGAGEMENT_FLOW가 전체 공통인데, "이모지 금지"가 네이버 채널의 "이모지 2~3개 허용"과 충돌. "HTML strong/em 금지"가 frandoor의 "conclusion-box 내 strong 허용"과 충돌.

### 해결

```typescript
const ENGAGEMENT_FLOW_BASE = `
[ENGAGEMENT — 공통]
① 첫 문장부터 바로 본론. 서론 금지.
② 수사적 장치 금지. 사실만 쓰고 독자가 판단하게.
③ 각 섹션은 팩트 → 해석 1줄.
④ 표는 해석과 함께.
⑤ 마지막: 핵심 1문장 + 행동 유도 1문장.
⑥ 데이터 없는 항목은 아예 안 쓴다.
⑦ 금지: "함께 알아보겠습니다", "~해드리겠습니다", "상세히", "~라는 뜻이죠", "감이 옵니다", "~고민하신다면"
`;

const ENGAGEMENT_FLOW_BY_CHANNEL: Record<string, string> = {
  frandoor: ENGAGEMENT_FLOW_BASE + `
⑧ 마크다운 강조(**볼드**) 금지. HTML <strong>은 conclusion-box 안에서만 허용.
⑨ 이모지 금지.`,
  
  tistory: ENGAGEMENT_FLOW_BASE + `
⑧ 마크다운 강조 금지. HTML <strong>은 conclusion-box 안에서만 허용.
⑨ 이모지 금지.`,
  
  naver: ENGAGEMENT_FLOW_BASE + `
⑧ 마크다운 강조(**볼드**) 금지. 네이버 에디터에서 직접 굵게 처리하므로 텍스트만.
⑨ 이모지 최대 2~3개, 자연스러운 위치에만.`,
  
  medium: ENGAGEMENT_FLOW_BASE + `
⑧ Markdown bold/italic 허용.
⑨ No emoji.`,
};
```

---

## 6. 주제 키워드 기반 내용 분기 보강

현재 topicDirective에 비교/수익/후기/단독 분기가 있지만, 내용이 실제로 달라지지 않는 문제.

### 비교형 글 보강

```typescript
if (/vs|비교|차이|경쟁|대결/.test(t)) {
  topicDirective = `
[TOPIC TYPE: 비교 분석]
이 글의 핵심은 "비교"입니다. 반드시 아래를 지킬 것:

1. answer-box: "${data.brand.name} vs 경쟁 브랜드" 형태의 비교 결론. 단독 소개 금지.
   예: "오공김밥 실투자금 1,500만원. A브랜드 2,500만원, B브랜드 3,000만원 대비 40% 낮다."

2. 비교 테이블 필수 2개 이상:
   - 창업비용 항목별 비교 (가맹금/교육비/보증금/총비용)
   - 매출·수익 비교 (월매출/마진율/투자회수)
   [공정위 공시 데이터]에 경쟁 브랜드가 있으면 실명 사용.

3. FAQ도 비교형으로:
   - "OO이 XX보다 나은 점은?" / "창업비용이 가장 낮은 브랜드는?" 등

4. 단독 분석 내용은 비교 맥락 안에서만 언급. 독립 섹션으로 빼지 말 것.
`;
}
```

---

## 구현 순서

1. **promptBuilder.ts 파일 잘림 복구** — buildPrompt 완성, buildBrandDataFromFacts 구현, export 추가
2. **blog-generate/route.ts 잘림 복구** — 2단계 파이프라인 구조로 완성 (GPT 검색 → Claude 작성)
3. **SOURCE_PRIORITY 교체** — "웹검색하라" 삭제, "DATA 블록만 사용" 규칙으로
4. **교차검증 로직 추가** — buildCrossCheckDirective 함수 + 프롬프트 주입
5. **비교 규칙 완화** — 공정위 공시 브랜드 실명 허용 + GPT에서 경쟁사 데이터 수집
6. **ENGAGEMENT 채널별 분리** — 이모지/볼드 규칙 충돌 해소
7. **비교형 topicDirective 보강** — answer-box, 테이블, FAQ 모두 비교 관점 강제

---

## 참고: OfficialData 타입 정의

```typescript
type OfficialData = {
  source_year?: string;
  stores_total?: number;
  avg_monthly_revenue?: number;
  cost_total?: number;
  franchise_fee?: number;
  education_fee?: number;
  deposit?: number;
  closure_rate?: number;
  industry_avg_revenue?: number;
  industry_avg_cost?: number;
  sources?: string[];
  competitors?: {
    name: string;
    stores_total?: number;
    avg_monthly_revenue?: number;
    cost_total?: number;
    source_year?: string;
  }[];
};
```

---

## 8. UTM 파라미터 + GA4 AI 유입 채널 설정

### 8-1. UTM 자동 부여 (구현 완료)

conclusion-box의 CTA 링크에 채널별 UTM 자동 부여:
- `frandoor`: 원본 URL (UTM 없음)
- `tistory`: `?utm_source=tistory&utm_medium=blog`
- `naver`: `?utm_source=naver&utm_medium=blog`
- `medium`: `?utm_source=medium&utm_medium=blog`

### 8-2. GA4 AI 유입 채널 그룹 설정 (수동 작업 필요)

GA4 관리 > 데이터 스트림 > 채널 그룹에 아래 AI 검색엔진 유입을 별도 그룹으로 설정해야 함:

| 소스 (referrer) | 채널 그룹명 | 설명 |
|----------------|-----------|------|
| `chat.openai.com` | AI Search | ChatGPT 유입 |
| `perplexity.ai` | AI Search | Perplexity 유입 |
| `gemini.google.com` | AI Search | Gemini 유입 |
| `copilot.microsoft.com` | AI Search | Copilot 유입 |
| `claude.ai` | AI Search | Claude 유입 |
| `you.com` | AI Search | You.com 유입 |

설정 경로: GA4 > 관리 > 데이터 설정 > 채널 그룹 > 새 채널 그룹 "AI Search" 생성
→ 조건: 소스에 위 도메인 중 하나 포함

이 설정이 있어야 GEO 최적화 효과를 GA4에서 "AI Search" 채널로 분리 추적 가능.
