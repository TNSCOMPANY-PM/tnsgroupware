# 티스토리 자동 발행 기능 — Claude Code 구현 SPEC

> GEO 블로그 생성 후 → 티스토리 자동 발행까지 연결하는 기능.
> 기존 코드(blog-generate, frandoor 등)에 영향 없이 **신규 파일만 추가**한다.

---

## 0. 현재 상태 요약 (건드리지 않는 것들)

```
기존 유지 (수정 금지):
├── app/api/geo/blog-generate/route.ts   ← AI 블로그 생성 (그대로)
├── app/(groupware)/frandoor/            ← 프랜도어 페이지 (그대로)
├── utils/promptBuilder.ts               ← 프롬프트 빌드 (그대로)
├── utils/apiAuth.ts                     ← 인증 유틸 (그대로)
└── .env.local                           ← 기존 키 건드리지 않음
```

---

## 1. 환경변수 추가 (.env.local 맨 아래에 추가)

```bash
# ── 티스토리 API ──
TISTORY_APP_ID=                          # 아직 미발급 (아래 1-1 참고)
TISTORY_SECRET_KEY=                      # 아직 미발급
TISTORY_BLOG_NAME=frandoor              # frandoor.tistory.com
TISTORY_REDIRECT_URI=http://localhost:3000/api/geo/tistory/callback
```

> **주의**: redirect_uri를 `localhost:3000`으로 설정 — 기존 Next.js 서버를 그대로 사용.
> 별도 포트(5000) 서버를 띄우지 않는다.

### 1-1. 앱 등록 (수동, 1회)

```
https://www.tistory.com/guide/api/manage/register
- 서비스명: 프랜도어
- 서비스 URL: https://frandoor.co.kr
- CallBack: http://localhost:3000/api/geo/tistory/callback
→ 발급된 App ID, Secret Key를 .env.local에 입력
```

---

## 2. 신규 파일 목록 (기존 파일 수정 없음)

```
신규 생성:
├── app/api/geo/tistory/
│   ├── auth/route.ts          ← 2-1. 인증 시작 (브라우저 리다이렉트)
│   ├── callback/route.ts      ← 2-2. OAuth 콜백 (code → token 교환)
│   ├── upload/route.ts        ← 2-3. 이미지 업로드 API
│   └── publish/route.ts       ← 2-4. 글 발행 API
├── utils/tistoryAuth.ts       ← 2-5. 토큰 관리 유틸
└── types/tistory.ts           ← 2-6. 타입 정의

수정 (추가만):
├── .env.local                 ← 환경변수 4줄 추가 (섹션 1)
├── .env.example               ← 환경변수 템플릿 4줄 추가
└── .gitignore                 ← .tistory_token_cache 1줄 추가
```

---

## 2-1. 인증 시작 — `app/api/geo/tistory/auth/route.ts`

```ts
// 티스토리 OAuth 인증 시작점
// GET /api/geo/tistory/auth → 티스토리 로그인 페이지로 리다이렉트
// 프론트에서 새 창으로 열면 됨

import { NextResponse } from "next/server";
import { getSessionEmployee, unauthorized } from "@/utils/apiAuth";

export async function GET() {
  const session = await getSessionEmployee();
  if (!session) return unauthorized();

  const params = new URLSearchParams({
    client_id: process.env.TISTORY_APP_ID!,
    redirect_uri: process.env.TISTORY_REDIRECT_URI!,
    response_type: "code",
  });

  return NextResponse.redirect(
    `https://www.tistory.com/oauth/authorize?${params.toString()}`
  );
}
```

---

## 2-2. OAuth 콜백 — `app/api/geo/tistory/callback/route.ts`

```ts
// 티스토리가 code를 보내주면 → access_token으로 교환 → 파일 캐시 저장
// GET /api/geo/tistory/callback?code=xxx

