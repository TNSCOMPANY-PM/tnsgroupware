# GEO_DEMO_SPEC

> Frandoor 대시보드에 GEO 시연 모드 추가
> 대표님이 모바일로 들고다니며 클라이언트에게 시연할 용도
> 대상 파일: `app/(groupware)/frandoor/page.tsx` + 새 API 라우트

---

## 1. 개요

Frandoor 대시보드에 **"GEO 시연"** 버튼을 추가한다.
기존 GEO 체크는 등록된 브랜드 전용이지만, 시연 모드는 **아무 브랜드명+카테고리만 입력하면 즉석에서 GEO 체크를 돌려주는** 기능이다.

용도: 영업 미팅에서 "지금 귀사 브랜드가 AI 검색에 얼마나 노출되는지 바로 보여드리겠습니다" 시연용.

---

## 2. UI 설계

### 2-1. 진입점

Frandoor 대시보드 상단에 **"GEO 시연"** 버튼 추가 (기존 "+ 브랜드 추가" 옆).
- 버튼 스타일: 보라색 또는 구분 가능한 액센트 컬러
- 아이콘: 🎯 또는 play 아이콘
- 모바일에서도 잘 보이도록 충분한 터치 영역 (최소 44x44px)

### 2-2. 입력 폼 (모달 또는 별도 페이지)

모바일 최적화 필수. 입력 항목 2개만:

```
┌─────────────────────────────────┐
│  🎯 GEO 시연 체크               │
│                                  │
│  브랜드명 *                      │
│  ┌─────────────────────────┐    │
│  │ 예: 오공김밥              │    │
│  └─────────────────────────┘    │
│                                  │
│  카테고리 *                      │
│  ┌─────────────────────────┐    │
│  │ 선택 ▼                   │    │
│  └─────────────────────────┘    │
│  김밥 / 분식 / 치킨 / 피자 /    │
│  커피 / 베이커리 / 한식 / 중식 / │
│  일식 / 패스트푸드 / 기타(직접입력)│
│                                  │
│  [ GEO 체크 시작 → ]            │
└─────────────────────────────────┘
```

카테고리 목록은 DB 또는 상수로 관리. 추후 카테고리 추가/삭제 가능하게.

### 2-3. 프롬프트 자동 생성 규칙

입력된 **브랜드명**과 **카테고리**를 기존 25개 프롬프트 템플릿에 주입:

#### D0 개인창업 탐색 (노출용 5개) — 그대로 사용 (브랜드 무관)
```
1. 돈 별로 없는데 뭐 창업하면 좋아?
2. 퇴직금으로 창업할 수 있는 거 뭐야?
3. 개인 식당 차리면 실패율이 왜 높아?
4. 처음 창업할 때 가장 많이 실수하는 게 뭐야?
5. 혼자 음식점 차리는 거랑 프랜차이즈랑 뭐가 더 나아?
```

#### D1 프랜차이즈 탐색 (노출용 5개) — 그대로 사용 (브랜드 무관)
```
1. 실투자금 적게 창업할 수 있는 프랜차이즈 있어?
2. 투자 회수 빠른 프랜차이즈 창업 추천해줘
3. 소자본 프랜차이즈 창업 뭐가 좋아?
4. 초보자도 할 수 있는 프랜차이즈 업종 뭐야?
5. 1인 운영 가능한 소형 프랜차이즈 뭐야?
```

#### D2 {카테고리} 카테고리 (노출용 8개) — 카테고리명 치환
```
1. {카테고리} 프랜차이즈 월매출 얼마나 나와?
2. 소자본 {카테고리} 프랜차이즈 추천해줘
3. {카테고리} 프랜차이즈 창업비용 얼마나 해?
4. {카테고리} 프랜차이즈 마진이 어떻게 돼?
5. {카테고리} 프랜차이즈 투자 회수 빠른 곳 어디야?
6. {카테고리} 프랜차이즈 로열티 얼마야?
7. {카테고리} 프랜차이즈 브랜드 어디어디 있어?
8. {카테고리} 프랜차이즈 혼자 운영 가능해?
```

