# GEO 블로그 자동화 파이프라인 — Claude Code 구현 SPEC

> 매일 아침 → 오늘 요일에 해당하는 브랜드 확인 → GEO 체크 → 블로그 생성 → 플랫폼별 변환 → 임시저장 발행 → 리포트 생성
> 사람이 할 일: 임시저장된 글 확인 → 게시 버튼만 누르기

---

## 0. 현재 상태 (이미 있는 것)

```
✅ 있음:
├── app/api/cron/frandoor-daily/route.ts    ← 데일리 크론 (기본 구조)
├── app/(groupware)/frandoor/page.tsx       ← 주간 스케줄 UI (localStorage)
├── BrandPlan.auto_enabled                   ← 브랜드별 자동화 on/off
├── BrandPlan.blog_tistory/naver/frandoor/medium  ← 채널별 on/off
├── frandoor_blog_drafts 테이블              ← 초안 저장 (status: draft/approved/published)
├── frandoor_daily_reports 테이블            ← 일일 리포트
├── blog-generate API                        ← AI 블로그 생성
├── tistory publish API                      ← 티스토리 발행 (visibility: 0 = 임시저장)
└── 주간 스케줄: { "월": ["오공김밥"], "화": ["한신우동"], ... }

❌ 없음 (이 스펙에서 추가):
├── weekly_schedule DB 테이블                 ← localStorage → DB 이전
├── topic_pool DB 테이블                      ← 주제 풀 관리
├── 플랫폼별 자동 발행 (네이버/Medium)         ← 티스토리만 API 있음
├── 트렌드 기반 주제 자동 선정                 ← 현재 하드코딩
└── Cowork 연동 (브라우저 자동화)              ← 네이버/Medium 임시저장
```

---

## 1. 전체 파이프라인 흐름

```
[매일 아침 9시 — Vercel Cron 또는 수동 트리거]
     │
     ▼
┌─ Step 0: 오늘 요일 확인 ─────────────────────────────────┐
│  weekly_schedule 테이블에서 오늘 요일에 배정된 브랜드 조회  │
│  + auto_enabled === true 필터                              │
└────────────────────────────────────────────────────────────┘
     │
     ▼ (브랜드 목록)
┌─ Step 1: GEO/AEO 체크 (선택) ────────────────────────────┐
│  각 브랜드 plan에 geo_check/aeo_check ON이면 실행          │
│  → geo_check_runs 테이블에 결과 저장                       │
│  → 점수 하락 감지 시 → action_items에 "블로그 강화" 추가   │
└────────────────────────────────────────────────────────────┘
     │
     ▼
┌─ Step 2: 주제 선정 ──────────────────────────────────────┐
│  우선순위:                                                 │
│  ① topic_pool에 대기 중인 주제가 있으면 → 그거 사용        │
│  ② 없으면 → AI가 트렌드 기반 주제 자동 생성               │
│  ③ GEO 점수 하락 시 → 해당 키워드 강화 주제 자동 생성     │
└────────────────────────────────────────────────────────────┘
     │
     ▼ (브랜드 + 주제)
┌─ Step 3: Frandoor용 블로그 생성 ─────────────────────────┐
│  POST /api/geo/blog-generate                               │
│  { brand_id, platform: "frandoor", topic, provider }       │
│  → HTML 결과물 (answer-box + 본문 + FAQ + JSON-LD)         │
│  → frandoor_blog_drafts에 저장 (channel: "frandoor")       │
└────────────────────────────────────────────────────────────┘
     │
     ▼
┌─ Step 4: 플랫폼별 변환 ─────────────────────────────────┐
│  BrandPlan 기준으로 활성화된 채널만:                        │
│                                                            │
│  blog_tistory: true →                                      │
│    POST /api/geo/blog-convert { target: "tistory" }        │
│    → frandoor_blog_drafts 저장 (channel: "tistory")        │
│                                                            │
│  blog_naver: true →                                        │
│    POST /api/geo/blog-convert { target: "naver" }          │
│    → frandoor_blog_drafts 저장 (channel: "naver")          │
│                                                            │
│  blog_medium: true →                                       │
│    POST /api/geo/blog-convert { target: "medium" }         │
│    → frandoor_blog_drafts 저장 (channel: "medium")         │
└────────────────────────────────────────────────────────────┘
     │
     ▼
┌─ Step 5: 자동 임시저장 발행 ─────────────────────────────┐
│                                                            │
│  [티스토리] — API로 자동 임시저장                           │
│    POST /api/geo/tistory/publish                           │
│    { title, content: 변환된HTML, visibility: 0 }           │
│    → draft status → "published" + published_url 저장       │
│                                                            │
│  [네이버] — ❌ API 없음. 2가지 방안:                       │
│    A안) Cowork 브라우저 자동화 (재민님 PC 크롬 필요)       │
│      → 네이버 블로그 에디터 열기 → HTML 붙여넣기           │
│      → 임시저장 클릭                                       │
│    B안) 클립보드 복사 + 알림만                              │
│      → "네이버 글 준비됨" 알림 → 재민님이 수동 붙여넣기    │
│                                                            │
│  [Medium] — Medium API 연동 (추후)                         │
│    현재는 B안과 동일 (클립보드 복사 + 알림)                │
└────────────────────────────────────────────────────────────┘
     │
     ▼
┌─ Step 6: 데일리 리포트 생성 ─────────────────────────────┐
│  frandoor_daily_reports에 저장:                             │
│  - GEO/AEO 점수 변동                                      │
│  - 생성된 블로그 수 / 채널별 현황                          │
│  - 임시저장 성공/실패                                      │
│  - 다음 액션 아이템                                        │
│  → 그룹웨어 대시보드에 알림 표시                           │
└────────────────────────────────────────────────────────────┘
```