import { NextResponse } from "next/server";
import { exchangeCodeForToken } from "@/utils/tistoryAuth";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");

  if (!code) {
    return new NextResponse(
      "<h1>인증 실패: code가 없습니다</h1>",
      { status: 400, headers: { "Content-Type": "text/html; charset=utf-8" } }
    );
  }

  try {
    await exchangeCodeForToken(code);
    return new NextResponse(
      "<html><body><h1>티스토리 인증 완료!</h1><p>이 창을 닫아도 됩니다.</p><script>window.close()</script></body></html>",
      { headers: { "Content-Type": "text/html; charset=utf-8" } }
    );
  } catch (error) {
    const msg = error instanceof Error ? error.message : "알 수 없는 오류";
    return new NextResponse(
      `<h1>토큰 발급 실패</h1><p>${msg}</p>`,
      { status: 500, headers: { "Content-Type": "text/html; charset=utf-8" } }
    );
  }
}
```

---

## 2-3. 이미지 업로드 — `app/api/geo/tistory/upload/route.ts`

```ts
// POST /api/geo/tistory/upload
// Body: FormData { file: File }
// Response: { url: string } (CDN URL)

import { NextResponse } from "next/server";
import { getSessionEmployee, unauthorized } from "@/utils/apiAuth";
import { getAccessToken } from "@/utils/tistoryAuth";

const BLOG_NAME = process.env.TISTORY_BLOG_NAME!;

export async function POST(request: Request) {
  const session = await getSessionEmployee();
  if (!session) return unauthorized();

  const accessToken = await getAccessToken();
  const formData = await request.formData();
  const file = formData.get("file") as File | null;

  if (!file) {
    return NextResponse.json({ error: "file 필드 필수" }, { status: 400 });
  }

  // 티스토리 API로 이미지 전송
  const uploadForm = new FormData();
  uploadForm.append("uploadedfile", file);

  const res = await fetch(
    `https://www.tistory.com/apis/post/attach?access_token=${accessToken}&blogName=${BLOG_NAME}&output=json`,
    { method: "POST", body: uploadForm }
  );
  const data = await res.json();

  if (data.tistory?.status !== "200") {
    return NextResponse.json(
      { error: "이미지 업로드 실패", detail: data },
      { status: 502 }
    );
  }

  // cfile URL → CDN URL 변환
  const rawUrl: string = data.tistory.url;
  const fileId = rawUrl.slice(rawUrl.lastIndexOf("/") + 1, rawUrl.length - 4);
  const cdnUrl = `https://t1.daumcdn.net/cfile/tistory/${fileId}?original`;

  return NextResponse.json({ url: cdnUrl, originalUrl: rawUrl });
}
```

---

## 2-4. 글 발행 — `app/api/geo/tistory/publish/route.ts`

```ts
// POST /api/geo/tistory/publish
// Body: { title, content, tags[], category_id? }
// Response: { postUrl: string, postId: string }

import { NextResponse } from "next/server";
import { getSessionEmployee, unauthorized } from "@/utils/apiAuth";
import { getAccessToken } from "@/utils/tistoryAuth";
import type { TistoryPublishRequest } from "@/types/tistory";

const BLOG_NAME = process.env.TISTORY_BLOG_NAME!;

export async function POST(request: Request) {
  const session = await getSessionEmployee();
  if (!session) return unauthorized();

  const body: TistoryPublishRequest = await request.json();

  if (!body.title?.trim() || !body.content?.trim()) {
    return NextResponse.json(
      { error: "title, content 필수" },
      { status: 400 }
    );
  }

  const accessToken = await getAccessToken();

  const params = new URLSearchParams({
    access_token: accessToken,
    output: "json",
    blogName: BLOG_NAME,
    title: body.title,
    content: body.content,
    visibility: String(body.visibility ?? 3), // 0: 비공개, 3: 발행
    category: String(body.category_id ?? 0),
    tag: (body.tags ?? []).join(","),
    acceptComment: "1",
  });

  const res = await fetch("https://www.tistory.com/apis/post/write", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: params.toString(),
  });
  const data = await res.json();

  if (data.tistory?.status !== "200") {
    return NextResponse.json(
      { error: "발행 실패", detail: data },
      { status: 502 }
    );
  }

  return NextResponse.json({
    postUrl: data.tistory.url,
    postId: data.tistory.postId,
  });
}
```

---

## 2-5. 토큰 관리 유틸 — `utils/tistoryAuth.ts`

```ts
// 토큰 캐시: 프로젝트 루트의 .tistory_token_cache 파일에 저장
// - 유효하면 캐시 사용
// - 만료됐으면 에러 던짐 (프론트에서 /api/geo/tistory/auth로 재인증 유도)

import fs from "fs";
import path from "path";

interface TokenCache {
  accessToken: string;
  expiresAt: number; // epoch ms
}

const CACHE_PATH = path.join(process.cwd(), ".tistory_token_cache");

