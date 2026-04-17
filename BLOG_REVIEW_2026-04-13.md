# 블로그 발행 페이지 점검 결과 (2026-04-13)

## 점검 범위

- `app/(groupware)/frandoor/page.tsx` (블로그 탭 UI)
- `app/api/geo/blog-generate/route.ts`
- `app/api/geo/blog-render/route.ts`
- `app/api/geo/blog-convert/route.ts`
- `app/api/geo/blog-drafts/route.ts`
- `app/api/geo/tistory/auth/route.ts`, `callback/route.ts`, `publish/route.ts`, `upload/route.ts`
- `utils/blogConverter.ts`
- `utils/tistoryAuth.ts`
- `utils/promptBuilder.ts`
- `constants/blogCssTemplate.ts`

---

## 발견된 이슈

### BUG-1: 네이버 변환 시 class 기반 셀렉터 순서 버그 (심각도: 높음)

**파일**: `utils/blogConverter.ts` — `convertToNaver()`

**문제**: 91행에서 모든 요소의 `class`, `id`, `style` 속성을 먼저 제거한 후,
110~126행에서 `.info-box`, `.warn`, `.stat-row` 등 class 기반 셀렉터로 요소를 다시 찾으려 함.
class가 이미 제거되었으므로 해당 셀렉터는 아무것도 매칭하지 못함.

**영향**: info-box, warn, stat-row 등의 커스텀 컴포넌트가 네이버 변환 시 적절한 텍스트 마커 없이 누락됨.

**수정 방향**: class 기반 요소 치환(110~126행)을 속성 제거(87~91행) 이전으로 이동.

---

### BUG-2: blog-generate API의 provider 기본값 불일치 (심각도: 낮음)

**파일**: `app/api/geo/blog-generate/route.ts` 184행

**문제**: 응답에서 `provider: body.provider ?? "openai"`로 되어있으나, 프론트엔드 기본값은 `"claude"`.
provider를 명시적으로 보내면 문제 없지만, 응답 메타데이터가 실제 엔진과 다를 수 있음.

**수정**: `provider: body.provider ?? "claude"` 또는 실제 사용된 provider 변수를 반환.

---

### BUG-3: 블로그 생성 API 응답 에러 처리 누락 (심각도: 중간)

**파일**: `app/(groupware)/frandoor/page.tsx` 1861~1868행

**문제**: `res.ok` 체크 없이 `res.json()`을 바로 호출 → `blogResult`에 세팅.
API가 4xx/5xx를 반환해도 에러 객체가 결과로 표시됨.

```ts
// 현재 코드
const data = await res.json();
setBlogResult(data);

// 개선안
const data = await res.json();
if (!res.ok) {
  setBlogResult({ error: data.error || "생성 실패" });
} else {
  setBlogResult(data);
}
```

---

### ISSUE-4: Tistory 발행 버튼 미연결 (심각도: 중간)

**파일**: UI (`frandoor/page.tsx`) + API (`tistory/publish/route.ts`)

**문제**: 티스토리 발행 API(`/api/geo/tistory/publish`)는 구현되어 있으나,
블로그 탭 UI에서 직접 발행하는 버튼이 없음. "HTML 복사"와 "저장" 버튼만 존재.

**수정 방향**: 티스토리 탭에 "티스토리에 발행" 버튼 추가.

---

### ISSUE-5: Tistory 토큰 캐시가 파일 기반 (심각도: 중간)

**파일**: `utils/tistoryAuth.ts`

**문제**: `.tistory_token_cache` 파일에 토큰 저장 → 서버리스(Vercel) 환경에서 에피머럴 파일시스템이므로
매 cold start마다 토큰 유실 가능. 만료 시 자동 재발급 없이 에러만 throw.

**수정 방향**: Supabase 또는 환경변수 기반 토큰 저장소로 전환, 또는 만료 시 자동 재인증 플로우 추가.

---

### ISSUE-6: Gemini 프로바이더 미구현 (심각도: 낮음)

**파일**: UI (`frandoor/page.tsx` 1769행) + API (`blog-generate/route.ts`)

**문제**: UI에 "Gemini (준비중)" 선택지 존재, `cursor-not-allowed`로 비활성화.
API에는 gemini 분기가 없어 만약 호출되면 openai 기본값으로 fallback.

**수정 방향**: API에도 gemini 방어 로직 추가 (`provider === "gemini"` → 400 에러 반환).

---

### ISSUE-7: frandoor/page.tsx 파일 크기 (심각도: 낮음, 유지보수)

**파일**: `app/(groupware)/frandoor/page.tsx` — 2,968줄

**문제**: 상태 변수 40개+, 탭 4개(check/seo/aeo/blog) UI가 단일 파일에 혼재.

**수정 방향**: 탭별 컴포넌트 분리 (예: `components/geo/BlogTab.tsx`).

---

---

### BUG-8: 채널별 앵글 로테이션이 UI에서 적용 안 됨 — blog-convert 흐름 문제 (심각도: 높음)

**파일**: `app/(groupware)/frandoor/page.tsx` — `triggerConvert()` 함수 (1570행 부근)

