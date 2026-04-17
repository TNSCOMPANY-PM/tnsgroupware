# 블로그 발행 플로우 전면 점검 (2026-04-14)

## 요약

블로그 관련 파일 4개가 중간에 잘려 있어서 **컴파일조차 안 되는 상태**였음.
Cowork 쪽에서 긴급 복원했지만, 로컬 git 상태와 실제 파일이 불일치할 수 있으므로
클로드 코드가 직접 검증 후 정리해야 함.

---

## 🔴 치명적: 파일 Truncation (복원 완료, 검증 필요)

Cowork 세션에서 디스크상의 다음 파일들이 중간에 끊겨 있었음:

| 파일 | 원본 size | 끊긴 위치 | 상태 |
|---|---|---|---|
| `app/api/geo/blog-generate/route.ts` | 9563 bytes | `search_in` 에서 끊김 (208줄 중 202줄까지) | 복원함 |
| `utils/tistoryAuth.ts` | 약 1700 bytes | `exchangeCodeForToken(code: stri` 에서 끊김, `getAccessToken` 없음 | 복원함 |
| `app/api/geo/tistory/upload/route.ts` | 1300 bytes | `const cdnUrl = \`https://t1.daumcdn.net/cfi` 에서 끊김 | 복원함 |
| `app/(groupware)/frandoor/page.tsx` | 2954줄 (원본 3028줄) | 마지막 줄 `className="w-full text-xs border-coll` 에서 끊김 | 복원함 |

### 클코가 확인해야 할 것

```bash
# 1. 파일 크기/줄 수 확인
wc -l app/api/geo/blog-generate/route.ts                  # 208이어야 함
wc -l utils/tistoryAuth.ts                                # 81이어야 함
wc -l app/api/geo/tistory/upload/route.ts                 # 42이어야 함
wc -l "app/(groupware)/frandoor/page.tsx"                 # 3028이어야 함

# 2. 각 파일 마지막 줄 확인 (모두 `}` 로 끝나야 함)
tail -3 app/api/geo/blog-generate/route.ts
tail -3 utils/tistoryAuth.ts
tail -3 app/api/geo/tistory/upload/route.ts
tail -3 "app/(groupware)/frandoor/page.tsx"

# 3. 빌드 확인
npx tsc --noEmit
```

### 빌드 에러가 남아 있다면

Cowork에서 복원한 내용이 로컬 편집 중이던 내용을 덮어썼을 수 있음.
다음을 비교해서 결정:

```bash
git diff HEAD app/api/geo/blog-generate/route.ts
git diff HEAD utils/tistoryAuth.ts
git diff HEAD app/api/geo/tistory/upload/route.ts
git diff HEAD "app/(groupware)/frandoor/page.tsx"
```

- diff가 없거나 사소하면: 복원 OK
- 의도한 변경사항이 날아갔으면: `git stash` 했던 내용이 있는지 확인 후 수동 머지

---

## 🟡 블로그 플로우 외 truncation (건드리지 않음)

블로그와 직접 관계없지만 같은 세션에서 잘린 파일들이 더 있음.
**블로그 점검과 별개로 반드시 수정 필요**:

```
app/(groupware)/hr/page.tsx         line 487  — unterminated string
app/api/employees/route.ts          line 26   — '}' expected
components/hr/EmployeeFlipCard.tsx  line 130  — ')' expected
components/hr/ProfileCardSheet.tsx  line 1157 — unterminated string
utils/employmentCertificate.ts      line 385  — '}' expected
```

빌드 전체가 깨진 상태이므로 `npx tsc --noEmit`으로 확인 후
각각 `git show HEAD:경로` 로 원본 확인해서 복원.

---

## 블로그 플로우 기능적 점검

### ✅ 정상 동작 확인된 부분

1. **앵글 로테이션** (`utils/promptBuilder.ts` 131~155줄, 681~687줄)
   - `detectPrimaryAngle(topic)` → cost/profit/compare 자동 판별
   - `getAngleRotation(primaryAngle)` → 채널별 앵글 배분
   - `buildAngleDirective(angle, data, otherAngles)` → answer-box·구조·FAQ·결론 지시
   - `buildPrompt()` 안에서 채널별 `myAngle` 적용됨

