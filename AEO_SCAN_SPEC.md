# AEO 스캔 시스템 (Google AI Overview / 네이버 AI 브리핑)

Playwright 기반 실제 브라우저 스캐너로 frandoor 콘텐츠가 AI 검색 답변에 인용됐는지 확인한다.

## 왜 필요한가

기존 `/api/geo/aeo-ai-check` 는 OpenAI `web_search_preview` 툴을 써서 GPT가 *대신* 검색해서 요약하는 프록시 방식이라 **진짜 AI Overview / AI 브리핑 citation 과는 다르다**. 실제 노출 여부를 보려면 실제 브라우저로 해당 페이지를 열어야 한다.

Google은 Vercel 서버리스에서 Playwright 브라우저 다운로드를 막아놨기 때문에(`vercel.json`의 `PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1`), 스캔은 **로컬 Windows 머신**에서 실행한다.

## 구조

```
┌────────────────────────────────────────┐
│ 웹 UI (frandoor 페이지 → AEO 탭)         │
│  - 🌐 실제 브라우저 스캔 버튼            │
│  - POST /api/geo/aeo-scan-queue         │
└──────────────┬─────────────────────────┘
               │ 큐에 pending 등록
               ▼
┌────────────────────────────────────────┐
│ Supabase: aeo_scan_queue               │
│  - status: pending/running/done/failed │
└──────────────┬─────────────────────────┘
               │ 60초 폴링
               ▼
┌────────────────────────────────────────┐
│ 로컬 워커 (scripts/aeo-scan-worker.ts)   │
│  - 백그라운드로 실행                      │
│  - pending 작업 처리                     │
└──────────────┬─────────────────────────┘
               │ spawn
               ▼
┌────────────────────────────────────────┐
│ Playwright 스캐너 (scripts/aeo-scan.ts)  │
│  - Chromium 헤드리스 실행                │
│  - 각 키워드로 Google/Naver 검색         │
│  - AI Overview/브리핑 DOM 파싱          │
│  - citation URL 추출 + frandoor 매칭    │
│  - aeo_check_runs 에 저장               │
└────────────────────────────────────────┘

(스케줄 자동 실행은 추후 필요 시 start-aeo-worker.bat 패턴과 동일하게 Task Scheduler 에 추가하면 됨 — 현재는 웹 UI 수동 트리거만 사용)
```

## 설치

### 1. Supabase 마이그레이션

Supabase Dashboard → SQL Editor 에서 실행:

```
supabase_migrations/aeo_scan_queue.sql
```

`aeo_keywords`와 `aeo_check_runs` 테이블은 이미 존재한다고 가정.

### 2. Playwright 브라우저 설치 (로컬 PC 1회만)

```bash
cd groupware
npx playwright install chromium
```

### 3. 환경변수

`.env.local` 에 다음이 있어야 함 (이미 있을 것):
```
NEXT_PUBLIC_SUPABASE_URL=...
SUPABASE_SERVICE_ROLE_KEY=...
```

## 사용법

### 수동 스캔 (CLI)

```bash
# 기본: 프랜도어 브랜드, google + naver 둘 다
npm run aeo:scan

# 플랫폼 지정
npm run aeo:scan:google
npm run aeo:scan:naver

# 디버그 모드 (headful + 스크린샷 + 3개 키워드만)
npm run aeo:scan:debug

# 옵션 조합
npx tsx scripts/aeo-scan.ts --brand=프랜도어 --platform=naver --keywords=10 --headful
```

### 수동 스캔 (웹 UI)

1. 프랜도어 페이지 → AEO 탭
2. 좌측 패널에서 Google/네이버 선택
3. "🌐 실제 브라우저 스캔 (Playwright)" 클릭
4. 큐에 등록됨 → 로컬 워커가 수분 내 처리
5. 완료 후 페이지 새로고침하면 결과 반영

### 백그라운드 워커 실행 (핵심)

웹 UI "실제 브라우저 스캔" 버튼은 큐 테이블에 pending 만 등록한다. 실제 스캔을 돌리려면 로컬 Windows PC 에서 워커가 **24시간 상주**하며 60초마다 큐를 폴링해야 한다.

기존 `start-pushbullet-silent.vbs` 와 동일 패턴으로 만들어뒀다:

- `start-aeo-worker.bat` — 무한 루프 + 오류 시 10초 후 재시작 (콘솔 창 뜸)
- `start-aeo-worker-silent.vbs` — 위 bat 을 콘솔 창 없이 백그라운드로 실행

**1회만 설정**:

1. `Win + R` → `shell:startup` (현재 사용자의 시작프로그램 폴더 열림)
2. 그 폴더에 `start-aeo-worker-silent.vbs` 의 **바로가기(shortcut)** 를 만듦 (파일 자체를 옮기지 말고 우클릭 → 바로가기 만들기)
3. Windows 재부팅 또는 수동으로 `start-aeo-worker-silent.vbs` 더블클릭 → 워커가 백그라운드에서 상주 시작
4. 로그: `logs/aeo-worker.log` (재시작되어도 append 모드라 누적됨)
5. 작업 관리자 → "세부 정보" 탭에서 `node.exe` 프로세스 확인하면 동작 중인지 볼 수 있음
6. 종료하려면 작업 관리자에서 `node.exe` / `cmd.exe` (제목: "AEO 스캔 워커") 종료

**디버그용 포그라운드 실행** (콘솔에 로그 실시간 보고 싶을 때):

```bash
npm run aeo:worker
```

## 결과 저장 구조

모든 결과는 기존 `aeo_check_runs` 테이블에 저장:

- `platform`: `aeo_google` 또는 `aeo_naver`
- `total_keywords`, `cited_count`, `score`
- `results` (JSONB): 키워드별 상세
  - `keyword`, `cited`, `our_mentions`, `ai_summary`, `source_urls`
  - **추가 필드 (Playwright 전용)**:
    - `ai_block_found`: AI Overview/브리핑 블록이 뜬 키워드인지
    - `our_urls`: 매칭된 실제 URL 목록
    - `sources`: 구조화된 citation 목록 `[{title, url, domain}]`
    - `screenshot_path`: 스크린샷 경로
    - `scan_method`: `"playwright"`
    - `scanned_at`: 타임스탬프

기존 UI (프랜도어 페이지 AEO 탭) 는 platform 기반으로 최근 run 을 보여주므로, Playwright가 써넣으면 자동으로 반영됨.

## 주의사항 / 한계

### Google
- **봇 탐지 회피**: user-agent, viewport, locale, 4~8초 랜덤 딜레이, `navigator.webdriver` 숨김. 일부 키워드는 CAPTCHA 로 튕길 수 있음 → 로그 확인 필요.
- **AI Overview는 모든 키워드에 뜨지 않음**: 질문형 쿼리("~하는 법", "~뭐가 좋아") 에서 주로 발현. 커머셜 키워드는 대체로 안 뜸. 결과의 `ai_block_found: false` 는 정상 케이스.
- **개인화 영향**: `pws=0` 으로 개인화 비활성화. 그래도 지역(`gl=kr`, `hl=ko`) 은 고정.
- **DOM 변경**: Google이 AI Overview DOM 구조를 자주 바꿈 → `scanGoogleKeyword` 내부 셀렉터 로직 (텍스트 "AI 개요" 기반 + attrid fallback) 을 상황에 맞게 수정.

### 네이버
- **AI 브리핑은 `Cue:` 대체**: 2026년 4월 기준 `Cue:`는 종료되고 AI 브리핑만 살아있음.
- **DOM 구조 불안정**: 네이버는 실험 단계라 자주 바뀜. 여러 셀렉터 + 텍스트 fallback 병용.
- **모바일/PC 차이**: 현재는 PC (`search.naver.com`) 기준. 모바일 결과를 보려면 `m.search.naver.com` + 모바일 user-agent 로 변경 필요.
- 네이버는 봇 탐지가 구글보다 느슨해서 레이트 리밋 덜 걸림.

### 성능
- 키워드당 약 10~15초 (대기 포함)
- 500 키워드 = 약 80~120분 × 2 플랫폼 = 약 3~4시간
- 주 5회 실행, 500 키워드 이하 가정 — 충분히 돌 수 있음

## 디버깅

스캔이 이상하면 먼저 headful + debug 모드로:

```bash
npm run aeo:scan:debug
```

- 실제 브라우저 창이 뜨고
- 3개 키워드만 돌고
- 모든 스크린샷 저장됨 (`screenshots/aeo/YYYY-MM-DD_*.png`)
- 콘솔에 상세 로그 출력

DOM 이 잡히지 않으면 스크린샷으로 실제 AI Overview/브리핑 구조 확인 후 `aeo-scan.ts` 의 셀렉터 로직 업데이트.

## 확장 아이디어

- **GSC API 연동**: frandoor.co.kr 의 Google Search Console impression 급변 URL 을 교차검증 (보조 지표)
- **네이버 서치어드바이저 스크래퍼**: 웹마스터 도구 리포트에서 AI 브리핑 유입 의심 URL 추출
- **히스토리 대시보드**: `aeo_check_runs` 를 날짜별로 시각화해서 인용률 추이 확인
- **알림**: 특정 키워드가 처음 인용되거나 빠졌을 때 Pushbullet 으로 알림
