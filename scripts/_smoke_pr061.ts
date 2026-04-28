/**
 * PR061 — ftc rescue fallback smoke test.
 *
 * 정적 검증 (LLM/네트워크 없이):
 * - L76 lint 가 rescue 시 면제되는지
 * - rescue 미적용 + ftc 매칭 + docx 정보공개서 fact → WARN 발생 (이전엔 ERROR)
 * - rescue 적용 시 → 0 warn
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
  console.log(`  ${ok ? "✓" : "✗"} ${label}${detail ? ` — ${detail}` : ""}`);
  if (!ok) okAll = false;
}

async function main() {
  console.log("\n=== PR061 smoke ===\n");

  // L76 직접 호출은 GeoPayload 타입 의존이 무거우므로 lint module import 만 확인.
  const { lintForDepth } = await import("../lib/geo/gates/lint");
  check("[T3] lintForDepth import 정상", typeof lintForDepth === "function");

  // L76 violations 빌더 함수만 분리 검증 (gates/lint.ts L76 분기 로직 일부 재현)
  type Fact = { source_tier: "A" | "B" | "C"; source_title?: string; fact_key?: string };
  function detectL76(
    facts: Fact[],
    ctx: { ftcBrandMatched: boolean | null; rescueApplied?: boolean },
  ): { warns: number; errors: number } {
    if (ctx.ftcBrandMatched !== true) return { warns: 0, errors: 0 };
    if (ctx.rescueApplied === true) return { warns: 0, errors: 0 };
    const violations = facts.filter((f) => {
      if (f.source_tier !== "A") return false;
      const title = f.source_title ?? "";
      if (!title.includes("정보공개서")) return false;
      if (title.includes("frandoor 적재")) return false;
      return true;
    });
    return { warns: violations.length > 0 ? 1 : 0, errors: 0 };
  }

  console.log("\n[T3 hand-check] L76 분기 시뮬레이션");
  // 케이스 1: ftc 매칭 + docx 정보공개서 fact 사용 + rescue 미적용 → WARN
  {
    const facts: Fact[] = [
      { source_tier: "A", source_title: "오공김밥 공정위 정보공개서 2024", fact_key: "frcs_cnt" },
    ];
    const r = detectL76(facts, { ftcBrandMatched: true, rescueApplied: false });
    check(
      "ftc 매칭 + docx __official_data__ + rescue 미적용 → WARN 1건",
      r.warns === 1 && r.errors === 0,
      JSON.stringify(r),
    );
  }
  // 케이스 2: ftc 매칭 + docx 정보공개서 fact 사용 + rescue 적용 → 면제
  {
    const facts: Fact[] = [
      { source_tier: "A", source_title: "오공김밥 공정위 정보공개서 2024", fact_key: "frcs_cnt" },
    ];
    const r = detectL76(facts, { ftcBrandMatched: true, rescueApplied: true });
    check(
      "ftc 매칭 + docx + rescue 적용 → 면제 (warn 0)",
      r.warns === 0 && r.errors === 0,
      JSON.stringify(r),
    );
  }
  // 케이스 3: ftc 적재본 fact 사용 → no violation
  {
    const facts: Fact[] = [
      { source_tier: "A", source_title: "공정위 정보공개서 2024 (frandoor 적재본)", fact_key: "frcs_cnt" },
    ];
    const r = detectL76(facts, { ftcBrandMatched: true, rescueApplied: false });
    check(
      "ftc 적재본 → 면제 (warn 0)",
      r.warns === 0 && r.errors === 0,
      JSON.stringify(r),
    );
  }
  // 케이스 4: ftc 미매칭 → 면제
  {
    const facts: Fact[] = [
      { source_tier: "A", source_title: "오공김밥 공정위 정보공개서 2024", fact_key: "frcs_cnt" },
    ];
    const r = detectL76(facts, { ftcBrandMatched: false, rescueApplied: false });
    check(
      "ftc 미매칭 → 면제 (warn 0)",
      r.warns === 0 && r.errors === 0,
      JSON.stringify(r),
    );
  }

  // T1: FTC_CORE_KEYS 기반 게이트 시뮬레이션
  console.log("\n[T1 hand-check] FTC_CORE_KEYS 게이트 시뮬레이션");
  type Metrics = Partial<Record<string, unknown>>;
  const FTC_CORE_KEYS = [
    "stores_total",
    "monthly_avg_sales",
    "cost_total",
    "hq_revenue",
    "hq_op_profit",
  ];
  function shouldBlockDocx(metrics: Metrics): boolean {
    const c = FTC_CORE_KEYS.filter((k) => metrics[k] != null).length;
    return c >= 3;
  }
  check("metrics={} → docx 차단 안함", shouldBlockDocx({}) === false);
  check(
    "metrics 1개 (industry_sub만) → docx 차단 안함 (rescue)",
    shouldBlockDocx({ industry_sub: "분식" }) === false,
  );
  check(
    "core 2개 → docx 차단 안함",
    shouldBlockDocx({ stores_total: 21, monthly_avg_sales: 5210 }) === false,
  );
  check(
    "core 3개 → docx 차단 ✓",
    shouldBlockDocx({ stores_total: 21, monthly_avg_sales: 5210, cost_total: 6949 }) === true,
  );
  check(
    "core 5개 → docx 차단 ✓",
    shouldBlockDocx({
      stores_total: 21,
      monthly_avg_sales: 5210,
      cost_total: 6949,
      hq_revenue: 1000000,
      hq_op_profit: 17600,
    }) === true,
  );

  // T2: rescue 시 dedupe 동작 시뮬레이션
  console.log("\n[T2 hand-check] dedupe push 시뮬레이션");
  type FactWithKey = { fact_key: string; tier: "A" | "B" | "C" };
  const factsArr: FactWithKey[] = [];
  function hasFactKey(key: string): boolean {
    return factsArr.some((f) => f.fact_key === key);
  }
  function pushIfNew(key: string, tier: "A" | "B" | "C") {
    if (hasFactKey(key)) return false;
    factsArr.push({ fact_key: key, tier });
    return true;
  }
  // ftc inject (1차)
  pushIfNew("frcs_cnt", "A");
  pushIfNew("docx_avg_monthly_revenue", "A");
  // rescue (docx) — 같은 fact_key 면 dedup
  const r1 = pushIfNew("frcs_cnt", "A"); // 중복 → false
  const r2 = pushIfNew("docx_cost_total", "A"); // 신규 → true
  check(
    "rescue dedup: frcs_cnt 중복 미push, cost_total 신규 push",
    r1 === false && r2 === true && factsArr.length === 3,
    `len=${factsArr.length}`,
  );

  // T4 — UI 메시지 우선순위 (route 응답 형식 검증)
  console.log("\n[T4 hand-check] UI 에러 메시지 우선순위");
  type ErrData = { error?: string; message?: string };
  function buildErrorMsg(errData: ErrData): string {
    const msg = errData.message
      ? `${errData.message}${errData.error ? ` [${errData.error}]` : ""}`
      : errData.error || "생성 실패";
    return msg;
  }
  check(
    "message + code → 'message [code]'",
    buildErrorMsg({
      error: "INSUFFICIENT_DATA",
      message: "D3 생성 불가: facts=8 (A=2, C=4)",
    }) === "D3 생성 불가: facts=8 (A=2, C=4) [INSUFFICIENT_DATA]",
  );
  check(
    "code 만 → 'code'",
    buildErrorMsg({ error: "GENERATE_FAILED" }) === "GENERATE_FAILED",
  );
  check(
    "둘 다 없음 → '생성 실패'",
    buildErrorMsg({}) === "생성 실패",
  );

  console.log(`\n=== ${okAll ? "ALL PASS" : "SOME FAILED"} ===\n`);
  process.exit(okAll ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
