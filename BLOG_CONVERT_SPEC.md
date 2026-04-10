# 블로그 플랫폼별 변환 레이어 — Claude Code 구현 SPEC

> Frandoor용 HTML 블로그 → 버튼 하나로 티스토리 / 네이버 / Medium용 변환.
> 기존 코드 수정 최소화. 변환 API + 프론트 버튼만 추가한다.

---

## 0. 현재 상태 요약

```
기존 유지 (수정 금지):
├── app/api/geo/blog-generate/route.ts   ← AI 블로그 생성 (Frandoor 풀스펙 HTML)
├── app/api/geo/tistory/                 ← 티스토리 발행 API (이미 구현됨)
├── app/(groupware)/frandoor/page.tsx    ← GEO 페이지 (블로그 탭 존재)
├── utils/promptBuilder.ts               ← 프롬프트 빌드
└── utils/tistoryAuth.ts                 ← 티스토리 토큰 관리
```

### 현재 blog-generate 응답 구조 (BlogResultType)
```ts
type BlogResultType = {
  title?: string;
  meta_description?: string;
  keywords?: string[];
  content?: string;          // ← Frandoor용 풀 HTML
  faq?: { q: string; a: string }[];
  schema_markup?: string;
  seo_score_tips?: string[];
  sources_cited?: string[];
  character_count?: number;
};
```

### 프론트 상태 (frandoor/page.tsx에 이미 존재)
```ts
// 이미 선언되어 있음 — 새로 만들지 말 것
const [blogPlatform, setBlogPlatform] = useState<"tistory" | "naver" | "frandoor" | "medium">("tistory");
const [blogResult, setBlogResult] = useState<BlogResultType | null>(null);
const [blogAllResults, setBlogAllResults] = useState<Record<string, BlogResultType>>({});
```

---

## 1. 신규 파일 목록

```
신규 생성:
├── app/api/geo/blog-convert/route.ts    ← 1-1. 변환 API
├── utils/blogConverter.ts               ← 1-2. 변환 로직 (핵심)
└── types/blogConvert.ts                 ← 1-3. 타입 정의

수정 (추가만):
└── app/(groupware)/frandoor/page.tsx    ← 2. 변환 버튼 UI 추가
```

---

## 1-1. 변환 API — `app/api/geo/blog-convert/route.ts`

```ts
// POST /api/geo/blog-convert
// Body: { content: string (Frandoor HTML), title: string, target: "tistory" | "naver" | "medium", faq?: {q,a}[], keywords?: string[] }
// Response: { converted_content: string, platform_meta: object }

import { NextResponse } from "next/server";
import { getSessionEmployee, unauthorized } from "@/utils/apiAuth";
import { convertForPlatform } from "@/utils/blogConverter";
import type { BlogConvertRequest } from "@/types/blogConvert";

export async function POST(request: Request) {
  const session = await getSessionEmployee();
  if (!session) return unauthorized();

  const body: BlogConvertRequest = await request.json();

  if (!body.content?.trim() || !body.target) {
    return NextResponse.json({ error: "content, target 필수" }, { status: 400 });
  }

  try {
    const result = convertForPlatform(body);
    return NextResponse.json(result);
  } catch (error) {
    const msg = error instanceof Error ? error.message : "변환 실패";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
```

---

## 1-2. 변환 로직 — `utils/blogConverter.ts`

이 파일이 핵심이다. 각 플랫폼의 제약에 맞게 HTML을 다운그레이드한다.

### 변환 규칙 요약

| 요소 | Frandoor (원본) | 티스토리 | 네이버 | Medium |
|------|----------------|---------|--------|--------|
| HTML 전체 | 풀스펙 | 대부분 유지 | 대폭 단순화 | Markdown 변환 |
| `<style>` 태그 | O | O (인라인 권장) | X (제거) | X (제거) |
| `<script>` 태그 | O | X (제거) | X (제거) | X (제거) |
| CSS class | O | O | X (인라인으로) | X (제거) |
| `<table>` | O | O | O (심플하게) | O (심플하게) |
| `<iframe>` | O | O (유튜브만) | X | X |
| Schema markup | JSON-LD | JSON-LD 유지 | X (제거) | X (제거) |
| 이미지 | 원본 URL | CDN URL 변환 | 원본 유지 | 원본 유지 |
| FAQ 섹션 | 커스텀 HTML | 심플 HTML | 텍스트 기반 | ## 헤딩 기반 |
| meta_description | O | O | O (본문 상단 삽입) | O (subtitle) |
| 글자수 제한 | 없음 | 없음 | 없음 | 없음 |

### 구현 방향