#### D3 {브랜드명} 직접 (정확도 7개) — 브랜드명 치환
```
1. {브랜드명} 창업비용 얼마야?
2. {브랜드명} 마진 어떻게 돼?
3. {브랜드명} 월매출 얼마야?
4. {브랜드명} 몇 명이서 운영해?
5. {브랜드명} 몇 평이 적당해?
6. {브랜드명} 투자 회수 기간 얼마나 걸려?
7. {브랜드명} 다른 {카테고리} 브랜드랑 뭐가 달라?
```

### 2-4. 프롬프트 관리 기능

시연용 프롬프트 25개를 별도로 관리할 수 있는 설정 화면:
- 프롬프트 목록 보기/수정/삭제/추가
- D0~D3 카테고리별 그룹핑
- `{브랜드명}`, `{카테고리}` 플레이스홀더 사용
- 저장 위치: DB 테이블 `geo_demo_prompts` 또는 Supabase

```sql
CREATE TABLE geo_demo_prompts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  category TEXT NOT NULL, -- 'D0', 'D1', 'D2', 'D3'
  category_label TEXT NOT NULL, -- '개인창업 탐색', '프랜차이즈 탐색', '{카테고리} 카테고리', '{브랜드명} 직접'
  prompt_template TEXT NOT NULL, -- '{카테고리} 프랜차이즈 월매출 얼마나 나와?'
  sort_order INT DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);
```

---

## 3. GEO 체크 실행 로직

### 3-1. API 라우트

`app/api/geo/demo-check/route.ts`

```typescript
// POST body
{
  brand_name: string;    // "오공김밥"
  category: string;      // "김밥"
}

// 처리 흐름
1. geo_demo_prompts 테이블에서 is_active=true 프롬프트 로드
2. 프롬프트 템플릿에서 {브랜드명} → brand_name, {카테고리} → category 치환
3. 기존 GEO 체크 로직과 동일하게 실행:
   - 각 프롬프트를 ChatGPT/Perplexity/Gemini에 질의
   - 응답에서 브랜드명 언급 여부 확인 (노출률)
   - D3 프롬프트는 정확도 체크 (응답 내용이 사실과 부합하는지)
4. 결과 반환 (DB 저장은 선택적 — 시연용이므로 임시 저장 or 저장 안 함)

// 응답
{
  brand_name: string;
  category: string;
  checked_at: string;
  summary: {
    total_prompts: 25,
    exposure_count: number,     // D0~D2에서 브랜드 언급된 수
    exposure_rate: number,      // 노출률 %
    accuracy_count: number,     // D3에서 정확한 답변 수
    accuracy_rate: number,      // 정확도 %
  },
  results: {
    category: 'D0' | 'D1' | 'D2' | 'D3';
    prompt: string;
    ai_response: string;       // AI 답변 원문 (요약)
    brand_mentioned: boolean;  // 노출 여부
    is_accurate?: boolean;     // D3만: 정확도
    source_ai: string;         // 'chatgpt' | 'perplexity' | 'gemini'
  }[]
}
```

### 3-2. 실행 중 UI (모바일 최적화)

체크 중 진행 상황 실시간 표시:

```
┌─────────────────────────────────┐
│  🎯 오공김밥 GEO 체크 중...      │
│                                  │
│  ████████████░░░░  18/25        │
│                                  │
│  ✅ D0 개인창업 탐색 (5/5)       │
│  ✅ D1 프랜차이즈 탐색 (5/5)     │
│  🔄 D2 김밥 카테고리 (3/8)       │
│  ⏳ D3 오공김밥 직접 (0/7)       │
│                                  │
│  현재: "김밥 프랜차이즈 마진이    │
│  어떻게 돼?" 확인 중...          │
└─────────────────────────────────┘
```

---

## 4. 리포트 화면 (모바일 최적화 핵심)

### 4-1. 리포트 헤더

