# 팩트 데이터 추출 로직 재설계 지시문 (2026-04-14)

> ⚠️ **이 문서는 `FACT_LOCKED_SOURCE_2026-04-14.md` 로 대체되었습니다.**
> docx 단일 소스 정책으로 전환하면서 본 문서의 label enum 확장 / 공정위 구조화 /
> 대용량 맵-리듀스 설계 대부분이 불필요해졌습니다.
> **구현 시 참고하지 말고 새 문서를 기준으로 하세요.**

## 현재 문제 진단

### 🔴 CORE-1: Label 불일치로 매핑 실패 (가장 큰 원인)

**현재 흐름**:
```
파일 업로드 → extract-facts API → GPT가 자유롭게 label 생성 → DB 저장
                                                            ↓
blog-generate → buildBrandDataFromFacts(factData)
               → get("평균 월매출", "월매출") 로 label 검색
               → GPT가 만든 label "월 평균 매출"과 안 맞음 → undefined
               → DATA 블록에서 해당 줄 출력 안 됨
               → 블로그에 수치 반영 안 됨
```

**증거**:
- `app/api/geo/extract-facts/route.ts` 130줄: `{"keyword": "정확한 수치/텍스트", "label": "항목명"}` — label 자유 서술
- `utils/promptBuilder.ts` 738~747줄: `get("평균 월매출", "월매출")` — 고정된 후보군으로 검색
- partial 매치도 `includes()` 기반이라 "월 평균 매출" ↔ "평균 월매출" 매칭 실패

**해결**: extract-facts에서 **OpenAI Structured Outputs (JSON Schema)** 로 label을 enum 고정.

---

### 🔴 CORE-2: `__raw_text__` 가 블로그 생성에 전달 안 됨

extract-facts는 GPT에게 `raw_text` (2000자 요약)를 뽑게 해서 저장:
```ts
// extract-facts/route.ts 150줄
{ keyword: parsed.raw_text ?? allText.slice(0, 3000), label: "__raw_text__" }
```

하지만 blog-generate는 이걸 **필터로 제거**:
```ts
// blog-generate/route.ts 118~119줄
.filter(d => d.label !== "__raw_text__" && ...)
```

결과: AI가 맥락 파악하라고 뽑아둔 원문 요약이 프롬프트에 안 들어감.

**해결**: `__raw_text__`를 별도로 꺼내서 `buildBrandDataFromFacts()` 의 `rawFacts` 에 넣거나,
promptBuilder가 `rawFacts` 대신 `__raw_text__` 를 우선 사용하도록 변경.

---

### 🔴 CORE-3: 공정위 `officialData` 가 구조화 안 됨 + 중복 호출

extract-facts에서 웹검색으로 공정위 데이터 긁어옴 (82~109줄) → **그냥 text** 로 `allText` 에 합쳐짐.
이후 blog-generate에서 또 `fetchOfficialData(brand.name)` 으로 **다시** 웹검색 호출 (153줄).

문제:
1. 동일 브랜드에 대해 팩트 추출할 때마다 웹검색, 블로그 생성할 때마다 또 웹검색 → API 비용·지연
2. 두 번의 검색 결과가 다를 수 있음 → 일관성 깨짐
3. extract-facts의 공정위 text 는 구조화 안 돼서 `official?: OfficialData` 타입으로 못 씀

**해결**: extract-facts에서 공정위 데이터를 **JSON으로 파싱** 해서 `__official_data__` 라벨로 저장.
blog-generate는 DB에서 먼저 찾고, 없거나 N일 이상 지났을 때만 재검색.

---

### 🟠 CORE-4: 바이너리 파일(xlsx, docx) 처리 깨짐

```ts
// extract-facts/route.ts 69~77줄
} else {
  // docx, xlsx 등: 텍스트로 시도
  const res = await fetch(f.url);
  if (res.ok) {
    const text = await res.text();
    const ctrl = (text.slice(0, 500).match(/[\x00-\x08\x0E-\x1F]/g) ?? []).length;
    if (ctrl < 5) extractedTexts.push(text);
  }
}
```

xlsx/docx는 zip 포맷 바이너리. `text()` 하면 mojibake. 제어문자 5개 미만 체크해서 살리지만
실제로는 zip signature 때문에 대부분 통과 못하거나, 통과해도 깨진 텍스트.

**해결**: 전용 라이브러리 사용
- xlsx/xls/csv → `xlsx` (SheetJS) 패키지. 모든 시트 순회, 각 시트를 markdown 표로 변환.
- docx → `mammoth` 패키지. `extractRawText` 또는 `convertToHtml` 사용.

---

### 🟠 CORE-5: PDF 추출 정확도 한계

현재 `gpt-5.4-mini` 비전 모델로 PDF 직접 투입 (50~61줄). 복잡한 표(정보공개서 양식) 누락 많음.

**해결 옵션**:
- A안: `pdf-parse` 로 텍스트 추출 후 `gpt-5.4` (mini 아님) 또는 Claude sonnet 4.6 에 전달
- B안: 현재 방식 유지하되 프롬프트 개선 + 모델 업그레이드 (`gpt-5.4-mini` → `gpt-5.4`)
- 권장: A안. 정보공개서는 텍스트 추출이 오히려 안정적.

---

### 🟠 CORE-6: 추출 결과 검증 없음

GPT가 엉뚱한 수치 뽑거나 단위 잘못 쓰면 그대로 저장. 검증 포인트 없음.

**해결**: 저장 전 검증 규칙
- 창업비용 > 10만원 (10000000원)
- 평균 월매출 > 100만원
- 가맹점 수 정수, 1~10000 범위
- 순마진율 0~1.0 (또는 0~100)
- 범위 벗어나면 `warning` 필드에 기록, UI에 노란 마커

---

### 🟡 CORE-7: UI에 팩트 수정 기능 부족

`page.tsx` 2162줄 "팩트 데이터 (D3 정확도 기준)" 섹션은 파일 업로드와 "팩트 추출" 버튼만 있음.
추출된 키워드가 DB에 저장되면 `✓ N개 키워드 DB 저장됨` 표시만. **편집 UI 없음**.

**해결**: 추출된 팩트 리스트를 label/keyword 편집 가능한 테이블로 렌더
- label은 enum 드롭다운 (promptBuilder 기대값과 일치)
- keyword는 자유 입력
- 항목 추가/삭제 버튼
- 저장 시 `/api/geo/brands` PATCH