2. **채널별 blog-generate 호출** (`page.tsx` 1570~1616줄)
   - 티스토리/네이버 탭 클릭 → `/api/geo/blog-generate` 호출 (앵글 적용)
   - Medium 탭 클릭 → `/api/geo/blog-convert` (영문 번역만)
   - `other_channels_titles` 로 이미 생성된 제목 중복 회피 지시

3. **채널별 메타 사용** (b243a35 커밋)
   - 발행·저장 시 `blogAllResults[channel]` 의 title/keywords/meta/faq 사용
   - frandoor 원본 메타가 아닌 각 채널 생성 메타로 저장

4. **blogConverter.ts 셀렉터 순서**
   - `.info-box`, `.warn`, `.stat-row`, `.source` class 기반 치환이
     `removeAttr("class")` 보다 **앞에** 위치 (88~109줄 → 112~116줄)

5. **tistory upload 확장자 처리**
   - `rawUrl.length - 4` 하드코딩 → `filename.lastIndexOf(".")` 로 개선
   - `.jpeg`, `.webp` 등 4자 이상 확장자 정상 처리

---

## 🟠 아직 남은 기능적 이슈

### ISSUE-A: tistory publish 에서 TISTORY_TOKEN_EXPIRED 응답 처리

`app/api/geo/tistory/publish/route.ts` 에서 `getAccessToken()` 이 throw하면
500 에러로 떨어짐. 하지만 프론트엔드는:

```ts
alert(data.error === "TISTORY_TOKEN_EXPIRED" ? "티스토리 인증이 만료됐습니다..." : ...)
```

를 기대하고 있음. try/catch 감싸서 에러 메시지가 `TISTORY_TOKEN_EXPIRED` 면
401이나 400으로 `{ error: "TISTORY_TOKEN_EXPIRED" }` 응답하도록 해야 함.

**수정 위치**: `app/api/geo/tistory/publish/route.ts`

```ts
// 현재
const accessToken = await getAccessToken();

// 수정
let accessToken: string;
try {
  accessToken = await getAccessToken();
} catch (e) {
  if (e instanceof Error && e.message === "TISTORY_TOKEN_EXPIRED") {
    return NextResponse.json({ error: "TISTORY_TOKEN_EXPIRED" }, { status: 401 });
  }
  throw e;
}
```

`tistory/upload/route.ts` 도 동일한 이슈 있음.

---

### ISSUE-B: blog-generate 에서 official data fetch 실패 시 로깅 없음

```ts
// app/api/geo/blog-generate/route.ts
async function fetchOfficialData(brandName: string): Promise<OfficialData | null> {
  try {
    // ... GPT 웹검색
  } catch {
    return null;  // ← 에러를 완전히 먹음
  }
}
```

공정위 데이터 수집이 실패해도 조용히 `null`로 내려가기 때문에
블로그 본문에 [공정위 공시 데이터] 블록이 안 들어가도 원인 추적 불가.

**수정**: `console.error` 라도 찍거나, 응답에 `officialDataFetched: boolean` 플래그 포함.

---

### ISSUE-C: ref_links 분석 실패도 silent

```ts
try {
  const refInput = refLinks.map((url, i) => `${i + 1}. ${url}`).join("\n");
  const refRaw = await callOpenAI(`아래 블로그 글들을 읽고 분석해주세요...`);
  refAnalysis = refRaw.slice(0, 4000);
} catch { /* skip */ }
```

OpenAI 응답 실패 시 참고 블로그 톤 분석이 빠짐. 사용자는 왜 톤이 안 반영됐는지 모름.
**수정**: 로깅 추가.

---

### ISSUE-D: other_channels_titles 중복 제거 누락

`page.tsx` 1590~1594줄:

```ts
const otherTitles = Object.entries(blogConvertedResults)
  .filter(([, v]) => v)
  .map(([, v]) => { try { const m = v.match(/<title>([^<]*)<\/title>/); return m?.[1] ?? ""; } catch { return ""; } })
  .filter(Boolean);
if (blogResult.title) otherTitles.unshift(blogResult.title);
```

