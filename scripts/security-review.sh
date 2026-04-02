#!/bin/bash
# 보안 리뷰 스크립트 — git pre-commit 또는 수동 실행
# 사용법: bash scripts/security-review.sh [--staged | --all]

cd "$(git rev-parse --show-toplevel)" || exit 1

RED='\033[0;31m'
YELLOW='\033[1;33m'
GREEN='\033[0;32m'
NC='\033[0m'

ISSUES=0
WARNINGS=0

if [ "$1" = "--all" ]; then
  FILES=$(find app/api -name "route.ts" 2>/dev/null)
else
  FILES=$(git diff --cached --name-only --diff-filter=ACMR 2>/dev/null | grep -E '\.(ts|tsx)$')
  if [ -z "$FILES" ]; then
    FILES=$(git diff --name-only --diff-filter=ACMR 2>/dev/null | grep -E '\.(ts|tsx)$')
  fi
fi

if [ -z "$FILES" ]; then
  echo -e "${GREEN}✅ 검사할 파일 없음${NC}"
  exit 0
fi

echo "🔍 보안 리뷰 시작..."
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# 1. API 라우트에서 createClient() 사용 (RLS 우회 안됨)
for f in $FILES; do
  if echo "$f" | grep -q "app/api/"; then
    if grep -n "createClient()" "$f" 2>/dev/null | grep -v "createAdminClient\|import.*createClient\|// " > /dev/null; then
      echo -e "${RED}❌ [RLS] createClient() 사용 → createAdminClient() 필요${NC}"
      grep -n "createClient()" "$f" | grep -v "createAdminClient\|import"
      echo "   파일: $f"
      ISSUES=$((ISSUES + 1))
    fi
  fi
done

# 2. API 라우트에 인증 체크 누락
for f in $FILES; do
  if echo "$f" | grep -q "app/api/"; then
    if grep -q "export async function" "$f" 2>/dev/null; then
      if ! grep -q "getSessionEmployee\|verifyMasterToken\|apiAuth" "$f" 2>/dev/null; then
        echo -e "${RED}❌ [AUTH] 인증 체크 누락${NC}"
        echo "   파일: $f"
        ISSUES=$((ISSUES + 1))
      fi
    fi
  fi
done

# 3. session.userId vs session.employeeId 혼용 (코워크 등)
for f in $FILES; do
  if echo "$f" | grep -q "app/api/cowork"; then
    if grep -n "session\.userId" "$f" 2>/dev/null > /dev/null; then
      echo -e "${RED}❌ [ID] session.userId 사용 → String(session.employeeId) 필요${NC}"
      grep -n "session\.userId" "$f"
      echo "   파일: $f"
      ISSUES=$((ISSUES + 1))
    fi
  fi
done

# 4. SQL 인젝션 위험 (raw query 사용)
for f in $FILES; do
  if grep -n "\.rpc(\|\.sql(\|raw.*query\|execute(" "$f" 2>/dev/null > /dev/null; then
    echo -e "${YELLOW}⚠️  [SQL] Raw 쿼리 사용 — 파라미터 바인딩 확인 필요${NC}"
    grep -n "\.rpc(\|\.sql(\|raw.*query\|execute(" "$f"
    echo "   파일: $f"
    WARNINGS=$((WARNINGS + 1))
  fi
done

# 5. .env 또는 시크릿 하드코딩
for f in $FILES; do
  if grep -n "SUPABASE_SERVICE_ROLE_KEY\|sk-\|password.*=.*['\"]" "$f" 2>/dev/null | grep -v ".env\|process.env" > /dev/null; then
    echo -e "${RED}❌ [SECRET] 시크릿 하드코딩 의심${NC}"
    grep -n "SUPABASE_SERVICE_ROLE_KEY\|sk-\|password.*=.*['\"]" "$f" | grep -v ".env\|process.env"
    echo "   파일: $f"
    ISSUES=$((ISSUES + 1))
  fi
done

# 6. 권한 체크 없는 DELETE/UPDATE 엔드포인트
for f in $FILES; do
  if echo "$f" | grep -q "app/api/"; then
    if grep -q "export async function DELETE\|export async function PATCH\|export async function PUT" "$f" 2>/dev/null; then
      if ! grep -q "forbidden\|isCLevel\|isTeamLead\|role.*owner\|memberCheck\|member\.role" "$f" 2>/dev/null; then
        echo -e "${YELLOW}⚠️  [PERM] 쓰기 엔드포인트에 권한 체크 누락 가능성${NC}"
        echo "   파일: $f"
        WARNINGS=$((WARNINGS + 1))
      fi
    fi
  fi
done

# 7. XSS: dangerouslySetInnerHTML 사용
for f in $FILES; do
  if grep -n "dangerouslySetInnerHTML" "$f" 2>/dev/null > /dev/null; then
    echo -e "${YELLOW}⚠️  [XSS] dangerouslySetInnerHTML 사용${NC}"
    grep -n "dangerouslySetInnerHTML" "$f"
    echo "   파일: $f"
    WARNINGS=$((WARNINGS + 1))
  fi
done

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
if [ $ISSUES -gt 0 ]; then
  echo -e "${RED}🚨 심각한 이슈 ${ISSUES}건, 경고 ${WARNINGS}건${NC}"
  exit 1
elif [ $WARNINGS -gt 0 ]; then
  echo -e "${YELLOW}⚠️  경고 ${WARNINGS}건 (커밋 가능, 확인 권장)${NC}"
  exit 0
else
  echo -e "${GREEN}✅ 보안 이슈 없음${NC}"
  exit 0
fi