function loadCache(): string | null {
  if (!fs.existsSync(CACHE_PATH)) return null;
  try {
    const cache: TokenCache = JSON.parse(fs.readFileSync(CACHE_PATH, "utf8"));
    // 만료 5분 전부터 무효 처리
    if (Date.now() < cache.expiresAt - 5 * 60 * 1000) {
      return cache.accessToken;
    }
    return null;
  } catch {
    return null;
  }
}

function saveCache(token: string): void {
  const cache: TokenCache = {
    accessToken: token,
    expiresAt: Date.now() + 55 * 60 * 1000, // 55분 (실제 1시간, 여유 5분)
  };
  fs.writeFileSync(CACHE_PATH, JSON.stringify(cache));
}

/** code → access_token 교환 후 캐시 저장 */
export async function exchangeCodeForToken(code: string): Promise<string> {
  const params = new URLSearchParams({
    client_id: process.env.TISTORY_APP_ID!,
    client_secret: process.env.TISTORY_SECRET_KEY!,
    redirect_uri: process.env.TISTORY_REDIRECT_URI!,
    code,
    grant_type: "authorization_code",
  });

  const res = await fetch(
    `https://www.tistory.com/oauth/access_token?${params.toString()}`
  );
  const text = await res.text();
  const token = new URLSearchParams(text).get("access_token");

  if (!token) {
    throw new Error(`토큰 발급 실패: ${text}`);
  }

  saveCache(token);
  return token;
}

/** 캐시된 토큰 반환. 만료 시 에러 (프론트에서 재인증 유도) */
export async function getAccessToken(): Promise<string> {
  const cached = loadCache();
  if (cached) return cached;
  throw new Error("TISTORY_TOKEN_EXPIRED");
}
```

---

## 2-6. 타입 정의 — `types/tistory.ts`

```ts
export interface TistoryPublishRequest {
  title: string;
  content: string;          // HTML string
  tags?: string[];
  category_id?: number;
  visibility?: 0 | 3;      // 0: 비공개, 3: 발행
}

export interface TistoryPublishResponse {
  postUrl: string;
  postId: string;
}

export interface TistoryUploadResponse {
  url: string;              // CDN URL
  originalUrl: string;
}
```

---

## 3. .gitignore 추가 (맨 아래에 1줄)

```
.tistory_token_cache
```

---

## 4. .env.example 추가 (맨 아래에)

```bash
# Tistory API (GEO 블로그 발행용)
TISTORY_APP_ID=발급받은_APP_ID
TISTORY_SECRET_KEY=발급받은_SECRET_KEY
TISTORY_BLOG_NAME=frandoor
TISTORY_REDIRECT_URI=http://localhost:3000/api/geo/tistory/callback
```

---

## 5. 프론트 연동 흐름 (참고용)

```
[프랜도어 GEO 페이지에서]

1. 블로그 글 생성 (기존 blog-generate API) → HTML 결과 받음
2. "티스토리 발행" 버튼 클릭
3. 토큰 체크:
   - POST /api/geo/tistory/publish 호출
   - 만약 TISTORY_TOKEN_EXPIRED 에러 → 새 창으로 /api/geo/tistory/auth 열기
   - 인증 완료 후 다시 publish 호출
4. 이미지가 있으면:
   - 먼저 POST /api/geo/tistory/upload (FormData)로 이미지 업로드
   - 반환된 CDN URL로 HTML 내 src 교체
5. POST /api/geo/tistory/publish → 발행 완료 URL 반환
```

---

## 6. 추가 의존성

**없음.** `node-fetch`, `form-data`, `dotenv` 등 불필요.
Next.js 내장 `fetch`와 Web API `FormData`만 사용한다.

---

## 7. 주의사항

- `.tistory_token_cache` 파일은 `.gitignore`에 추가. 커밋 금지.
- Access Token 유효시간 1시간. 만료 시 프론트에서 재인증 유도.
- 티스토리 API는 중복 발행을 막지 않음. 프론트에서 중복 클릭 방지 필요.
- 이 기능은 `app/api/geo/tistory/` 하위에만 존재하므로 기존 기능에 영향 없음.
- `utils/tistoryAuth.ts`는 기존 `utils/` 안의 다른 파일과 의존성 없음.

---

*TISTORY PUBLISH SPEC v2.0 | 2026.04.08 | 프랜도어 | Next.js 통합 버전*
*Claude Code 전달용 — 이 파일 하나만 주면 됨*
