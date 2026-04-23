/* 단순 실행 테스트 — 프레임워크 의존 없이 tsx 직접 실행 가능.
 *   npx tsx lib/geo/gates/__tests__/crosscheck.test.ts
 * 실패 시 process.exitCode=1.
 */
import { normalizeKoreanNumbers, numberCrossCheck } from "../crosscheck";
import type { GptFacts } from "@/lib/geo/schema";

let passCount = 0;
let failCount = 0;

function eq(label: string, actual: unknown, expected: unknown) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (ok) { passCount++; console.log(`  ✓ ${label}`); }
  else { failCount++; console.error(`  ✗ ${label}\n    expected: ${JSON.stringify(expected)}\n    actual:   ${JSON.stringify(actual)}`); }
}

console.log("\n[normalizeKoreanNumbers]");
eq("6억 9,430만 → 69430만",          normalizeKoreanNumbers("6억 9,430만 원"),  "69430만 원");
eq("3억 단독 → 30000만",              normalizeKoreanNumbers("실투자금은 3억원"), "실투자금은 30000만원");
eq("9,430만 (억 없음) → 그대로",      normalizeKoreanNumbers("9,430만"),         "9,430만");
eq("5억원 (붙여쓰기) → 50000만원",   normalizeKoreanNumbers("5억원 수준"),       "50000만원 수준");
eq("10억 500만 → 100500만",           normalizeKoreanNumbers("10억 500만"),       "100500만");
eq("1조 (미지원, 변경 없음)",         normalizeKoreanNumbers("1조 500억"),        "1조 5000000만");
// 설명: 1조는 건드리지 않지만 "500억" 은 두 번째 regex 가 잡아서 5000000만 으로 변환됨.
// 향후 "조" 지원이 필요해지면 여기 테스트부터 갱신.

console.log("\n[numberCrossCheck with Korean notation]");
const facts: GptFacts = {
  brand: undefined,
  industry: undefined,
  topic: undefined,
  category: undefined,
  facts: [
    { claim: "교촌 연매출", value: 69430, unit: "만원", source_url: "https://x", source_title: "t", year_month: "2024-01", authoritativeness: "primary" },
  ],
  deriveds: [],
  collected_at: "2026-04-23",
  measurement_floor: false,
  conflicts: [],
};

const r1 = numberCrossCheck("가맹점당 연매출은 6억 9,430만 원 수준이다.", facts);
eq("6억 9,430만 → pool 의 69430 과 매칭", r1.unmatched.length, 0);

const r2 = numberCrossCheck("가맹점당 연매출은 69,430만 원 수준이다.", facts);
eq("69,430만 → 매칭 (기존 경로)", r2.unmatched.length, 0);

const r3 = numberCrossCheck("가맹점당 연매출은 99,999만 원 수준이다.", facts);
eq("99,999만 → unmatched", r3.unmatched.length, 1);

console.log(`\n=== ${passCount} pass / ${failCount} fail ===`);
if (failCount > 0) process.exitCode = 1;