---

## 개선안 상세

### 개선안 A: Label 스키마 고정 (CORE-1 해결, 필수)

**`utils/factSchema.ts` (새 파일)**:

```ts
export const FACT_LABEL_ENUM = [
  // 기본
  "창업연도",
  "가맹 문의",
  "가맹점 수",
  // 비용
  "창업비용_합계",
  "창업비용_가맹비",
  "창업비용_교육비",
  "창업비용_보증금",
  "창업비용_인테리어",
  "창업비용_장비",
  "대출가능금액",
  "실투자금",
  // 매출/수익
  "평균 월매출",
  "최대 월매출",
  "순마진율",
  "투자회수",
  // 운영
  "운영 인원",
  "최소 평수",
  "최대 평수",
  "자동화",
  // 기타
  "수상",
  "로열티",
  "계약기간",
  "영업지역",
] as const;

export type FactLabel = typeof FACT_LABEL_ENUM[number];

// JSON Schema for OpenAI Structured Outputs
export const FACT_EXTRACTION_SCHEMA = {
  name: "fact_extraction",
  strict: true,
  schema: {
    type: "object",
    additionalProperties: false,
    required: ["keywords", "raw_text", "official_data"],
    properties: {
      keywords: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          required: ["label", "keyword", "unit", "source"],
          properties: {
            label: { type: "string", enum: FACT_LABEL_ENUM },
            keyword: { type: "string" }, // 원본 수치/텍스트
            unit: { type: "string", enum: ["만원", "원", "개", "명", "평", "%", "개월", "년", "없음"] },
            source: { type: "string" }, // 파일명 또는 "공정위", "홈페이지"
          },
        },
      },
      raw_text: { type: "string" },
      official_data: {
        type: "object",
        additionalProperties: false,
        required: ["source_year", "stores_total", "avg_monthly_revenue", "cost_total", "franchise_fee", "closure_rate", "industry_avg_revenue", "industry_avg_cost", "sources"],
        properties: {
          source_year: { type: ["string", "null"] },
          stores_total: { type: ["number", "null"] },
          avg_monthly_revenue: { type: ["number", "null"] }, // 만원
          cost_total: { type: ["number", "null"] },
          franchise_fee: { type: ["number", "null"] },
          closure_rate: { type: ["number", "null"] },
          industry_avg_revenue: { type: ["number", "null"] },
          industry_avg_cost: { type: ["number", "null"] },
          sources: { type: "array", items: { type: "string" } },
        },
      },
    },
  },
} as const;
```

**`app/api/geo/extract-facts/route.ts` 수정**:

```ts
import { FACT_EXTRACTION_SCHEMA, FACT_LABEL_ENUM } from "@/utils/factSchema";

// 기존 openai.chat.completions.create(...) 블록을 교체
const result = await openai.chat.completions.create({
  model: "gpt-5.4", // mini가 아닌 정식 모델 (정확도 중요)
  response_format: {
    type: "json_schema",
    json_schema: FACT_EXTRACTION_SCHEMA,
  },
  messages: [
    {
      role: "system",
      content: `프랜차이즈 팩트 추출 전문가. 아래 텍스트에서 "${brand.name}" 관련 팩트와 공정위 데이터를 추출.

규칙:
1. label 은 enum에 있는 값만 사용. 다른 이름 금지.
2. 수치는 만원 단위로 통일. 예: "1억 5천만원" → keyword: "15000", unit: "만원"
3. 범위가 있으면 keyword에 "최소-최대" 형식. 예: "4000-4500"
4. official_data 는 공정거래위원회 정보공개서 수치. 없으면 모든 필드 null.
5. keyword를 지어내지 마라. 원문에 없으면 해당 항목 제외.`,
    },
    { role: "user", content: allText.slice(0, 15000) },
  ],
});

const parsed = JSON.parse(result.choices[0]?.message?.content ?? "{}");
factKeywords = parsed.keywords ?? [];

// __official_data__ 별도 저장
const officialDataEntry = parsed.official_data && parsed.official_data.stores_total !== null
  ? [{ keyword: JSON.stringify(parsed.official_data), label: "__official_data__" }]
  : [];

// 기존 보존 항목 (ref_links, brand_plan, brand_images)
const preserved = (currentBrand?.fact_data && Array.isArray(currentBrand.fact_data))
  ? currentBrand.fact_data.filter((d: { label: string }) =>
      d.label === "__blog_ref_links__" ||
      d.label === "__brand_plan__" ||
      d.label === "__brand_images__"
    )
  : [];

const factData = [
  ...factKeywords,
  { keyword: parsed.raw_text ?? allText.slice(0, 3000), label: "__raw_text__" },
  ...officialDataEntry,
  ...preserved,
];
```

---

### 개선안 B: __raw_text__ 를 promptBuilder로 전달 (CORE-2 해결)

**`app/api/geo/blog-generate/route.ts` 118~121줄 수정**:

```ts
// 현재
const factKeywords = (brand.fact_data && Array.isArray(brand.fact_data))
  ? brand.fact_data.filter((d: { label: string }) => d.label !== "__raw_text__" && d.label !== "__blog_ref_links__" && d.label !== "__brand_plan__" && d.label !== "__brand_images__")
  : [];
const brandData = buildBrandDataFromFacts(brand.name, factKeywords, brand.landing_url);

// 개선
const allFacts = (brand.fact_data && Array.isArray(brand.fact_data)) ? brand.fact_data : [];
const INTERNAL_LABELS = ["__raw_text__", "__blog_ref_links__", "__brand_plan__", "__brand_images__", "__official_data__"];
const factKeywords = allFacts.filter((d: { label: string }) => !INTERNAL_LABELS.includes(d.label));
const rawTextEntry = allFacts.find((d: { label: string }) => d.label === "__raw_text__");
const rawText = rawTextEntry ? (rawTextEntry as { keyword: string }).keyword : undefined;

const brandData = buildBrandDataFromFacts(brand.name, factKeywords, brand.landing_url, rawText);
```

**`utils/promptBuilder.ts` 733줄 시그니처 수정**:

```ts
export function buildBrandDataFromFacts(
  brandName: string,
  factData: FactKeyword[],
  landingUrl?: string,
  rawText?: string, // ← 추가
): BrandData {
  // ... 기존 로직 ...
  return {
    // ...
    // 기존: rawFacts: factData.map(f => `- ${f.label}: ${f.keyword}`).join("\n"),
    rawFacts: rawText && rawText.length > 100
      ? rawText + "\n\n[정형화 팩트]\n" + factData.map(f => `- ${f.label}: ${f.keyword}`).join("\n")
      : factData.map(f => `- ${f.label}: ${f.keyword}`).join("\n"),
  };
}
```

---

### 개선안 C: 공정위 데이터 DB 캐싱 (CORE-3 해결)

**`app/api/geo/blog-generate/route.ts` 수정**:

```ts
// 기존 fetchOfficialData 호출 부분 교체
let officialData: OfficialData | null = null;

// 1차: DB에서 저장된 __official_data__ 찾기
const officialEntry = (brand.fact_data ?? []).find((d: { label: string }) => d.label === "__official_data__");
if (officialEntry) {
  try { officialData = JSON.parse((officialEntry as { keyword: string }).keyword); } catch { /* ignore */ }
}

// 2차: DB에 없으면 웹검색 (단, extract-facts를 먼저 돌렸다면 이 경로 안 탐)
if (!officialData) {
  officialData = await fetchOfficialData(brand.name);
}
```

추가: extract-facts 도 기존의 별도 공정위 웹검색 블록(82~109줄)을 제거하고,
**structured output 한 번의 호출** 안에서 공정위 데이터까지 같이 뽑도록 통합.
→ API 호출 1회로 줄어듦.

---

### 개선안 D: 파일 파서 개선 (CORE-4, 5 해결)

**패키지 설치**:
```bash
npm install xlsx mammoth pdf-parse
npm install -D @types/pdf-parse
```

**`utils/fileParser.ts` (새 파일)**:

```ts
import * as XLSX from "xlsx";
import mammoth from "mammoth";
import pdfParse from "pdf-parse";

export async function parseFile(url: string, filename: string): Promise<string> {
  const ext = filename.split(".").pop()?.toLowerCase() ?? "";
  const res = await fetch(url);
  if (!res.ok) throw new Error(`fetch ${filename} failed`);

  if (ext === "txt" || ext === "csv") {
    return await res.text();
  }

  const buf = Buffer.from(await res.arrayBuffer());

  if (ext === "pdf") {
    const parsed = await pdfParse(buf);
    return parsed.text;
  }

  if (ext === "docx") {
    const result = await mammoth.extractRawText({ buffer: buf });
    return result.value;
  }

  if (ext === "xlsx" || ext === "xls") {
    const wb = XLSX.read(buf, { type: "buffer" });
    const sheets: string[] = [];
    for (const name of wb.SheetNames) {
      const sheet = wb.Sheets[name];
      const csv = XLSX.utils.sheet_to_csv(sheet);
      sheets.push(`[시트: ${name}]\n${csv}`);
    }
    return sheets.join("\n\n");
  }

  throw new Error(`지원하지 않는 확장자: ${ext}`);
}
```

**`extract-facts/route.ts` 수정**:
- 기존 41~79줄의 파일 추출 루프를 `parseFile()` 호출로 교체
- PDF는 `pdf-parse` 텍스트 추출 → 표가 있으면 gpt-5.4-mini 비전으로 보조 (선택)

---

### 개선안 E: 추출 결과 검증 (CORE-6 해결)

**`utils/factValidator.ts` (새 파일)**:

```ts
import type { FactLabel } from "./factSchema";

type Fact = { label: FactLabel; keyword: string; unit: string; source: string };
type ValidationIssue = { label: string; keyword: string; issue: string };

const NUMERIC_RULES: Record<string, { min?: number; max?: number; unit: string }> = {
  "창업비용_합계": { min: 100, max: 100000, unit: "만원" },      // 100만원 ~ 10억
  "창업비용_가맹비": { min: 10, max: 10000, unit: "만원" },
  "평균 월매출": { min: 100, max: 100000, unit: "만원" },
  "가맹점 수": { min: 1, max: 10000, unit: "개" },
  "순마진율": { min: 0, max: 100, unit: "%" },
  "투자회수": { min: 1, max: 240, unit: "개월" },
};

export function validateFacts(facts: Fact[]): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  for (const f of facts) {
    const rule = NUMERIC_RULES[f.label];
    if (!rule) continue;
    const num = parseFloat(f.keyword.replace(/[^0-9.]/g, ""));
    if (isNaN(num)) {
      issues.push({ label: f.label, keyword: f.keyword, issue: "숫자 파싱 실패" });
      continue;
    }
    if (rule.min !== undefined && num < rule.min) issues.push({ label: f.label, keyword: f.keyword, issue: `최소값(${rule.min}${rule.unit}) 미만` });
    if (rule.max !== undefined && num > rule.max) issues.push({ label: f.label, keyword: f.keyword, issue: `최대값(${rule.max}${rule.unit}) 초과` });
  }
  return issues;
}
```

extract-facts 응답에 `validation_issues` 필드 추가하고 프론트에서 노란 경고 표시.

---

### 개선안 F: 팩트 편집 UI (CORE-7 해결)

`page.tsx` 2162~2232줄 "팩트 데이터" 섹션에 편집 테이블 추가.

**추가할 UI**:

```tsx
{/* 팩트 추출 후 편집 테이블 */}
{selectedBrand?.fact_data && Array.isArray(selectedBrand.fact_data) && (() => {
  const INTERNAL = ["__raw_text__", "__blog_ref_links__", "__brand_plan__", "__brand_images__", "__official_data__"];
  const editable = selectedBrand.fact_data.filter((d: { label: string }) => !INTERNAL.includes(d.label));
  if (editable.length === 0) return null;

  const updateFact = async (idx: number, patch: Partial<{ label: string; keyword: string }>) => {
    if (!selectedBrand) return;
    const internal = selectedBrand.fact_data!.filter((d: { label: string }) => INTERNAL.includes(d.label));
    const newEditable = [...editable];
    newEditable[idx] = { ...newEditable[idx], ...patch };
    const newFd = [...newEditable, ...internal];
    await fetch("/api/geo/brands", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: selectedBrand.id, fact_data: newFd }),
    });
    setSelectedBrand({ ...selectedBrand, fact_data: newFd as Brand["fact_data"] });
  };

  const removeFact = async (idx: number) => {
    if (!selectedBrand) return;
    const internal = selectedBrand.fact_data!.filter((d: { label: string }) => INTERNAL.includes(d.label));
    const newEditable = editable.filter((_, i) => i !== idx);
    const newFd = [...newEditable, ...internal];
    await fetch("/api/geo/brands", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: selectedBrand.id, fact_data: newFd }),
    });
    setSelectedBrand({ ...selectedBrand, fact_data: newFd as Brand["fact_data"] });
  };

  return (
    <div className="mt-3 rounded-md border border-slate-200 p-2 space-y-1 max-h-64 overflow-y-auto">
      <p className="text-[10px] text-slate-500 font-semibold mb-1">팩트 리스트 (수정 가능)</p>
      {editable.map((f, i) => (
        <div key={i} className="flex items-center gap-1 text-[10px]">
          <select
            value={f.label}
            onChange={(e) => updateFact(i, { label: e.target.value })}
            className="border border-slate-200 rounded px-1 py-0.5 w-32 shrink-0"
          >
            {FACT_LABEL_ENUM.map(l => <option key={l} value={l}>{l}</option>)}
          </select>
          <input
            type="text"
            value={f.keyword}
            onChange={(e) => updateFact(i, { keyword: e.target.value })}
            className="border border-slate-200 rounded px-1 py-0.5 flex-1"
          />
          <button onClick={() => removeFact(i)} className="text-red-400 hover:text-red-600">
            <Trash2 className="h-3 w-3" />
          </button>
        </div>
      ))}
    </div>
  );
})()}
```

FACT_LABEL_ENUM 을 `utils/factSchema.ts` 에서 import.

---

### 🔴 CORE-8: 대용량 파일에서 팩트 누락 (신규 추가)

**현재 한계**:
```ts
// extract-facts/route.ts 115줄
.slice(0, 30000); // 전체 텍스트 최대 3만자

// 133줄
${allText.slice(0, 15000)}  // GPT 입력은 1만5천자만
```

**문제 상황**:
- 정보공개서 PDF는 보통 **50~200페이지**, 텍스트로 뽑으면 8만~30만 자
- 공정위 정보공개서 표준 양식만 해도 20여개 대분류, 각 대분류에 수십개 표
- 현재 로직: 앞 1.5만자만 GPT에 보냄 → 뒤쪽의 가맹점 수 추이, 매출 분포, 평균 영업이익 등이 **통째로 누락**
- gpt-5.4-mini 비전으로 PDF 투입할 때도 대용량이면 응답 토큰 한계로 끊김

**해결: 맵-리듀스 방식 청크 처리**

### 개선안 G: 대용량 파일 맵-리듀스 추출

**`utils/factExtractor.ts` (새 파일)**:

```ts
import OpenAI from "openai";
import { FACT_EXTRACTION_SCHEMA, FACT_LABEL_ENUM, type FactLabel } from "./factSchema";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

type Fact = { label: FactLabel; keyword: string; unit: string; source: string };
type ExtractResult = {
  keywords: Fact[];
  raw_text: string;
  official_data: Record<string, unknown> | null;
  chunks_processed: number;
};

// 큰 텍스트를 의미 단위로 분할 (섹션 제목·페이지 경계 보존)
function splitIntoChunks(text: string, maxChars = 12000): { content: string; hint: string }[] {
  const chunks: { content: string; hint: string }[] = [];

  // 1차: 섹션 제목 패턴으로 분할 (정보공개서 표준 양식 대응)
  const sectionPatterns = [
    /제\s*\d+\s*장/g,
    /\d+\.\s+[가-힣]+/g,
    /【[^】]+】/g,
    /\[시트:[^\]]+\]/g, // xlsx 시트 구분자
    /\f/g,  // 페이지 구분자
  ];

  // 간단 구현: 줄바꿈 2개 + 최대 길이 기준
  const paras = text.split(/\n\n+/);
  let buffer = "";
  let currentHint = "";

  for (const para of paras) {
    // 섹션 제목 감지
    const sectionMatch = para.match(/^(제\s*\d+\s*장|【[^】]+】|\[시트:[^\]]+\]|\d+\.\s+[가-힣][^\n]{0,30})/);
    if (sectionMatch) currentHint = sectionMatch[0];

    if ((buffer + "\n\n" + para).length > maxChars) {
      if (buffer) chunks.push({ content: buffer, hint: currentHint });
      buffer = para;
    } else {
      buffer = buffer ? buffer + "\n\n" + para : para;
    }
  }
  if (buffer) chunks.push({ content: buffer, hint: currentHint });

  return chunks;
}

// 한 청크에서 팩트 추출
async function extractFromChunk(
  brandName: string,
  chunk: string,
  hint: string,
  source: string,
): Promise<Fact[]> {
  const result = await openai.chat.completions.create({
    model: "gpt-5.4",
    response_format: { type: "json_schema", json_schema: FACT_EXTRACTION_SCHEMA },
    messages: [
      {
        role: "system",
        content: `프랜차이즈 팩트 추출 전문가. "${brandName}" 관련 수치·팩트를 JSON으로만 반환.
