# SECURITY_AUDIT_SPEC — 그룹웨어 보안 긴급 수정

> 2026-04-09 보안 감사 결과
> 심각도: 🔴 CRITICAL
> 즉시 조치 필요

---

## 🔴 CRITICAL 1: .env.local에 모든 API 키가 노출됨

`.env.local` 파일에 라이브 시크릿 키가 전부 들어있고, `.claude/settings.local.json`에도 중복 노출되어 있음.

**노출된 키 목록:**
- Supabase Service Role Key (전체 DB 접근 가능)
- OpenAI API Key
- Anthropic API Key
- Google Service Account 전체 JSON (private RSA key 포함)
- Naver Search API Client ID + Secret
- Google CSE API Key
- Pushbullet API Key
- 마스터 계정 비밀번호 (`tnsMaster1!`)

**조치:**
1. 모든 키 즉시 폐기 후 재발급
2. `.env.local`이 git history에 포함되어 있으면 `git filter-repo`로 완전 삭제
3. `.claude/settings.local.json`에서 하드코딩된 토큰 제거
4. Vercel 환경변수로만 관리, 로컬에는 `.env.local.example`만 유지

---

## 🔴 CRITICAL 2: API 라우트 35개 이상 인증 없음

100개 이상의 API 라우트 중 35개 이상이 인증 체크 없이 접근 가능.

### 인증 없는 고위험 엔드포인트

**금융 데이터 완전 노출:**
| 라우트 | 메서드 | 위험 |
|--------|--------|------|
| `/api/finance` | GET | 전체 재무 원장 노출 |
| `/api/finance/forecast` | GET | 매출 예측 데이터 노출 |
| `/api/finance/anomalies` | GET | 이상거래 탐지 데이터 노출 |
| `/api/transactions` | GET | 미매칭 거래 내역 노출 |
| `/api/transactions/ledger` | GET | 거래 원장 노출 |
| `/api/transactions/[id]/approve` | POST | 누구나 거래 승인 가능 |
| `/api/transactions/[id]/match` | POST | 누구나 거래 매칭 가능 |
| `/api/bonus/quarterly` | GET | 성과급 산정 데이터 노출 |

**고객/계약 데이터 노출:**
| 라우트 | 메서드 | 위험 |
|--------|--------|------|
| `/api/contracts` | GET/POST | 전체 계약 열람/생성 가능 |
| `/api/clients/[id]/comments` | GET/POST/DELETE | 고객 코멘트 CRUD 무방비 |
| `/api/clients/next-contact` | GET | 다음 연락 목록 노출 |
| `/api/clients/churn-risk` | GET | 이탈 리스크 점수 노출 |
| `/api/clients/last-deposits` | GET | 고객 입금 이력 노출 |
| `/api/clients/unmatched` | GET | 미매칭 재무 기록 노출 |

**인사/근태 데이터 노출:**
| 라우트 | 메서드 | 위험 |
|--------|--------|------|
| `/api/employees` | GET | 전 직원 정보 노출 |
| `/api/leaves` | GET/POST | 휴가 데이터 열람/생성 |
| `/api/granted-leaves` | GET/POST | 부여 휴가 열람/생성 |
| `/api/planned-leaves` | GET/POST | 휴가 계획 열람/생성 |
| `/api/leave-events` | GET | 승인된 휴가 전체 노출 |

**시스템/관리 노출:**
| 라우트 | 메서드 | 위험 |
|--------|--------|------|
| `/api/server-logs` | GET | 서버 로그 완전 노출 |
| `/api/seed-users/*` | GET | 사용자 계정 생성 가능 (NODE_ENV만 체크) |
| `/api/seed` | GET/POST | DB 시드 가능 |
| `/api/approval-alerts` | GET/PATCH | 결재 알림 조회/수정 |
| `/api/approvals/templates` | GET/POST | 결재 템플릿 접근 |
| `/api/kanban` | GET/POST | 칸반보드 데이터 접근 |

**조치:**
```typescript
// 모든 API 라우트에 아래 패턴 적용
export async function GET(request: Request) {
  const session = await getSessionEmployee();
  if (!session) return unauthorized();
  // ... 기존 로직
}
```

추가로 `middleware.ts`에서 `/api/*` 전체를 인증 필수로 보호하고, 예외 목록만 화이트리스트 처리:
```typescript
// middleware.ts
const PUBLIC_API_ROUTES = [
  '/api/holidays',
  '/api/webhook/deposit', // webhook secret 별도 검증
];

// 나머지 /api/* 는 세션 필수
```

---

## 🔴 CRITICAL 3: Supabase RLS 정책이 전부 USING(true)

20개 이상 테이블에 RLS가 활성화되어 있지만, 정책이 전부 `USING (true)` → **사실상 RLS 없는 것과 동일**.

**영향받는 테이블:**
- `finance` — 익명 사용자도 SELECT/INSERT/UPDATE/DELETE 가능
- `contracts` — 익명 사용자도 SELECT/INSERT/UPDATE 가능
- `leave_requests` — 누구나 CRUD 가능
- `announcements` — 누구나 읽기 가능
- `audit_logs` — 감사 로그 공개 읽기
- `clients` — 익명 읽기 가능
- 그 외 `employees`, `approval_alerts`, `kanban`, `planned_leaves` 등 전부