```
┌─────────────────────────────────┐
│  Frandoor GEO 리포트             │
│                                  │
│  오공김밥                        │
│  김밥 카테고리 | 2026.04.09      │
│                                  │
│  ┌───────┐  ┌───────┐           │
│  │  12%  │  │   0%  │           │
│  │ AI노출 │  │ 정확도 │           │
│  └───────┘  └───────┘           │
│  25개 프롬프트 중 3개 노출        │
│  D3 7개 중 0개 정확              │
└─────────────────────────────────┘
```

### 4-2. 카테고리별 상세 결과

각 카테고리를 아코디언으로 접기/펼치기:

```
┌─────────────────────────────────┐
│ ▼ D0 개인창업 탐색  0/5 노출     │
│ ─────────────────────────────── │
│ ❌ 돈 별로 없는데 뭐 창업하면..  │
│    → 노출 안 됨                  │
│ ❌ 퇴직금으로 창업할 수 있는..   │
│    → 노출 안 됨                  │
│ ...                              │
│                                  │
│ ▼ D2 김밥 카테고리  2/8 노출     │
│ ─────────────────────────────── │
│ ✅ 김밥 프랜차이즈 월매출 얼마..  │
│    → "오공김밥" 언급됨           │
│ ❌ 소자본 김밥 프랜차이즈...     │
│    → 노출 안 됨                  │
│ ...                              │
│                                  │
│ ▼ D3 오공김밥 직접  0/7 정확     │
│ ─────────────────────────────── │
│ ❌ 오공김밥 창업비용 얼마야?     │
│    → AI 답변: "정확한 정보를      │
│      확인하기 어렵습니다"         │
│ ...                              │
└─────────────────────────────────┘
```

### 4-3. 인사이트 요약

```
┌─────────────────────────────────┐
│  💡 AI 추천 인사이트              │
│                                  │
│  • D0~D1(일반 창업 질문)에서     │
│    브랜드 노출이 0%입니다.        │
│    → 블로그 콘텐츠로 일반 창업    │
│    키워드 커버 필요               │
│                                  │
│  • D2(김밥 카테고리)에서 2/8     │
│    노출. 카테고리 내 인지도는     │
│    있으나 개선 여지 있음          │
│                                  │
│  • D3(브랜드 직접)에서 정확한    │
│    답변 0%. 팩트데이터 구축 및    │
│    GEO 최적화 콘텐츠 필요        │
│                                  │
│  ────────────────────────────── │
│  Frandoor GEO 서비스로           │
│  AI 검색 노출을 개선하세요.       │
│  frandoor.co.kr                  │
└─────────────────────────────────┘
```

---

## 5. 카카오톡 공유 기능

### 5-1. 카카오톡 공유 버튼

리포트 하단에 "카카오톡으로 공유" 버튼 배치.

### 5-2. 공유 방식: 카카오 링크 API (JavaScript SDK)

카카오 개발자 앱 등록 필요 (JavaScript 키 발급).

```typescript
// 카카오 SDK 초기화 (layout.tsx 또는 해당 페이지에서)
// <script src="https://t1.kakaocdn.net/kakao_js_sdk/2.7.4/kakao.min.js"></script>
// Kakao.init('YOUR_JAVASCRIPT_KEY');

function shareToKakao(report: DemoReport) {
  Kakao.Share.sendDefault({
    objectType: 'feed',
    content: {
      title: `${report.brand_name} GEO 리포트`,
      description: `AI 노출률 ${report.summary.exposure_rate}% | 정확도 ${report.summary.accuracy_rate}% — ${report.summary.total_prompts}개 프롬프트 체크 완료`,
      imageUrl: 'https://frandoor.co.kr/og-geo-report.png', // OG 이미지 (별도 제작)
      link: {
        mobileWebUrl: report.share_url,  // 리포트 공유 URL
        webUrl: report.share_url,
      },
    },
    buttons: [
      {
        title: '리포트 보기',
        link: {
          mobileWebUrl: report.share_url,
          webUrl: report.share_url,
        },
      },
      {
        title: 'GEO 서비스 알아보기',
        link: {
          mobileWebUrl: 'https://frandoor.co.kr',
          webUrl: 'https://frandoor.co.kr',
        },
      },
    ],
  });
}
```

