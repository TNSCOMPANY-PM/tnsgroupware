# CLAUDE.md — 프로젝트 규칙

이 파일은 Claude Code가 이 프로젝트에서 따라야 할 규칙과 지침을 정의합니다.

---

## 프로젝트 개요

- **프레임워크**: Next.js (App Router)
- **언어**: TypeScript
- **DB**: Supabase (PostgreSQL)
- **스타일**: Tailwind CSS

---

## 코딩 규칙

### 일반
- 불필요한 코드, 주석, 콘솔 로그를 추가하지 않는다
- 요청된 것만 변경한다. 관련 없는 코드를 리팩토링하거나 개선하지 않는다
- 새 파일 생성보다 기존 파일 수정을 우선한다

### TypeScript
- `any` 타입 사용을 피한다
- 타입은 명시적으로 선언한다

### 컴포넌트
- 서버 컴포넌트와 클라이언트 컴포넌트를 구분한다 (`'use client'` 명시)
- 컴포넌트는 `components/` 디렉토리에 위치한다

---

## 파일 구조

```
app/                  # Next.js App Router 페이지
  (groupware)/        # 그룹웨어 레이아웃 그룹
  api/                # API 라우트
components/           # 재사용 가능한 컴포넌트
constants/            # 상수 정의
contexts/             # React Context
data/                 # 정적 데이터
lib/                  # 유틸리티 라이브러리
scripts/              # 실행 스크립트
types/                # TypeScript 타입 정의
utils/                # 유틸리티 함수
```

---

## 커밋 규칙

- 커밋은 사용자가 명시적으로 요청할 때만 생성한다
- 커밋 메시지 형식: `feat:`, `fix:`, `refactor:`, `docs:` 등 prefix 사용

---

## 금지 사항

- `--no-verify` 또는 `--force` push 사용 금지 (사용자 명시 요청 시 제외)
- `.env` 파일 또는 민감한 정보를 커밋하지 않는다
- 프로덕션 DB에 직접 destructive 쿼리 실행 금지

---

## 기타 지침

<!-- 추가 규칙을 여기에 작성하세요 -->