규칙:
1. label은 enum 값만 사용.
2. 원문에 없는 항목은 절대 만들지 마라.
3. 수치는 만원 단위 통일. 범위는 "최소-최대" 형식.
4. 이 청크에 해당 항목이 없으면 keywords 배열은 빈 배열로.
현재 섹션 힌트: ${hint || "(없음)"}
출처: ${source}`,
      },
      { role: "user", content: chunk.slice(0, 15000) },
    ],
  });

  try {
    const parsed = JSON.parse(result.choices[0]?.message?.content ?? "{}");
    return (parsed.keywords ?? []).map((k: Fact) => ({ ...k, source: k.source || source }));
  } catch {
    return [];
  }
}

// 중복 제거 + 상충 해결
function mergeFacts(chunksOfFacts: Fact[][]): Fact[] {
  const byLabel = new Map<FactLabel, Fact[]>();
  for (const facts of chunksOfFacts) {
    for (const f of facts) {
      const arr = byLabel.get(f.label) ?? [];
      arr.push(f);
      byLabel.set(f.label, arr);
    }
  }

  const result: Fact[] = [];
  for (const [label, candidates] of byLabel) {
    if (candidates.length === 1) {
      result.push(candidates[0]);
      continue;
    }
    // 수치형 라벨: 가장 구체적인 값 채택 (범위 > 단일값, 최신 출처 우선)
    const numericLabels: FactLabel[] = ["창업비용_합계", "평균 월매출", "가맹점 수", "실투자금"];
    if (numericLabels.includes(label)) {
      // 공정위 출처 우선
      const official = candidates.find(c => c.source.includes("공정위"));
      if (official) { result.push(official); continue; }
      // 범위 있는 값 우선
      const range = candidates.find(c => /[-~]/.test(c.keyword));
      if (range) { result.push(range); continue; }
      // 그 외 첫 번째
      result.push(candidates[0]);
    } else {
      // 텍스트 라벨: 가장 긴 것 채택
      result.push([...candidates].sort((a, b) => b.keyword.length - a.keyword.length)[0]);
    }
  }
  return result;
}

// 공정위 공식 데이터는 여러 청크에서 부분 수집 → 최종 병합
async function extractOfficialData(fullText: string, brandName: string): Promise<Record<string, unknown> | null> {
  // 공정위 관련 섹션만 추림 (전체 텍스트에서 키워드 근처 ±2000자)
  const officialKeywords = ["공정거래위원회", "정보공개서", "가맹본부", "가맹금", "폐점률"];
  const excerpts: string[] = [];
  for (const kw of officialKeywords) {
    const idx = fullText.indexOf(kw);
    if (idx >= 0) {
      excerpts.push(fullText.slice(Math.max(0, idx - 1000), Math.min(fullText.length, idx + 3000)));
    }
  }
  if (excerpts.length === 0) return null;

  const combined = excerpts.join("\n\n---\n\n").slice(0, 15000);

  const result = await openai.chat.completions.create({
    model: "gpt-5.4",
    response_format: { type: "json_schema", json_schema: FACT_EXTRACTION_SCHEMA },
    messages: [
      {
        role: "system",
        content: `"${brandName}" 공정거래위원회 정보공개서 데이터만 추출. keywords는 빈 배열로 두고 official_data만 채워라. raw_text도 빈 문자열.`,
      },
      { role: "user", content: combined },
    ],
  });
  try {
    const parsed = JSON.parse(result.choices[0]?.message?.content ?? "{}");
    return parsed.official_data ?? null;
  } catch {
    return null;
  }
}

export async function extractFactsFromLargeText(
  brandName: string,
  fullText: string,
  sourceName: string,
): Promise<ExtractResult> {
  const chunks = splitIntoChunks(fullText, 12000);

  // 병렬 추출 (최대 5개 동시)
  const batchSize = 5;
  const allFacts: Fact[][] = [];
  for (let i = 0; i < chunks.length; i += batchSize) {
    const batch = chunks.slice(i, i + batchSize);
    const results = await Promise.all(
      batch.map(c => extractFromChunk(brandName, c.content, c.hint, sourceName))
    );
    allFacts.push(...results);
  }

  const merged = mergeFacts(allFacts);
  const officialData = await extractOfficialData(fullText, brandName);

  // raw_text: 각 청크 앞 300자씩 샘플 (전체 맥락 유지)
  const rawText = chunks.slice(0, 8).map((c, i) => `[청크${i + 1}${c.hint ? ` ${c.hint}` : ""}]\n${c.content.slice(0, 500)}`).join("\n\n").slice(0, 4000);

  return {
    keywords: merged,
    raw_text: rawText,
    official_data: officialData,
    chunks_processed: chunks.length,
  };
}
```

**`extract-facts/route.ts` 수정 (대용량 대응)**:

```ts
import { extractFactsFromLargeText } from "@/utils/factExtractor";
import { parseFile } from "@/utils/fileParser";

// 기존 41~79줄의 파일 루프 + 81~115줄의 공정위 검색 + 117~166줄의 GPT 구조화를
// 아래 로직으로 통째로 교체:

const extractedTexts: { text: string; source: string }[] = [];
for (const f of files) {
  try {
    const text = await parseFile(f.url, f.name);
    if (text && text.length > 100) {
      extractedTexts.push({ text, source: f.name });
    }
  } catch (e) {
    console.error(`파일 파싱 실패: ${f.name}`, e);
  }
}

// 홈페이지 랜딩 URL 텍스트도 추가 (있으면)
if (brand.landing_url) {
  try {
    const res = await fetch(brand.landing_url);
    if (res.ok) {
      const html = await res.text();
      const text = html.replace(/<script[\s\S]*?<\/script>/g, "").replace(/<style[\s\S]*?<\/style>/g, "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
      if (text.length > 500) extractedTexts.push({ text: text.slice(0, 50000), source: "홈페이지" });
    }
  } catch { /* ignore */ }
}

if (extractedTexts.length === 0) {
  return NextResponse.json({ ok: true, keywords_count: 0, message: "추출할 텍스트가 없습니다" });
}

// 모든 파일 텍스트 합치기 (청킹은 extractFactsFromLargeText 내부에서)
const mergedText = extractedTexts.map(t => `[출처: ${t.source}]\n${t.text}`).join("\n\n===\n\n");

// 공정위 웹 검색 (별도 1회)
let officialSearchText = "";
try {
  const result = await openai.responses.create({
    model: "gpt-5.4-mini",
    tools: [{ type: "web_search_preview" as const }],
    instructions: "공정위 정보공개서 수치만 텍스트로 정리. 출처 URL 명시.",
    input: `"${brand.name}" 프랜차이즈 공정거래위원회 정보공개서 최신 데이터 검색.`,
  });
  for (const o of result.output ?? []) {
    if (o.type === "message" && "content" in o) {
      for (const c of (o as unknown as { content: { type: string; text?: string }[] }).content) {
        if (c.type === "output_text" && c.text) officialSearchText += c.text + "\n";
      }
    }
  }
} catch { /* skip */ }

if (officialSearchText) {
  mergedText += `\n\n===\n\n[출처: 공정위 웹검색]\n${officialSearchText}`;
}

// 맵-리듀스 추출
const extracted = await extractFactsFromLargeText(brand.name, mergedText, "통합");

// DB 저장
const { data: currentBrand } = await supabase.from("geo_brands").select("fact_data").eq("id", body.brand_id).single();
const preserved = (currentBrand?.fact_data && Array.isArray(currentBrand.fact_data))
  ? currentBrand.fact_data.filter((d: { label: string }) =>
      ["__blog_ref_links__", "__brand_plan__", "__brand_images__"].includes(d.label)
    )
  : [];

const officialEntry = extracted.official_data && extracted.official_data.stores_total != null
  ? [{ keyword: JSON.stringify(extracted.official_data), label: "__official_data__" }]
  : [];

const factData = [
  ...extracted.keywords.map(k => ({ keyword: k.keyword, label: k.label })),
  { keyword: extracted.raw_text, label: "__raw_text__" },
  ...officialEntry,
  ...preserved,
];

await supabase.from("geo_brands").update({ fact_data: factData }).eq("id", body.brand_id);

return NextResponse.json({
  ok: true,
  keywords_count: extracted.keywords.length,
  chunks_processed: extracted.chunks_processed,
  has_official_data: !!extracted.official_data,
  keywords: extracted.keywords.slice(0, 10),
});
```