**가장 위험한 예시:**
```sql
-- 현재 (위험)
CREATE POLICY "anon_select_finance" ON public.finance 
  FOR SELECT TO anon USING (true);
CREATE POLICY "anon_delete_finance" ON public.finance 
  FOR DELETE TO anon USING (true);

-- 익명 사용자가 브라우저 콘솔에서 Supabase JS로 재무 데이터 전체 삭제 가능
```

**조치:**
```sql
-- 1. 모든 anon 정책 삭제
DROP POLICY "anon_select_finance" ON public.finance;
DROP POLICY "anon_insert_finance" ON public.finance;
DROP POLICY "anon_update_finance" ON public.finance;
DROP POLICY "anon_delete_finance" ON public.finance;

-- 2. authenticated 사용자만 허용
CREATE POLICY "authenticated_select_finance" ON public.finance
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "authenticated_insert_finance" ON public.finance
  FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "authenticated_update_finance" ON public.finance
  FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "authenticated_delete_finance" ON public.finance
  FOR DELETE TO authenticated USING (true);

-- 3. 민감 테이블은 role 기반 추가 제한 (장기)
-- 예: finance는 관리자급만 DELETE 가능
```

모든 테이블에 대해 동일하게:
1. `anon` 정책 전부 삭제
2. `authenticated` 기반 정책으로 교체
3. 민감 데이터(finance, contracts, employees)는 role 기반 추가 제한

---

## 🟡 HIGH 4: next.config.ts 보안 헤더 없음

**조치:**
```typescript
// next.config.ts
const securityHeaders = [
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'X-XSS-Protection', value: '1; mode=block' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
  { 
    key: 'Content-Security-Policy', 
    value: "default-src 'self'; script-src 'self' 'unsafe-eval' 'unsafe-inline' https://t1.kakaocdn.net; style-src 'self' 'unsafe-inline';" 
  },
];

const nextConfig = {
  async headers() {
    return [{ source: '/(.*)', headers: securityHeaders }];
  },
};
```

---

## 🟡 HIGH 5: Seed 엔드포인트가 프로덕션에서 접근 가능

`/api/seed-users/*`, `/api/seed`, `/api/seed-master` — NODE_ENV 체크만 하는데, Vercel에서 NODE_ENV은 항상 `production`이라 실제로는 차단됨. 하지만 코드 자체가 존재하는 것이 위험.

**조치:**
1. seed 관련 라우트 파일을 프로덕션 빌드에서 완전 제거
2. 또는 `scripts/` 폴더로 이동하여 CLI에서만 실행 가능하게

---

## 🟡 HIGH 6: 마스터 인증 fallback 시크릿 하드코딩

`utils/masterAuth.ts`에서 `MASTER_SESSION_SECRET`이 없으면 `NEXT_PUBLIC_SUPABASE_ANON_KEY` 또는 `"tns-master-fallback-secret"` 하드코딩 사용.

**조치:**
- fallback 로직 삭제
- `MASTER_SESSION_SECRET` 없으면 에러 throw

---

## 🟡 MEDIUM 7: Webhook 시크릿 검증이 선택적

`/api/webhook/deposit/route.ts`에서 `WEBHOOK_SECRET`이 설정 안 되어 있으면 검증 자체를 스킵.

**조치:**
```typescript
const webhookSecret = process.env.WEBHOOK_SECRET?.trim();
if (!webhookSecret) {
  return NextResponse.json({ error: "Webhook secret not configured" }, { status: 500 });
}
// ... 검증 로직
```

---

## 🟡 MEDIUM 8: SQL Injection 가능성

`/api/webhook/deposit/route.ts`에서 `.like()`, `.ilike()` 호출 시 사용자 입력을 직접 삽입.

**조치:**
```typescript
// LIKE 패턴 특수문자 이스케이프
function escapeLike(str: string): string {
  return str.replace(/%/g, '\\%').replace(/_/g, '\\_');
}
// 사용
.ilike("description", `%${escapeLike(rawName)}%`)
```

---

## 구현 우선순위

| 순서 | 항목 | 심각도 | 예상 소요 |
|------|------|--------|----------|
| 1 | API 키 전부 폐기 후 재발급 | 🔴 CRITICAL | 30분 |
| 2 | .env.local git history에서 삭제 | 🔴 CRITICAL | 15분 |
| 3 | middleware.ts 추가 (API 전역 인증) | 🔴 CRITICAL | 1시간 |
| 4 | 인증 없는 35개 라우트에 getSessionEmployee 추가 | 🔴 CRITICAL | 2시간 |
| 5 | RLS 정책 전면 교체 (anon → authenticated) | 🔴 CRITICAL | 1시간 |
| 6 | next.config.ts 보안 헤더 추가 | 🟡 HIGH | 15분 |
| 7 | seed 엔드포인트 제거/이동 | 🟡 HIGH | 30분 |
| 8 | masterAuth fallback 삭제 | 🟡 HIGH | 10분 |
| 9 | webhook 시크릿 필수화 | 🟡 MEDIUM | 10분 |
| 10 | SQL injection 이스케이프 | 🟡 MEDIUM | 10분 |

---

## 수동 조치 필요 (Claude Code가 할 수 없는 것)

1. **Supabase 대시보드** → Service Role Key 재발급
2. **OpenAI 대시보드** → API Key 폐기 후 재발급
3. **Anthropic Console** → API Key 폐기 후 재발급
4. **Google Cloud Console** → Service Account Key 교체
5. **Naver Developers** → API 키 재발급
6. **Vercel 대시보드** → 환경변수에 새 키 등록
7. **GitHub** → git history 정리 (git filter-repo)