---

## 2. 신규 DB 테이블

### 2-1. weekly_schedule (localStorage → DB 이전)

```sql
CREATE TABLE weekly_schedule (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  brand_id UUID REFERENCES geo_brands(id) ON DELETE CASCADE,
  day_of_week SMALLINT NOT NULL CHECK (day_of_week BETWEEN 0 AND 6),
  -- 0: 일, 1: 월, 2: 화, 3: 수, 4: 목, 5: 금, 6: 토
  sort_order SMALLINT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 인덱스
CREATE INDEX idx_weekly_schedule_day ON weekly_schedule(day_of_week);

-- 예시 데이터
-- 월요일: 오공김밥
-- 화요일: 한신우동
-- 수요일: 덮밥장사장
```

### 2-2. topic_pool (주제 풀)

```sql
CREATE TABLE topic_pool (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  brand_id UUID REFERENCES geo_brands(id) ON DELETE CASCADE,
  topic TEXT NOT NULL,
  reader_stage TEXT DEFAULT 'decision' CHECK (reader_stage IN ('awareness', 'consideration', 'decision')),
  search_intent TEXT DEFAULT 'transactional' CHECK (search_intent IN ('informational', 'navigational', 'transactional')),
  source TEXT DEFAULT 'manual',  -- 'manual' | 'trend' | 'geo_recovery'
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'used', 'skipped')),
  priority SMALLINT DEFAULT 0,   -- 높을수록 먼저 사용
  used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_topic_pool_brand ON topic_pool(brand_id, status);
```

---

## 3. 크론 API 수정 — `app/api/cron/frandoor-daily/route.ts`

### 현재 문제
- 주간 스케줄이 localStorage라서 서버에서 접근 불가
- 주제가 하드코딩 (`${brandName} 창업비용 및 수익 분석 ${today}`)
- 플랫폼별 변환이 없음
- 티스토리 자동 발행이 없음

### 수정 흐름