---

### 핵심 포인트

1. **청킹 전략**: 단순 문자열 자르기 X. 섹션 제목·페이지 경계를 보존해야 표가 끊기지 않음.
2. **병렬 처리**: 청크 5개씩 동시 호출 → 100페이지 PDF도 1~2분 안에 처리.
3. **중복 병합 규칙**:
   - 공정위 출처 > 홈페이지 > 파일
   - 범위값 > 단일값
   - 최신 연도 > 과거
4. **공정위 데이터 별도 추출**: 공정위 키워드 근처만 집중 분석 → 정확도↑
5. **raw_text 샘플링**: 전체 복사가 아니라 각 청크 앞 500자씩 → 맥락 유지하면서 토큰 절약

### 예상 효과

| 항목 | 현재 | 개선 후 |
|---|---|---|
| 처리 가능 파일 크기 | ~1.5만자 (사실상 10페이지) | 제한 없음 (청크당 1.2만자) |
| 추출 항목 수 | 평균 8~15개 | 25~40개 |
| 공정위 데이터 정확도 | 낮음 (text 섞임) | 높음 (구조화 JSON) |
| API 비용 (100p PDF) | 1~2회 호출 | 10~20회 호출 (청크당 1회) |
| 처리 시간 | 20~40초 | 1~2분 |

비용은 늘어나지만 팩트 누락이 사실상 없어짐.

---

## 작업 순서 (클로드 코드용)

**Phase 1: 스키마 고정 (필수, 가장 효과 큼)**
1. `utils/factSchema.ts` 생성 (개선안 A의 FACT_LABEL_ENUM, FACT_EXTRACTION_SCHEMA)
2. `app/api/geo/extract-facts/route.ts` 수정 — Structured Outputs 사용
   - 기존의 공정위 별도 웹검색 블록 제거 (단일 호출로 통합)
   - `__official_data__` 별도 저장
3. `utils/promptBuilder.ts` `buildBrandDataFromFacts` 시그니처에 `rawText` 추가
4. `app/api/geo/blog-generate/route.ts` 118~121줄 수정 — __raw_text__, __official_data__ 활용

**Phase 2: 파일 파서 개선**
5. `npm install xlsx mammoth pdf-parse @types/pdf-parse`
6. `utils/fileParser.ts` 생성
7. `extract-facts/route.ts` 의 파일 추출 루프를 `parseFile()` 로 교체

**Phase 3: UI 편집 기능**
8. `page.tsx` 2162줄 근처 팩트 섹션에 편집 테이블 추가 (개선안 F)
9. `utils/factSchema.ts` 에서 FACT_LABEL_ENUM import

**Phase 4: 검증 (선택)**
10. `utils/factValidator.ts` 생성
11. extract-facts 응답에 `validation_issues` 추가
12. UI에 경고 표시

**Phase 5: 초대용량 파일 대응 (CORE-9, 파일이 50페이지 이상일 때 필수)**
13. `utils/factPrescan.ts` 생성 (FACT_PATTERNS, prescanSections, extractByFranchiseTargets, mergeSections)
14. `utils/factExtractorXlsx.ts` 생성 (시트별 분리, 큰 시트 통계 요약)
15. `utils/factExtractor.ts` 의 `extractFactsFromLargeText` 에 mode 파라미터 추가 (auto | disclosure | generic)
16. `extract-facts/route.ts` 에 파일 크기 가드(50MB), 해시 캐시, SSE 진행률 추가
17. Supabase 마이그레이션: `fact_extract_cache` 테이블 생성
18. 스캔 PDF 감지 → 상위 20페이지 OCR 샘플링 폴백

---

## 주의사항

- `FACT_LABEL_ENUM` 을 확정한 후에는 **기존 DB의 fact_data 를 한 번 migrate** 해야 함.
  기존 label 이 enum 에 없으면 blog-generate에서 못 찾음.
  마이그레이션 스크립트(`scripts/migrate_fact_labels.ts`) 작성해서 전체 브랜드 재추출 돌리기 권장.

- OpenAI Structured Outputs 는 `gpt-5.4`, `gpt-5.4-mini` 지원. 모델 확인.

- `pdf-parse` 는 서버리스 Vercel 환경에서 파일시스템 접근 이슈가 있을 수 있음.
  패키지 설치 후 dev에서 먼저 테스트.

- 공정위 데이터 캐시 유효기간은 일단 **영구** (수동 재추출). 정보공개서는 연 1회 갱신이라 문제 없음.

---

## 🔴 CORE-9: 초대용량 파일 대응 전략 (맵-리듀스만으로는 부족)

### 문제

개선안 G(맵-리듀스)는 **12k × 50청크 = 600k자(약 300페이지)** 까지는 감당.
하지만 실제로는 이런 케이스가 있음:

- **500~2000페이지 정보공개서** (대형 프랜차이즈, 수천 개 가맹점 재무제표 포함)
- **수십 MB xlsx** (전체 가맹점 월별 매출 원장)
- **1GB 이상 PDF 스캔본** (OCR 필요)
- **컨텍스트/토큰 비용 폭발**: 600k자 × $0.005/1k tok ≈ **$3 한 번 추출에**. 브랜드 10개면 $30.
- **처리 시간 10분+** → 타임아웃

맵-리듀스는 청크 50개 넘으면 **선형으로 비용·시간이 늘어남**. 무한히 큰 파일은 전부 읽는 게 애초에 말이 안 됨.

---

### 해결 전략: 3단계 파이프라인 (Sample → Target → Verify)

> "파일 전체를 읽지 않고, **팩트가 있을 만한 구간만 선별해서 읽는다.**"

