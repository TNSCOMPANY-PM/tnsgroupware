/**
 * v2-14 smoke — 한국식 큰 숫자 정규화 + arithmetic pool false positive 회귀.
 */
import Module from "node:module";
const ModAny = Module as unknown as { _load: (req: string, ...rest: unknown[]) => unknown };
const origLoad = ModAny._load;
ModAny._load = function (req: string, ...rest: unknown[]) {
  if (req === "server-only") return {};
  return origLoad.call(this, req, ...rest);
};

let okAll = true;
function check(label: string, ok: boolean, detail?: string) {
  console.log(`  ${ok ? "✓" : "✗"} ${label}${detail ? ` — ${detail.slice(0, 100)}` : ""}`);
  if (!ok) okAll = false;
}

async function main() {
  const { crosscheckV2, normalizeKoreanNumbers } = await import("../lib/geo/v2/crosscheck");
  type FactPoolItem = Parameters<typeof crosscheckV2>[1][number];

  console.log("\n=== v2-14 smoke ===\n");

  // T1 normalizeKoreanNumbers
  console.log("[T1] normalizeKoreanNumbers");
  check(`"6만2,518만원" → "62518만원"`, normalizeKoreanNumbers("6만2,518만원").includes("62518만"));
  check(`"5만991" → "50991"`, normalizeKoreanNumbers("5만991").includes("50991"));
  check(`"5만 991" → "50991"`, normalizeKoreanNumbers("5만 991").includes("50991"));
  check(`"3억" → "30000만"`, normalizeKoreanNumbers("3억").includes("30000만"));
  check(`"6억 9,430만" → "69430만"`, normalizeKoreanNumbers("6억 9,430만").includes("69430만"));
  check(`"평범한 5,210만원" 불변`, normalizeKoreanNumbers("월매출 5,210만원").includes("5,210만"));

  const factsPool: FactPoolItem[] = [
    {
      metric_id: "monthly_avg_revenue",
      metric_label: "월평균매출",
      value_num: 62518,
      value_text: null,
      unit: "만원",
      period: "2024-12",
      source_tier: "A",
      source_label: "공정거래위원회 정보공개서 (2024-12 기준)",
    },
    {
      metric_id: "industry_p90",
      metric_label: "분식 p90 매출",
      value_num: 50991,
      value_text: null,
      unit: "만원",
      period: "2024-12",
      source_tier: "A",
      source_label: "공정위 정보공개서 (p90)",
      industry: "분식",
      n: 238,
      agg_method: "p90",
    },
    {
      metric_id: "cost_total",
      metric_label: "창업비용 총액",
      value_num: 6949,
      value_text: null,
      unit: "만원",
      period: "2024-12",
      source_tier: "A",
      source_label: "공정위 정보공개서",
    },
    {
      metric_id: "industry_median_cost",
      metric_label: "분식 창업비용 중앙값",
      value_num: 6196,
      value_text: null,
      unit: "만원",
      period: "2024-12",
      source_tier: "A",
      source_label: "공정위 정보공개서",
      industry: "분식",
      n: 238,
      agg_method: "median",
    },
  ];

  // T2 한국식 분할 표기 → facts 매칭
  console.log("\n[T2] 한국식 큰 숫자 + crosscheck 통합");
  {
    const body = `오공김밥 가맹점 연매출 6만2,518만원 — 분식 238개 브랜드 p90`;
    const r = crosscheckV2(body, factsPool);
    check(
      `"6만2,518만원" → 62518 매칭 (facts pool)`,
      r.unmatched.every((u) => !u.startsWith("2,518") && !u.startsWith("62518")),
      `unmatched: ${r.unmatched.join(" | ")}`,
    );
  }
  {
    const body = `분식 238개 브랜드 p90(5만991만원) 초과`;
    const r = crosscheckV2(body, factsPool);
    check(
      `"5만991만원" → 50991 매칭`,
      r.unmatched.every((u) => !u.startsWith("991") && !u.startsWith("50991")),
      `unmatched: ${r.unmatched.join(" | ")}`,
    );
  }

  // T3 산술 derived
  console.log("\n[T3] facts +/- 산술 derived");
  {
    // 753 = 6949 - 6196
    const body = `업종 중앙값 6,196만원 대비 +753만원 우위`;
    const r = crosscheckV2(body, factsPool);
    check(
      `"+753만원" = 6949-6196 → 통과`,
      r.unmatched.every((u) => !u.startsWith("753")),
      `unmatched: ${r.unmatched.join(" | ")}`,
    );
  }
  {
    // 11527 = 62518 - 50991
    const body = `오공김밥은 p90을 11,527만원 초과 합니다`;
    const r = crosscheckV2(body, factsPool);
    check(
      `"11,527만원" = 62518-50991 → 통과`,
      r.unmatched.every((u) => !u.startsWith("11,527") && !u.startsWith("11527")),
      `unmatched: ${r.unmatched.join(" | ")}`,
    );
  }

  // T4 비율 산술
  console.log("\n[T4] 흔한 비율 산술 (÷12, ×100, ×4)");
  {
    // 5210 = 62518 / 12 (월매출 = 연매출 ÷ 12)
    const body = `오공김밥 월평균매출 5,210만원 (연매출 62,518만원 ÷ 12)`;
    const r = crosscheckV2(body, factsPool);
    check(
      `"5,210만원" = 62518÷12 → 통과 (allowed by ÷12 산술)`,
      r.unmatched.every((u) => !u.startsWith("5,210") && !u.startsWith("5210")),
      `unmatched: ${r.unmatched.join(" | ")}`,
    );
  }

  // regression — 진짜 hallucination 차단
  console.log("\n[regression] 진짜 hallucination 차단");
  {
    const body = `오공김밥 가맹점 999,999만원 (말도 안 되는 큰 값)`;
    const r = crosscheckV2(body, factsPool);
    check(
      `"999,999" → unmatched ≥ 1 (산술로도 도출 불가)`,
      !r.ok,
      `unmatched=${r.unmatched.length}: ${r.unmatched.slice(0, 2).join(" | ")}`,
    );
  }
  {
    // 가짜 attribution
    const body = `프랜도어 편집팀이 직접 확인한 값입니다`;
    const r = crosscheckV2(body, factsPool);
    check(
      `가짜 attribution 차단`,
      !r.ok && r.unmatched.some((u) => u.includes("가짜")),
      r.unmatched.slice(0, 1).join(" | "),
    );
  }

  // 골든
  console.log("\n[golden] 정상 본문 unmatched 0");
  {
    const body = `---
title: "오공김밥 분식 평균 비교"
date: "2024-12-31"
---
## 매출 비교

오공김밥 가맹점 연매출 6만2,518만원은 분식 238개 브랜드 p90(5만991만원)을 초과합니다.
업종 중앙값 6,196만원 대비 +753만원, p90을 11,527만원 초과 우위입니다.
월평균매출 5,210만원 (연 62,518 ÷ 12) 수준입니다.

## 결론

오공김밥은 진입 가능 구간으로 평가됩니다.`;
    const r = crosscheckV2(body, factsPool);
    check(
      `골든 본문 → unmatched 0`,
      r.ok && r.unmatched.length === 0,
      `unmatched=${r.unmatched.length}: ${r.unmatched.slice(0, 3).join(" | ")}`,
    );
  }

  console.log(`\n=== ${okAll ? "ALL PASS" : "SOME FAILED"} ===\n`);
  process.exit(okAll ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