```ts
export async function GET(request: Request) {
  // 인증 체크 (Vercel Cron 또는 수동 트리거)

  const today = new Date();
  const dayOfWeek = today.getDay(); // 0=일, 1=월, ...

  // Step 0: 오늘 요일에 배정된 브랜드 조회 (DB)
  const { data: schedules } = await supabase
    .from("weekly_schedule")
    .select("brand_id, geo_brands(id, name, landing_url, fact_data)")
    .eq("day_of_week", dayOfWeek);

  for (const schedule of schedules) {
    const brand = schedule.geo_brands;
    const plan = getBrandPlan(brand);

    if (!plan.auto_enabled) continue;

    // Step 1: GEO 체크 (기존 로직)
    if (plan.geo_check) { /* ... */ }

    // Step 2: 주제 선정
    const topic = await pickTopic(brand.id);

    // Step 3: Frandoor용 생성
    const blogResult = await generateBlog(brand, "frandoor", topic);
    await saveDraft(brand.id, "frandoor", blogResult);

    // Step 4: 플랫폼별 변환 + 저장
    if (plan.blog_tistory) {
      const converted = await convertBlog(blogResult, "tistory");
      const draftId = await saveDraft(brand.id, "tistory", converted);

      // Step 5: 티스토리 자동 임시저장
      await publishToTistory(converted, { visibility: 0 }); // 비공개=임시저장
      await updateDraftStatus(draftId, "published");
    }

    if (plan.blog_naver) {
      const converted = await convertBlog(blogResult, "naver");
      await saveDraft(brand.id, "naver", converted);
      // 네이버: 알림만 (수동 또는 Cowork 브라우저 자동화)
    }

    if (plan.blog_medium) {
      const converted = await convertBlog(blogResult, "medium");
      await saveDraft(brand.id, "medium", converted);
    }

    // Step 6: 데일리 리포트
    await createDailyReport(brand.id, { /* 결과 요약 */ });
  }
}

// 주제 선정 함수
async function pickTopic(brandId: string): Promise<string> {
  // 1순위: topic_pool에서 pending + priority 높은 것
  const { data: poolTopic } = await supabase
    .from("topic_pool")
    .select("*")
    .eq("brand_id", brandId)
    .eq("status", "pending")
    .order("priority", { ascending: false })
    .order("created_at", { ascending: true })
    .limit(1)
    .single();

  if (poolTopic) {
    // 사용 처리
    await supabase
      .from("topic_pool")
      .update({ status: "used", used_at: new Date().toISOString() })
      .eq("id", poolTopic.id);
    return poolTopic.topic;
  }

  // 2순위: AI 트렌드 기반 자동 생성
  return await generateTrendTopic(brandId);
}
```

---

## 4. 트렌드 기반 주제 자동 생성

### 신규 API — `app/api/geo/topic-suggest/route.ts`

```ts
// POST /api/geo/topic-suggest
// Body: { brand_id: string, count?: number }
// Response: { topics: { topic: string, reader_stage: string, search_intent: string, reason: string }[] }

// AI에게 요청:
// - 브랜드 fact_data + 최근 GEO 체크 결과 + 시즌 정보를 주고
// - 검색 트렌드에 맞는 블로그 주제 3~5개 제안받기
// - 이미 생성된 글 주제(frandoor_blog_drafts)와 중복 체크

// 프롬프트 예시:
// "당신은 프랜차이즈 창업 블로그 편집장입니다.
//  [브랜드 정보]와 [최근 GEO 점수]를 보고,
//  이번 주에 작성하면 좋을 블로그 주제 5개를 제안하세요.
//  이미 작성된 주제: [기존 주제 리스트]
//  현재 시즌: 4월 (봄 창업 시즌)
//  각 주제에 reader_stage와 search_intent를 함께 제안하세요."
```

---

## 5. Cowork 브라우저 자동화 (네이버 블로그)

> 이 부분은 Cowork 세션에서 실행. 그룹웨어 cron과 별개.

재민님 PC가 켜져 있고 크롬에 네이버 로그인된 상태라면,
Cowork 스케줄 태스크로 아래 프로세스를 자동 실행할 수 있음:

```
1. frandoor_blog_drafts에서 status="draft" & channel="naver"인 글 조회
2. 네이버 블로그 에디터 열기 (blog.naver.com/tnscompany1 또는 새 블로그)
3. 글쓰기 버튼 클릭
4. 제목 입력
5. 본문에 변환된 텍스트 붙여넣기
6. 임시저장 클릭
7. draft status → "published" 업데이트
```

단, 이건 **Cowork 스케줄 태스크**로 구현해야 하고,
그룹웨어 cron과는 별도 실행됨.
→ 그룹웨어 cron이 draft를 만들어놓으면, Cowork가 10분 뒤에 와서 임시저장 처리.