**문제**: `promptBuilder.ts`에 채널별 앵글 로테이션(cost/profit/compare)을 구현했으나,
현재 UI는 frandoor 원본만 `blog-generate` API로 생성하고, 티스토리/네이버/미디엄 탭은
`blog-convert` API로 **frandoor HTML을 포맷 변환**만 함.

즉, frandoor가 "비용 해부" 앵글이면 티스토리도 같은 비용 해부 글이 포맷만 바뀌어서 나옴.
앵글 차별화가 실제로 적용되지 않음.

**현재 흐름**:
```
주제 입력 → blog-generate(frandoor) → blogResult
티스토리 탭 클릭 → blog-convert(frandoor HTML → tistory 포맷) ← 같은 내용
네이버 탭 클릭 → blog-convert(frandoor HTML → naver 텍스트) ← 같은 내용
```

**목표 흐름**:
```
주제 입력 → blog-generate(frandoor, angle=cost) → blogResult
티스토리 탭 클릭 → blog-generate(tistory, angle=profit) → 별도 결과
네이버 탭 클릭 → blog-generate(naver, angle=compare) → 별도 결과
```

**수정 방법**:
1. `triggerConvert()` 함수를 `triggerGenerate()`로 교체
2. 탭 클릭 시 `/api/geo/blog-generate`를 해당 채널의 platform으로 호출
   - `{ brand_id, platform: "tistory", topic: blogTopic, provider: blogProvider, ... }`
   - promptBuilder 내부에서 앵글이 자동 배분됨
3. `blogConvertedResults` 상태를 채널별 BlogResultType으로 변경
   - 기존: `Record<string, string>` (변환된 HTML 문자열)
   - 변경: `Record<string, BlogResultType>` (채널별 생성 결과 전체)
4. 각 채널의 프리뷰/복사/저장 로직을 BlogResultType 기반으로 수정
5. `other_channels_titles` 파라미터에 이미 생성된 다른 채널의 제목을 넘겨서 제목 중복 방지
6. `blog-convert` API와 `blogConverter.ts`는 기존 호환용으로 유지 (삭제 X)

**주의사항**:
- 채널별 generate는 AI 호출이므로 시간이 걸림 → 로딩 상태 채널별로 관리
- frandoor 원본 생성 시점에 다른 채널을 자동 생성하지 말 것. 탭 클릭 시 lazy 생성.
- Medium은 기존대로 blog-convert(영문 번역) 유지해도 됨 (이미 언어가 다르므로 중복 이슈 없음)

---

### BUG-9: tistory/upload CDN URL 추출 시 확장자 길이 하드코딩 (심각도: 낮음)

**파일**: `app/api/geo/tistory/upload/route.ts` 36행

**문제**:
```ts
const fileId = rawUrl.slice(rawUrl.lastIndexOf("/") + 1, rawUrl.length - 4);
```
확장자를 4글자(`.png`)로 가정하고 잘라냄.
`.jpeg`, `.webp` 등 다른 확장자면 fileId가 잘못 추출됨.

**수정**:
```ts
const filename = rawUrl.slice(rawUrl.lastIndexOf("/") + 1);
const dotIndex = filename.lastIndexOf(".");
const fileId = dotIndex > 0 ? filename.slice(0, dotIndex) : filename;
```

---

## [적용 완료] 동일 주제 다중 플랫폼 발행 시 AI 중복 콘텐츠 방지

### 문제

동일 콘텐츠를 포맷만 바꿔 3개 플랫폼에 발행하면 AI가 중복 콘텐츠로 판단하여:
1. 특정 출처만 인용하고 나머지 무시
2. 전체적인 브랜드 신뢰도/권위 하락
3. 검색엔진의 canonical 혼란

### 해결: 진입 질문 자동 로테이션

같은 데이터라도 **"무슨 질문에 답하는 글인가"**를 채널별로 다르게 설정.

3개 앵글:
- **cost** (얼마 드냐): 비용 구조 해부 — 총비용, 항목별 분해, 대출, 실투자금
- **profit** (얼마 남냐): 수익성 분석 — 월매출, 마진율, 순이익, 투자회수
- **compare** (왜 이걸 해야 하냐): 비교·차별점 — 업종 평균 대비, 장단점, 선택 이유

주제 키워드로 frandoor 원본 앵글을 자동 감지 → 나머지 2개를 다른 채널에 배분:

| 주제가 "비용" 계열이면 | frandoor:cost | tistory:profit | naver:compare |
| 주제가 "수익" 계열이면 | frandoor:profit | tistory:compare | naver:cost |
| 주제가 "비교" 계열이면 | frandoor:compare | tistory:cost | naver:profit |

### 수정된 파일

- `utils/promptBuilder.ts`: `detectPrimaryAngle()`, `getAngleRotation()`, `buildAngleDirective()` 추가. CHANNEL 함수가 angle 파라미터를 받도록 변경.
- `app/(groupware)/frandoor/page.tsx`: UI 안내 문구 업데이트
- `app/api/geo/blog-generate/route.ts`: `other_channels_titles` 파라미터 추가