#### 1단계: Pre-scan (파일 전체 로컬 훑기, GPT 호출 없음)

로컬에서 정규식/키워드로 **팩트 후보 구간** 마킹:

```ts
// utils/factPrescan.ts
const FACT_PATTERNS = [
  /매출\s*[:：]?\s*[\d,]+/g,
  /가맹점\s*수\s*[:：]?\s*[\d,]+/g,
  /창업\s*비용|가맹비|보증금|교육비|인테리어비/g,
  /평\s*당|㎡\s*당/g,
  /로열티|수수료/g,
  /[\d,]+\s*(원|만원|억원|%)/g,
];

function prescanSections(fullText: string): Section[] {
  // 1) 텍스트를 2000자 윈도우로 슬라이딩
  // 2) 각 윈도우의 패턴 매치 스코어 계산
  // 3) 스코어 상위 N개 윈도우만 "핫 섹션"으로 선별
  // 4) 인접 핫 섹션은 병합
  // 결과: Section[] = 핫 섹션들만, 최대 총 150k자까지
}
```

**효과**: 1000페이지 PDF(2M자) → 핫 섹션 150k자 (10배 이상 압축)

#### 2단계: TOC/항목번호 기반 타겟팅 (정보공개서 전용)

정보공개서는 **법정 양식**이라 항목번호가 고정됨:

```ts
const FRANCHISE_DISCLOSURE_TARGETS = [
  { code: "II-1", keyword: "가맹점 및 직영점 현황", priority: 10 },
  { code: "III-1", keyword: "가맹본부의 재무상황", priority: 10 },
  { code: "IV-1", keyword: "가맹금 등 금전적 부담", priority: 10 },
  { code: "IV-2", keyword: "교육·훈련비", priority: 9 },
  { code: "IV-3", keyword: "인테리어·설비비", priority: 9 },
  { code: "V-1", keyword: "가맹점사업자 부담", priority: 8 },
  { code: "V-4", keyword: "평균매출액", priority: 10 },
  // ... 법정 15개 항목 중 팩트 관련 8개만
];

function extractByFranchiseTargets(fullText: string): Section[] {
  // 각 항목 키워드 매칭 → 해당 섹션부터 다음 항목까지 슬라이스
  // 최대 10k자/섹션, 총 80k자 상한
}
```

**효과**: 정보공개서는 **2M자 → 항목 8개만 80k자**로 축약. 팩트 누락 거의 없음.

#### 3단계: 맵-리듀스 (기존 개선안 G)

핫 섹션 + 타겟 섹션을 병합한 **최종 150k자** 에 대해서만 개선안 G의 청크 추출 돌림.

```ts
// utils/factExtractor.ts (개선안 G 의 확장)
export async function extractFactsFromLargeText(
  brandName: string,
  fullText: string,
  sourceName: string,
  options: { maxChars?: number; mode?: "auto" | "disclosure" | "generic" } = {}
): Promise<ExtractResult> {
  const maxChars = options.maxChars ?? 150_000;
  const mode = options.mode ?? detectMode(fullText, sourceName);

  let sections: Section[];
  if (fullText.length < 30_000) {
    // 작은 파일: 전체 사용
    sections = [{ content: fullText, hint: sourceName, priority: 5 }];
  } else if (mode === "disclosure") {
    // 정보공개서: TOC 타겟팅 우선, 부족하면 prescan 보충
    const target = extractByFranchiseTargets(fullText);
    const pre = prescanSections(fullText);
    sections = mergeSections(target, pre, maxChars);
  } else {
    // 일반 파일: prescan 만
    sections = prescanSections(fullText).slice(0, Math.ceil(maxChars / 12_000));
  }

  // 이후는 개선안 G 그대로
  const chunks = sections.flatMap(splitIntoChunks);
  const factsPerChunk = await batchExtract(chunks, brandName);
  return { facts: mergeFacts(factsPerChunk), rawText: joinSections(sections) };
}
```

---

### 파일 크기별 처리 정책

| 원본 크기 | 처리 방식 | 소요 시간 | 비용 (추정) |
|---|---|---|---|
| 0~30k자 (~30페이지) | 전체 통째로 | 20-40s | $0.05 |
| 30k~150k자 (~150페이지) | 맵-리듀스 (개선안 G) | 1-2min | $0.3 |
| 150k~600k자 (~600페이지) | Pre-scan + 맵-리듀스 | 2-3min | $0.5 |
| 600k자~ (초대형) | TOC 타겟팅 + Pre-scan + 맵-리듀스 | 3-5min | $0.8 |
| **하드 상한 3M자 (~3000페이지)** | 같음 (더 커도 150k만 추출) | 3-5min | $0.8 |

**핵심: 원본이 아무리 커도 GPT 에 넘기는 텍스트는 최대 150k자로 고정.**

---

### 추가 방어 장치

#### (A) 파일 크기 가드

```ts
// app/api/geo/extract-facts/route.ts
const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB
const MAX_TOTAL_CHARS = 3_000_000; // 300만자 하드 상한

if (file.size > MAX_FILE_SIZE) {
  return NextResponse.json({
    error: `파일이 너무 큽니다 (${(file.size/1024/1024).toFixed(1)}MB). 50MB 이하로 분할해서 올려주세요.`,
  }, { status: 400 });
}

if (allText.length > MAX_TOTAL_CHARS) {
  // 자르지 않고 prescan 으로 축약
  console.warn(`[extract-facts] 원본 ${allText.length}자 → prescan 축약`);
}
```

#### (B) 진행률 스트리밍 (SSE)

2분 이상 걸리는 작업은 **프론트에서 진행 상황을 봐야 함**:

```ts
// app/api/geo/extract-facts/route.ts → Server-Sent Events
const encoder = new TextEncoder();
const stream = new ReadableStream({
  async start(controller) {
    controller.enqueue(encoder.encode(`data: ${JSON.stringify({stage:"prescan", progress:0})}\n\n`));
    const sections = prescanSections(allText);
    controller.enqueue(encoder.encode(`data: ${JSON.stringify({stage:"chunks", total:sections.length})}\n\n`));
    for (let i=0; i<sections.length; i++) {
      // 각 청크 처리 후 진행률 전송
    }
    controller.close();
  },
});
return new Response(stream, { headers: { "Content-Type": "text/event-stream" } });
```

