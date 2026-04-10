# scripts/publish — 블로그 자동 발행

Playwright 기반 Medium / 티스토리 업로드 자동화.

## 설치

```bash
npm install
npx playwright install chromium
```

## 디렉토리

```
scripts/publish/
├── types.ts              # 공통 타입
├── lib/browser.ts        # Playwright 컨텍스트 팩토리
├── auth-setup.ts         # 로그인 세션 최초 저장
├── medium-publish.ts     # Medium 발행 (Import / Paste)
├── tistory-publish.ts    # 티스토리 발행 (Paste)
├── run.ts                # CLI 엔트리 (JSON 입력 → 채널 디스패치)
├── .sessions/            # 로그인 쿠키 저장소 (gitignore)
└── examples/             # 샘플 article JSON
```

## 최초 1회: 로그인 세션 저장

각 채널마다 한 번씩 실행 → 브라우저 열리면 수동 로그인 → 홈 이동 시 자동 저장.

```bash
npm run publish:auth medium
npm run publish:auth tistory
```

세션은 `scripts/publish/.sessions/medium.json`, `tistory.json`에 저장되며 `.gitignore`에 이미 등록됨.

## 발행 실행

```bash
npm run publish:run <article.json>
```

### article.json 포맷

```json
{
  "channel": "medium",
  "mode": "import",
  "title": "오공김밥 창업 비용·매출·지원 혜택 완전 정리 (2026)",
  "sourceUrl": "https://frandoor.co.kr/ogong/article",
  "tags": ["franchise", "f-and-b", "korea", "geo", "ogong"],
  "visibility": "public"
}
```

**Medium (import 모드, 권장)** — `sourceUrl`을 Medium `Import a story`에 넣어 canonical URL이 본 도메인으로 자동 세팅된다. GEO 관점에서 가장 깔끔한 방식.

**Medium (paste 모드)** — `sourceUrl` 대신 `contentHtml`로 직접 붙여넣기. 본 도메인 발행 전이라도 사용 가능.

**티스토리 (paste 모드)** — `contentHtml` 필수. 티스토리 에디터 HTML 모드로 직접 주입.

필드 정리:

| 필드 | Medium import | Medium paste | 티스토리 paste |
| --- | --- | --- | --- |
| `channel` | `"medium"` | `"medium"` | `"tistory"` |
| `mode` | `"import"` | `"paste"` | `"paste"` |
| `title` | 필수 | 필수 | 필수 |
| `sourceUrl` | 필수 | — | — |
| `contentHtml` | — | 필수 | 필수 |
| `tags` | 선택 (5개 제한) | 선택 | 선택 |
| `visibility` | `draft`/`public` | `draft`/`public` | `draft`/`public` |

## 주의

- **대량 반복 금지**: Medium·티스토리 모두 봇 탐지가 있음. 하루 1~2건 수준으로 유지.
- **UI 변경 리스크**: selector가 깨지면 `publish`/`import` 버튼 탐색 부분을 수정해야 함.
- **헤드리스 금지 권장**: 캡차가 뜰 경우 직접 풀 수 있도록 `headless: false`가 기본.
- **세션 탈취 주의**: `.sessions/` 파일이 유출되면 계정이 노출됨. 절대 커밋·공유 금지.

## AUTOMATION_PIPELINE_SPEC 연동

Phase 3(크론 → 자동 발행) 단계에서 이 스크립트가 다음 역할을 한다:

```
frandoor_blog_drafts (status=draft, channel=medium|tistory)
        │
        ▼
cron 트리거 → draft 데이터를 article.json으로 export
        │
        ▼
npm run publish:run /tmp/ogong-medium.json
        │
        ▼
draft 업데이트 (status=published, published_url=<result.postUrl>)
```

현재 단계(MVP)에서는 CLI 수동 실행 → 결과 확인까지가 목표.