- `blogConvertedResults` 는 **변환된 content** (HTML/텍스트)를 담고 있어서
  `<title>` 태그로 파싱하려 하지만 네이버는 plain text이고 HTML 변환본은
  `<title>` 태그가 없음 (문서 body만 들어감). → 항상 빈 문자열이 됨.
- 정확한 해결: `blogAllResults[channel]?.title` 을 직접 사용.

**수정**:
```ts
const otherTitles = Object.entries(blogAllResults)
  .filter(([ch, v]) => ch !== target && v?.title)
  .map(([, v]) => v.title as string);
if (target !== "frandoor" && blogResult.title) otherTitles.unshift(blogResult.title);
```

---

### ISSUE-E: Medium 탭은 앵글 로테이션에서 제외됨

Medium은 영문 번역 파이프라인(`blog-convert`)을 타므로 앵글 로테이션이 적용 안 됨.
현재 설계상 의도된 것이지만, AEO 관점에서 영문 AI 크롤러(ChatGPT/Perplexity 영문권)가
Medium을 긁어갈 때 한국어 원본과 "같은 관점 × 다른 언어" 가 됨.

**판단 포인트**: Medium도 `blog-generate` 파이프라인에 태워 영문 앵글로 생성할지,
아니면 Medium은 영문권 독자용이라 한국어 중복 이슈와 무관하니 그냥 둘지.
→ 사용자 판단 필요. 당장 수정 불필요.

---

### ISSUE-F: blogProvider 상태 변경이 재생성에 반영 안 됨

`page.tsx` 1595~1606줄의 `triggerConvert` 안에서 `blogProvider`를 body에 실어 보냄.
하지만 티스토리 탭을 이미 눌러 생성한 뒤 provider를 변경하고 다시 티스토리 탭을 누르면,
`blogConvertedResults[target]` 이 이미 있어서 `triggerConvert` 조기 return 됨 (1571줄).

```ts
if (target === "frandoor" || blogConvertedResults[target] || blogConverting) return;
```

**수정 방향**: 원본(frandoor)을 새로 생성할 때 `blogConvertedResults`, `blogAllResults`를
초기화하도록 기존에 되어 있는지 확인. 없다면 추가.
또는 "재생성" 버튼을 채널별로 추가.

---

### ISSUE-G: JSON 파싱 실패 시 content만 raw로 들어감

```ts
// blog-generate/route.ts 189~195줄
let parsed;
try {
  const jsonMatch = raw.match(/```json\s*([\s\S]*?)```/) || raw.match(/\{[\s\S]*\}/);
  parsed = JSON.parse(jsonMatch ? (jsonMatch[1] || jsonMatch[0]) : raw);
} catch {
  parsed = { content: raw, title: "", meta_description: "", keywords: [], faq: [], schema_markup: "", seo_score_tips: [] };
}
```

AI가 JSON 아닌 걸 뱉으면 `content`에 raw 전체(프리앰블 포함)가 들어감.
프론트는 이걸 HTML로 렌더하려다 망가짐.

**수정**: 파싱 실패 시 `error: "AI_JSON_PARSE_FAILED"` 응답으로 500 돌리고 프론트에서 alert.

---

## 정리 — 클로드 코드가 해야 할 일

1. **파일 truncation 검증** (최우선)
   - 위 "🔴 치명적" 섹션의 4개 파일 크기·마지막 줄 확인
   - `npx tsc --noEmit` 통과할 때까지 복원 완료 확인
   - HR 관련 5개 파일도 별도 복원 (블로그 외)

2. **ISSUE-A**: tistory publish/upload 에서 TISTORY_TOKEN_EXPIRED 을 401로 응답

3. **ISSUE-D**: `page.tsx` triggerConvert 에서 `otherTitles` 추출 로직을
   `blogAllResults[channel]?.title` 기반으로 교체

4. **ISSUE-G**: blog-generate 에서 JSON 파싱 실패 시 명확한 에러 응답

5. **ISSUE-B, C**: 로깅 추가 (선택)

6. **ISSUE-E, F**: 사용자 판단 필요, 일단 보류