### 5-3. 공유 URL 생성

시연 결과를 공유 가능한 URL로 만들어야 함:

**방법 A (권장): 결과를 DB에 저장하고 고유 URL 발급**

```
https://tnsgroupware.vercel.app/frandoor/demo/report/{report_id}
```

이 URL은 로그인 없이 접근 가능한 퍼블릭 페이지로 구현.

```sql
CREATE TABLE geo_demo_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_name TEXT NOT NULL,
  category TEXT NOT NULL,
  checked_at TIMESTAMPTZ DEFAULT now(),
  summary JSONB NOT NULL,
  results JSONB NOT NULL,
  is_public BOOLEAN DEFAULT true,
  expires_at TIMESTAMPTZ DEFAULT (now() + interval '30 days') -- 30일 후 자동 만료
);
```

**방법 B (간단): 결과 데이터를 URL 파라미터로 압축 전달**
- 데이터가 커서 비추천

### 5-4. 공유 리포트 페이지 (퍼블릭)

`app/(public)/frandoor/demo/report/[id]/page.tsx`

- 로그인 불필요
- 모바일 최적화
- 리포트 내용 + Frandoor 브랜딩
- 하단 CTA: "우리 브랜드도 GEO 체크하기 → frandoor.co.kr"
- 30일 후 자동 만료 (만료 시 "리포트가 만료되었습니다" 안내)

---

## 6. 모바일 최적화 체크리스트

시연 용도이므로 모바일 UX가 최우선:

- [ ] 입력 폼: 큰 입력 필드, 드롭다운 대신 바텀시트 셀렉터
- [ ] 진행 중: 실시간 프로그레스 바, 현재 처리 중인 프롬프트 표시
- [ ] 리포트: 카드형 레이아웃, 아코디언 접기/펼치기, 스와이프 가능
- [ ] 공유 버튼: 하단 고정(sticky), 충분한 터치 영역
- [ ] 전체 페이지 최대 너비 480px 기준 설계
- [ ] 폰트 사이즈 최소 16px (모바일 줌 방지)
- [ ] 로딩/체크 중에도 화면 꺼짐 방지 (Wake Lock API 고려)

---

## 7. 구현 파일 목록

```
app/(groupware)/frandoor/page.tsx          — "GEO 시연" 버튼 추가
app/(groupware)/frandoor/demo/page.tsx     — 시연 입력 폼 + 결과 화면
app/(public)/frandoor/demo/report/[id]/page.tsx — 공유용 퍼블릭 리포트
app/api/geo/demo-check/route.ts           — 시연용 GEO 체크 API
app/api/geo/demo-prompts/route.ts         — 프롬프트 CRUD API
supabase_migrations/geo_demo.sql           — geo_demo_prompts + geo_demo_reports 테이블
```

---

## 8. 구현 순서

1. **DB 테이블 생성** — geo_demo_prompts (초기 데이터 25개 삽입), geo_demo_reports
2. **프롬프트 관리 API** — CRUD + 기본 25개 seed
3. **demo-check API** — 프롬프트 로드 → 치환 → GEO 체크 실행 → 결과 저장 → 공유 URL 반환
4. **시연 입력 폼 UI** — 모바일 최적화, 브랜드명 + 카테고리 입력
5. **리포트 화면** — 요약 + 카테고리별 상세 + 인사이트
6. **카카오톡 공유** — SDK 연동 + 공유 URL + 퍼블릭 리포트 페이지
7. **프롬프트 관리 UI** — 설정에서 프롬프트 편집 가능하게

---

## 9. 카카오 개발자 설정 필요사항 (수동)

코드 구현 전 아래 설정이 필요:
1. [Kakao Developers](https://developers.kakao.com/) 앱 등록
2. JavaScript 키 발급
3. 도메인 등록: `tnsgroupware.vercel.app`
4. 카카오링크 메시지 템플릿 검수 (필요시)
5. `.env.local`에 `NEXT_PUBLIC_KAKAO_JS_KEY` 추가
