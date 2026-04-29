/**
 * v2-22 smoke — crosscheck round variant 허용.
 * LLM 이 산술 결과를 round (100/1000/10000) 표기로 쓰면 통과.
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

import type { FactPoolItem } from "../lib/geo/v2/sysprompt";

function fact(metric_id: string, value_num: number, period = "2024-12"): FactPoolItem {
  return {
    metric_id,
    metric_label: metric_id,
    value_num,
    value_text: null,
    unit: "만원",
    period,
    source_tier: "A",
    source_label: "공정위",
  };
}

async function main() {
  console.log("\n=== v2-22 smoke ===\n");

  const { crosscheckV2 } = await import("../lib/geo/v2/crosscheck");

  // T1 — 1,691 × 12 = 20,292 → round 20,000 통과
  console.log("[T1] 산술 round variant 통과");
  {
    const pool = [fact("monthly_avg", 1691)];
    // 본문: 산술 결과를 round 로 표기
    const body = "월 1,691만원이면 연 20,000만원대 초반입니다.";
    const r = crosscheckV2(body, pool);
    check(
      `1,691 × 12 → round 20,000 통과`,
      r.ok && r.unmatched.length === 0,
      `unmatched=${JSON.stringify(r.unmatched)}`,
    );
  }

  // T2 — 5,210 × 12 = 62,520 → round 62,500 / 62,000 통과
  {
    const pool = [fact("monthly_sales", 5210)];
    const bodyExact = "월 5,210만원 × 12 = 62,520만원입니다.";
    const r1 = crosscheckV2(bodyExact, pool);
    check(`5,210 × 12 = 62,520 정확값 통과`, r1.ok, JSON.stringify(r1.unmatched));

    const bodyRound500 = "월 5,210만원이면 연 62,500만원입니다.";
    const r2 = crosscheckV2(bodyRound500, pool);
    check(`5,210 × 12 → round 62,500 통과`, r2.ok, JSON.stringify(r2.unmatched));

    const bodyRound1000 = "월 5,210만원이면 연 63,000만원입니다.";
    const r3 = crosscheckV2(bodyRound1000, pool);
    check(`5,210 × 12 → round 63,000 통과 (62,520 → 1000 단위)`, r3.ok, JSON.stringify(r3.unmatched));
  }

  // T3 — sum / diff round variant
  console.log("\n[T2] sum / diff round variant");
  {
    // 6196 + 5210 = 11,406 → round 11,400 / 11,000 통과
    const pool = [fact("a", 6196), fact("b", 5210)];
    const body = "두 brand 합산이면 11,400만원 수준입니다.";
    const r = crosscheckV2(body, pool);
    check(`6196 + 5210 → round 11,400 통과`, r.ok, JSON.stringify(r.unmatched));
  }
  {
    // 6196 - 5210 = 986 → round 1,000 통과
    const pool = [fact("a", 6196), fact("b", 5210)];
    const body = "두 brand 차이는 1,000만원 정도입니다.";
    const r = crosscheckV2(body, pool);
    check(`6196 - 5210 = 986 → round 1,000 통과`, r.ok, JSON.stringify(r.unmatched));
  }

  // T4 — 진짜 hallucination 차단 유지
  console.log("\n[T3] 진짜 hallucination 차단 유지");
  {
    // facts 와 산술 불가능한 값
    const pool = [fact("a", 5210)];
    const body = "다른 brand 평균은 99,999만원입니다.";
    const r = crosscheckV2(body, pool);
    check(
      `99,999 (산술 불가능 값) 차단 유지`,
      !r.ok && r.unmatched.length > 0,
      `unmatched=${JSON.stringify(r.unmatched)}`,
    );
  }
  {
    // 525 = 5,210 / 10 → round 500 → 통과 (×÷10)
    // 하지만 abs 산술 불가 값은 차단
    const pool = [fact("a", 5210)];
    const body = "월매출은 88,777만원으로 추정됩니다.";
    const r = crosscheckV2(body, pool);
    check(
      `88,777 (어떤 산술과도 무관) 차단 유지`,
      !r.ok,
      `unmatched=${JSON.stringify(r.unmatched)}`,
    );
  }

  // 정확값 (산술 결과)도 그대로 통과
  console.log("\n[regression] 정확값 보존");
  {
    const pool = [fact("a", 1691)];
    const body = "월 1,691만원 × 12 = 20,292만원이 연매출입니다.";
    const r = crosscheckV2(body, pool);
    check(`1,691 × 12 = 20,292 정확값 통과`, r.ok, JSON.stringify(r.unmatched));
  }

  console.log(`\n=== ${okAll ? "ALL PASS" : "SOME FAILED"} ===\n`);
  process.exit(okAll ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