```ts
import type { BlogConvertRequest, BlogConvertResult } from "@/types/blogConvert";

export function convertForPlatform(req: BlogConvertRequest): BlogConvertResult {
  switch (req.target) {
    case "tistory":
      return convertToTistory(req);
    case "naver":
      return convertToNaver(req);
    case "medium":
      return convertToMedium(req);
    default:
      throw new Error(`지원하지 않는 플랫폼: ${req.target}`);
  }
}

function convertToTistory(req: BlogConvertRequest): BlogConvertResult {
  // 1. <script> 태그 제거
  // 2. <style> 태그 → 인라인 스타일로 변환 (가능한 범위)
  // 3. class 기반 스타일 → inline style로 변환
  // 4. Schema markup (JSON-LD) 유지
  // 5. 이미지 src는 그대로 (티스토리 발행 시 upload API로 별도 처리)
  // 6. FAQ 섹션: <details><summary> → 단순 <h3> + <p> 구조로
  // 7. 반환: { converted_content: HTML string, platform_meta: { visibility: 0 } }
}

function convertToNaver(req: BlogConvertRequest): BlogConvertResult {
  // 네이버는 가장 제한적 — 스마트에디터 호환 수준으로 단순화
  // 1. 모든 <style>, <script>, <link> 제거
  // 2. class, id 속성 전부 제거
  // 3. 허용 태그만 남김: p, br, strong, em, a, img, h2, h3, ul, ol, li, table, tr, td, th, blockquote
  // 4. 복잡한 CSS → 제거 (인라인 스타일도 font-size, color, text-align 정도만)
  // 5. Schema markup 제거
  // 6. FAQ → 단순 텍스트 (Q: ... A: ... 형태)
  // 7. meta_description → 본문 최상단에 <p> 태그로 삽입
  // 8. 반환: { converted_content: 단순 HTML, platform_meta: {} }
}

function convertToMedium(req: BlogConvertRequest): BlogConvertResult {
  // Medium은 Markdown 기반
  // 1. HTML → Markdown 변환
  //    - <h2> → ## , <h3> → ###
  //    - <p> → 일반 텍스트 + 빈 줄
  //    - <strong> → **text**
  //    - <em> → *text*
  //    - <a href="url">text</a> → [text](url)
  //    - <img src="url"> → ![alt](url)
  //    - <ul><li> → - item
  //    - <ol><li> → 1. item
  //    - <blockquote> → > text
  //    - <table> → Markdown 테이블
  //    - <code> → `code` / ```code block```
  // 2. Schema markup, style, script 전부 제거
  // 3. FAQ → ## 자주 묻는 질문 + ### Q 형태
  // 4. 반환: { converted_content: Markdown string, platform_meta: { subtitle: meta_description } }
}
```

### 주의사항
- HTML 파싱에 정규식만 쓰지 말 것. 서버사이드니까 `cheerio` 또는 `node-html-parser` 사용 권장
- `npm install cheerio` 필요 (의존성 1개 추가)
- 변환은 서버에서 하되, 프리뷰는 프론트에서 바로 보여줘야 함

---

## 1-3. 타입 정의 — `types/blogConvert.ts`

```ts
export type ConvertTarget = "tistory" | "naver" | "medium";

export interface BlogConvertRequest {
  content: string;           // Frandoor용 원본 HTML
  title: string;
  target: ConvertTarget;
  faq?: { q: string; a: string }[];
  keywords?: string[];
  meta_description?: string;
  schema_markup?: string;
}

export interface BlogConvertResult {
  converted_content: string;  // 변환된 HTML 또는 Markdown
  platform_meta: {
    visibility?: number;      // 티스토리: 0(비공개), 3(발행)
    subtitle?: string;        // Medium: subtitle
    [key: string]: unknown;
  };
}
```

---

## 2. 프론트 변경 — `frandoor/page.tsx`

### 추가할 것: blogResult가 있을 때 변환 버튼 그룹

blogResult가 존재하고 프리뷰/HTML 뷰 아래에 플랫폼 변환 버튼을 추가한다.

```
[기존 블로그 생성 결과 영역]

──────────────────────────
📤 플랫폼별 변환
[티스토리 변환] [네이버 변환] [Medium 변환]
──────────────────────────

[변환 결과 프리뷰 영역]  ← 탭 또는 모달
  - 프리뷰 / 소스코드 토글
  - [클립보드 복사] [임시저장 발행] 버튼
```

### 동작 흐름

```
1. 사용자가 "티스토리 변환" 클릭
2. POST /api/geo/blog-convert { content: blogResult.content, title: blogResult.title, target: "tistory", ... }
3. 응답의 converted_content를 blogAllResults["tistory"]에 저장
4. 변환 결과 프리뷰 표시
5. "임시저장 발행" 클릭 시:
   - 티스토리: POST /api/geo/tistory/publish { ..., visibility: 0 } (비공개 = 임시저장)
   - 네이버: 클립보드 복사 후 네이버 블로그 에디터 오픈 안내
   - Medium: 클립보드 복사 (Medium API 연동은 추후)
```

### 주의사항
- 기존 blogPlatform, blogAllResults 상태를 재활용할 것
- 새 state는 최소한으로: `blogConverting: boolean`, `blogConvertedResults: Record<ConvertTarget, string>`
- 변환 버튼은 blogResult?.content가 있을 때만 표시

---

## 3. 의존성 추가

```bash
npm install cheerio
```

기존 package.json의 dependencies에 cheerio만 추가. 다른 건 없다.

---

## 4. 작업 순서 (권장)

```
Step 1: types/blogConvert.ts 생성
Step 2: utils/blogConverter.ts 생성 (cheerio 사용, 3개 변환 함수)
Step 3: app/api/geo/blog-convert/route.ts 생성
Step 4: frandoor/page.tsx에 변환 버튼 + 프리뷰 UI 추가
Step 5: 테스트 — blog-generate로 글 생성 후 각 플랫폼 변환 확인
```

---

## 5. 하지 말 것

- blog-generate/route.ts 수정 금지
- promptBuilder.ts 수정 금지
- tistory/ 하위 API 수정 금지
- 네이버 블로그 API 연동 시도 금지 (네이버는 공식 API 없음, 클립보드 복사 방식)
- Medium API 연동은 이 스펙 범위 밖 (추후 별도 SPEC)

---

*BLOG_CONVERT_SPEC v1.0 | 2026.04.09 | 프랜도어 | Claude Code 전달용*