프론트에서는 "프리스캔 중... / 3/8 청크 처리 중... / 병합 중..." 같은 상태 표시.

#### (C) 캐시 & 증분 추출

같은 파일 재업로드 시 **파일 SHA-256** 으로 캐시:

```ts
// Supabase: fact_extract_cache (file_hash TEXT PK, facts JSONB, created_at)
const hash = await crypto.subtle.digest("SHA-256", fileBuffer);
const cached = await supabase.from("fact_extract_cache").select().eq("file_hash", hash).single();
if (cached.data) return cached.data.facts;
```

파일이 안 바뀌면 GPT 호출 0번.

#### (D) xlsx 특수 처리

xlsx 는 "시트별로 스키마가 다름" 이 일반적이라 **시트 단위로 처리**:

```ts
// utils/factExtractorXlsx.ts
import * as XLSX from "xlsx";

function extractXlsxSections(buffer: ArrayBuffer): Section[] {
  const wb = XLSX.read(buffer);
  return wb.SheetNames.flatMap(name => {
    const sheet = wb.Sheets[name];
    const csv = XLSX.utils.sheet_to_csv(sheet);
    // 시트가 1만 행 넘으면 헤더 + 샘플 100행 + 통계 요약
    if (csv.length > 50_000) {
      return summarizeLargeSheet(name, sheet);
    }
    return [{ content: csv, hint: `시트:${name}`, priority: 7 }];
  });
}

function summarizeLargeSheet(name: string, sheet: XLSX.WorkSheet): Section[] {
  // 1) 헤더 추출
  // 2) 숫자 컬럼 각각 min/max/avg/sum 계산 (로컬)
  // 3) GPT 에는 "헤더 + 통계 요약" 만 보냄
  // 예: "월별매출 시트: 컬럼=[가맹점명, 2023-01, 2023-02, ...]
  //       2023-01 평균=4.2M, 중위=3.8M, 최대=12M (N=324)"
}
```

**효과**: 10만 행 엑셀도 10KB 요약으로 압축.

#### (E) 스캔 PDF (OCR) 폴백

텍스트가 거의 없는 PDF 는 이미지로 추정 → **페이지 샘플링 OCR**:

```ts
if (extractedTextLen < pageCount * 50) {
  // 평균 페이지당 50자도 안 나오면 스캔본으로 판단
  // 전체 OCR 는 비용 폭발 → 상위 20페이지만 샘플링 (TOC 나 목차 기준)
  return await sampleOCR(pdfBuffer, { maxPages: 20 });
}
```

---

### 최종 처리 플로우

```
[파일 업로드]
      ↓
[크기 체크 50MB 초과? → 거부]
      ↓
[파일 해시 캐시 HIT? → 캐시 반환]
      ↓
[파일 타입별 텍스트 추출]
  - pdf: pdf-parse → 텍스트 적으면 OCR 샘플링
  - xlsx: 시트별 분리, 큰 시트는 요약
  - docx: mammoth
      ↓
[원본 크기 판정]
  - <30k: 통째로 → GPT
  - 30k~150k: 맵-리듀스
  - 150k~: prescan + TOC 타겟팅 → 상위 150k자 선별 → 맵-리듀스
      ↓
[맵-리듀스: 청크 12k × 최대 13개 병렬 5개씩]
      ↓
[중복 제거 & 라벨 enum 매핑]
      ↓
[DB 저장 + 캐시 저장]
      ↓
[SSE 완료 이벤트]
```

---

### 요약: "무한히 큰 파일" 에 대한 답

1. **읽을 필요 없음**: 팩트는 전체 파일의 5~10%에만 있음. Pre-scan 으로 핫 섹션만 뽑는다.
2. **구조를 활용**: 정보공개서는 법정 양식 → TOC 타겟팅으로 80k자 축약.
3. **엑셀은 요약**: 원장 데이터는 통계치만 GPT 에 보냄.
4. **스캔본은 샘플링**: 전체 OCR 대신 상위 20페이지만.
5. **하드 상한**: GPT 에 넘기는 텍스트는 **무조건 150k자 이내**. 비용·시간 고정.
6. **파일 50MB, 텍스트 3M자 초과 시 거부** + 분할 요청 안내.

---

## Phase 5 파일별 작업 명세 (대용량 파일 처리)

**`utils/factPrescan.ts` 신규**
- `FACT_PATTERNS` 정규식
- `prescanSections(text)`: 슬라이딩 윈도우 + 스코어
- `extractByFranchiseTargets(text)`: 정보공개서 TOC 타겟
- `mergeSections(a, b, maxChars)`: 우선순위 병합

**`utils/factExtractorXlsx.ts` 신규**
- `extractXlsxSections(buffer)`: 시트별 분리
- `summarizeLargeSheet(sheet)`: 10만 행 → 통계 요약

**`app/api/geo/extract-facts/route.ts` 확장**
- 파일 크기 가드 (50MB)
- 파일 해시 캐시 (Supabase `fact_extract_cache` 테이블)
- SSE 진행률 스트리밍
- OCR 폴백 (스캔 PDF 감지 시)

**마이그레이션 필요**
```sql
CREATE TABLE fact_extract_cache (
  file_hash TEXT PRIMARY KEY,
  file_name TEXT,
  facts JSONB NOT NULL,
  raw_text TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

---

## 완료 기준

1. 브랜드에 파일 업로드 → "팩트 추출" 버튼 → DB에 `FACT_LABEL_ENUM` 값만 저장됨
2. 블로그 생성 시 프롬프트의 [DATA] 블록에 모든 수치가 정확히 표시됨
3. UI에서 팩트 리스트 편집 가능 (label 드롭다운, keyword 텍스트)
4. 공정위 데이터 재검색은 사용자가 "팩트 추출" 다시 누르기 전까지 안 일어남
5. xlsx/docx/pdf 파일에서 텍스트가 정상 추출됨
6. **500페이지 이상 정보공개서 PDF 도 3~5분 내 25개 이상 팩트 추출**
7. **10만 행 xlsx 도 통계 요약으로 처리되어 팩트 누락 없음**
8. **같은 파일 재업로드 시 캐시 HIT, GPT 재호출 없음**
9. **파일 50MB / 텍스트 3M자 초과 시 명확한 에러 메시지 + 분할 안내**
10. **추출 진행 중 프론트에 단계별 진행률 표시 (prescan → chunks N/M → merge)**
