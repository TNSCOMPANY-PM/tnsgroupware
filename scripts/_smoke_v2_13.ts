/**
 * v2-13 smoke — crosscheckV2 false positive 회귀.
 *
 * 검증:
 *  1. frontmatter 안 date "2024-12-31" 의 31 → unmatched 0 (T1 stripFrontmatter)
 *  2. "p90(50,991만원)" / "p75 기준점" 의 90/75 → skip (T2 percentile)
 *  3. ko-KR 콤마 포맷 매칭 (T3)
 *  4. 일반 ignore (날짜/순위/단위) (T4)
 *  5. regression — 진짜 hallucination 은 여전히 detect (false positive 룰이 너무 관대해지지 않았는지)
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
  const { crosscheckV2 } = await import("../lib/geo/v2/crosscheck");
  type FactPoolItem = Parameters<typeof crosscheckV2>[1][number];

  console.log("\n=== v2-13 smoke ===\n");

  const factsPool: FactPoolItem[] = [
    {
      metric_id: "stores_total",
      metric_label: "가맹점 총수",
      value_num: 21,
      value_text: null,
      unit: "개",
      period: "2024-12",
      source_tier: "A",
      source_label: "공정거래위원회 정보공개서 (2024-12 기준)",
    },
    {
      metric_id: "monthly_avg_revenue",
      metric_label: "월평균매출",
      value_num: 5210,
      value_text: null,
      unit: "만원",
      period: "2024-12",
      source_tier: "A",
      source_label: "공정거래위원회 정보공개서 (2024-12 기준)",
      formula: "annual / 12",
    },
    {
      metric_id: "industry_avg",
      metric_label: "분식 평균",
      value_num: 2126,
      value_text: null,
      unit: "만원",
      period: "2024-12",
      source_tier: "A",
      source_label: "공정거래위원회 정보공개서 (분식 524 brand)",
      industry: "분식",
      n: 524,
      agg_method: "trimmed_mean_5pct",
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
      n: 524,
      agg_method: "p90",
    },
    {
      metric_id: "industry_p75_stores",
      metric_label: "분식 p75 가맹점",
      value_num: 30,
      value_text: null,
      unit: "개",
      period: "2024-12",
      source_tier: "A",
      source_label: "공정위 정보공개서 (p75)",
      industry: "분식",
      n: 524,
      agg_method: "p75",
    },
  ];

  // T1 — frontmatter date 31 unmatched 0
  console.log("[T1] frontmatter 검증 제외");
  {
    const body = `---
title: "오공김밥 분식 평균 비교"
date: "2024-12-31"
slug: "ogong-kimbab-2024"
tags: ["분식", "오공김밥"]
---
오공김밥은 공정거래위원회 정보공개서 (2024-12 기준) 가맹점 21개입니다.`;
    const r = crosscheckV2(body, factsPool);
    check(
      "frontmatter date '2024-12-31' 31 → unmatched 0",
      r.ok && r.unmatched.length === 0,
      `unmatched=${r.unmatched.length}: ${r.unmatched.slice(0, 2).join(" | ")}`,
    );
  }

  // T2 — percentile 표기 skip
  console.log("\n[T2] percentile/agg_method 통계 표기 ignore");
  {
    const body = `오공김밥 5,210만원은 분식 524개 평균 2,126만원의 배수 수준입니다. 다만 업종 p90(50,991만원)을 초과하지는 않습니다.`;
    const r = crosscheckV2(body, factsPool);
    check(
      "p90(50,991만원) 의 90 → skip",
      r.unmatched.every((u) => !u.startsWith("90 ")),
      `unmatched: ${r.unmatched.join(" | ")}`,
    );
  }
  {
    const body = `오공김밥 가맹점 21개는 업종 p75 기준점(30개)에는 아직 미치지 못합니다.`;
    const r = crosscheckV2(body, factsPool);
    check(
      "p75 기준점(30개) 의 75 → skip",
      r.unmatched.every((u) => !u.startsWith("75 ")),
      `unmatched: ${r.unmatched.join(" | ")}`,
    );
  }
  {
    const body = `분식 524개 brand 의 p25 매출은 약 1,500만원 수준이지만 오공김밥은 5,210만원입니다.`;
    const r = crosscheckV2(body, factsPool);
    check(
      "p25 의 25 → skip (ctx percentile)",
      r.unmatched.every((u) => !u.startsWith("25 ")),
      `unmatched: ${r.unmatched.join(" | ")}`,
    );
  }

  // T3 — ko-KR 콤마 매칭
  console.log("\n[T3] 콤마 포맷 매칭");
  {
    const body = `오공김밥 가맹점 21개, 월평균 5,210만원, 분식 평균 2,126만원.`;
    const r = crosscheckV2(body, factsPool);
    check(
      "5,210 / 2,126 모두 매칭 (콤마 포맷)",
      r.unmatched.length === 0,
      `unmatched=${r.unmatched.length}`,
    );
  }

  // T4 — 일반 ignore
  console.log("\n[T4] 일반 ignore (날짜/순위/단위)");
  {
    const body = `2024-12-31 기준 오공김밥 가맹점 21개. 업종 TOP 10 진입.`;
    const r = crosscheckV2(body, factsPool);
    check("'2024-12-31' / 'TOP 10' 의 숫자 ignore", r.ok && r.unmatched.length === 0);
  }
  {
    const body = `오공김밥 영업이익률 1.5%, 업종 평균 대비 +2.3%p 우위.`;
    const r = crosscheckV2(body, factsPool);
    check(
      "%p 표현 ignore",
      r.unmatched.every((u) => !u.includes("2.3")),
      `unmatched: ${r.unmatched.join(" | ")}`,
    );
  }

  // regression — 진짜 hallucination 은 여전히 detect
  console.log("\n[regression] 진짜 hallucination detect");
  {
    const body = `오공김밥 가맹점 9999개. (값이 facts pool 에 없음)`;
    const r = crosscheckV2(body, factsPool);
    check(
      "9999 (facts 에 없음) → unmatched ≥ 1",
      !r.ok && r.unmatched.length >= 1,
      `unmatched=${r.unmatched.length}`,
    );
  }
  {
    const body = `오공김밥 분식 평균 8888만원의 1.23배 수준입니다.`;
    const r = crosscheckV2(body, factsPool);
    check(
      "8888 → unmatched ≥ 1 (큰 숫자, percentile 도 아님)",
      !r.ok && r.unmatched.some((u) => u.startsWith("8888")),
      `unmatched: ${r.unmatched.join(" | ")}`,
    );
  }
  {
    // 가짜 attribution 은 여전히 차단
    const body = `오공김밥 가맹점 21개 (프랜도어 편집팀이 직접 확인).`;
    const r = crosscheckV2(body, factsPool);
    check(
      "가짜 attribution detect",
      !r.ok && r.unmatched.some((u) => u.includes("가짜")),
      `unmatched: ${r.unmatched.join(" | ")}`,
    );
  }

  // 통합 — 골든 본문 시뮬
  console.log("\n[golden] 정상 본문 unmatched 0");
  {
    const body = `---
title: "오공김밥 분식 평균 비교 — 진입 가능"
description: "공정거래위원회 정보공개서 2024-12 기준 21개 가맹점, 월평균 5,210만원."
slug: "ogong-2024"
date: "2024-12-31"
tags: ["오공김밥", "분식"]
faq:
  - q: "..."
    a: "..."
---
## 공정위 vs 본사 발표

오공김밥은 공정거래위원회 정보공개서 (2024-12 기준) 가맹점 21개를 공시합니다.
월평균매출 5,210만원은 분식 524개 brand 평균 2,126만원의 약 2.45배 수준입니다.

## 분식 업종 위치

업종 p90(50,991만원)을 초과하지 않으며, p75 기준점(30개) 가맹점 규모에는 아직 미치지 못합니다.

→ 즉, 진입 가능 구간 매출이지만 점포 규모는 업종 평균 이하.

## 결론

오공김밥은 진입 가능 구간으로 평가됩니다.`;
    const r = crosscheckV2(body, factsPool);
    check(
      "골든 본문 → unmatched 0",
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