---

## 6. 프론트 UI 추가

### 6-1. 주간 스케줄 — DB 연동

기존 localStorage 기반 → DB 기반으로 전환.
UI는 그대로 유지하되, CRUD를 API 호출로 변경.

```
신규 API:
├── GET  /api/geo/schedule          ← 전체 주간 스케줄 조회
├── POST /api/geo/schedule          ← 브랜드-요일 배정
└── DELETE /api/geo/schedule/:id    ← 배정 해제
```

### 6-2. 주제 풀 관리 UI

frandoor 페이지 블로그 탭에 "주제 관리" 서브탭 추가:

```
[주제 추가] 입력폼
  - 브랜드 선택
  - 주제 텍스트 입력
  - reader_stage 드롭다운
  - search_intent 드롭다운
  - 우선순위

[AI 주제 제안] 버튼
  → /api/geo/topic-suggest 호출
  → 제안된 주제를 리스트로 표시
  → 체크박스로 선택 → topic_pool에 일괄 추가

[주제 큐] 테이블
  - 대기 중 / 사용됨 / 건너뜀 필터
  - 드래그로 우선순위 변경
```

### 6-3. 자동화 대시보드

```
[오늘의 자동화 현황]
  ┌─────────────────────────────────────┐
  │ 오공김밥 (월요일)                     │
  │ ✅ GEO 체크: 82점 (+2)              │
  │ ✅ Frandoor: 생성 완료               │
  │ ✅ 티스토리: 임시저장 완료            │
  │ ⏳ 네이버: 대기 중 (Cowork 처리)     │
  │ ⬚ Medium: OFF                        │
  └─────────────────────────────────────┘
```

---

## 7. 타임라인

```
[매일 오전 9:00] Vercel Cron 트리거
  │
  ├─ 9:00~9:05  Step 0-1: 브랜드 확인 + GEO 체크
  ├─ 9:05~9:10  Step 2: 주제 선정
  ├─ 9:10~9:15  Step 3: Frandoor 블로그 생성 (AI 호출)
  ├─ 9:15~9:17  Step 4: 플랫폼별 변환
  ├─ 9:17~9:18  Step 5a: 티스토리 임시저장 (API)
  ├─ 9:18~9:20  Step 6: 데일리 리포트
  │
  ├─ 9:30       Cowork 스케줄 태스크 실행 (재민님 PC)
  │             → 네이버 블로그 임시저장 (브라우저 자동화)
  │
  └─ 재민님 출근 후
                → 그룹웨어 대시보드에서 현황 확인
                → 임시저장된 글 검토
                → 게시 버튼 클릭 (1분 소요)
```

---

## 8. 구현 순서

```
Phase 1 (DB 기반 전환):
  1. weekly_schedule 테이블 생성 + API
  2. topic_pool 테이블 생성 + API
  3. frandoor/page.tsx 주간 스케줄 DB 연동
  4. 주제 풀 관리 UI 추가

Phase 2 (크론 파이프라인):
  5. frandoor-daily/route.ts 리팩토링 (이 스펙 기준)
  6. topic-suggest API 추가
  7. 플랫폼별 변환 연동 (BLOG_CONVERT_SPEC)
  8. 티스토리 자동 임시저장 연동

Phase 3 (Cowork 연동):
  9. Cowork 스케줄 태스크 생성 (네이버 브라우저 자동화)
  10. 자동화 대시보드 UI

Phase 4 (고도화):
  11. Medium API 연동
  12. GEO 점수 하락 → 자동 복구 글 생성
  13. A/B 테스트 (provider별 성과 비교)
```

---

## 9. 하지 말 것

- frandoor/page.tsx 전체 리팩토링 금지 (2,734줄. 필요한 부분만 수정)
- Vercel Cron 설정은 이 스펙 범위 밖 (vercel.json에 cron 추가는 별도)
- 네이버 블로그 API 연동 시도 금지 (공식 API 없음)
- Medium API는 Phase 4에서 별도 SPEC으로

---

*AUTOMATION_PIPELINE_SPEC v1.0 | 2026.04.09 | 프랜도어*
*Claude Code 전달용 — Phase 1-2를 먼저 실행*
