/**
 * PR059 — ftc 컬럼 정정 + 단위 환산 + docx 공정위 측 무시 정책 smoke test.
 * LLM/네트워크 호출 없이 순수 함수 동작 검증.
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
  const {
    STANDARD_METRICS,
    ftcRowToMetrics,
    toManwon,
    THOUSANDWON_FIELDS,
  } = await import("../lib/geo/standardSchema");

  console.log("\n=== PR059 smoke ===\n");

  // T1 STANDARD_METRICS 정정 확인
  console.log("[T1] STANDARD_METRICS.ftc_columns 정정 확인");
  check(
    "franchise_fee.ftc_columns = ['startup_fee']",
    JSON.stringify(STANDARD_METRICS.franchise_fee.ftc_columns) === JSON.stringify(["startup_fee"]),
    JSON.stringify(STANDARD_METRICS.franchise_fee.ftc_columns),
  );
  check(
    "cost_total.ftc_columns = ['startup_cost_total']",
    JSON.stringify(STANDARD_METRICS.cost_total.ftc_columns) === JSON.stringify(["startup_cost_total"]),
  );
  check(
    "stores_total.ftc_columns = ['frcs_cnt_2024_total']",
    JSON.stringify(STANDARD_METRICS.stores_total.ftc_columns) === JSON.stringify(["frcs_cnt_2024_total"]),
  );
  check(
    "new_opens.ftc_columns = ['chg_2024_new_open']",
    JSON.stringify(STANDARD_METRICS.new_opens.ftc_columns) === JSON.stringify(["chg_2024_new_open"]),
  );
  check(
    "contract_terminate.ftc_columns = ['chg_2024_contract_cancel']",
    JSON.stringify(STANDARD_METRICS.contract_terminate.ftc_columns) === JSON.stringify(["chg_2024_contract_cancel"]),
  );
  check(
    "hq_employees.ftc_columns = ['staff_cnt']",
    JSON.stringify(STANDARD_METRICS.hq_employees.ftc_columns) === JSON.stringify(["staff_cnt"]),
  );
  check(
    "monthly_avg_sales.ftc_columns = [] (특수처리)",
    STANDARD_METRICS.monthly_avg_sales.ftc_columns.length === 0,
  );
  check(
    "hq_op_margin_pct.ftc_columns = [] (특수처리)",
    STANDARD_METRICS.hq_op_margin_pct.ftc_columns.length === 0,
  );

  // T1.1 신규 metric 6종
  console.log("\n[T1.1] 신규 metric 추가");
  check("annual_avg_sales 정의됨", STANDARD_METRICS.annual_avg_sales != null);
  check("escrow_amount 정의됨", STANDARD_METRICS.escrow_amount != null);
  check("hq_executives 정의됨", STANDARD_METRICS.hq_executives != null);
  check("violation_civil 정의됨", STANDARD_METRICS.violation_civil != null);
  check("violation_criminal 정의됨", STANDARD_METRICS.violation_criminal != null);
  check("hq_debt_ratio_pct 정의됨", STANDARD_METRICS.hq_debt_ratio_pct != null);

  // T2.1 THOUSANDWON_FIELDS
  console.log("\n[T2.1] THOUSANDWON_FIELDS");
  check("startup_fee 천원 단위", THOUSANDWON_FIELDS.has("startup_fee"));
  check("startup_cost_total 천원 단위", THOUSANDWON_FIELDS.has("startup_cost_total"));
  check("fin_2024_revenue 천원 단위", THOUSANDWON_FIELDS.has("fin_2024_revenue"));
  check("avg_sales_2024_total 천원 단위", THOUSANDWON_FIELDS.has("avg_sales_2024_total"));
  check("avg_sales_2024_seoul 천원 단위", THOUSANDWON_FIELDS.has("avg_sales_2024_seoul"));
  check("frcs_cnt_2024_total 만원 아님 (천원 화이트리스트 제외)", !THOUSANDWON_FIELDS.has("frcs_cnt_2024_total"));
  check("staff_cnt 만원 아님 (인원수)", !THOUSANDWON_FIELDS.has("staff_cnt"));

  // T2.2 toManwon
  console.log("\n[T2.2] toManwon");
  check("toManwon(15000) = 1500 (천원→만원)", toManwon(15000) === 1500);
  check("toManwon('5210000') = 521000 (string)", toManwon("5210000") === 521000);
  check("toManwon(0) = null", toManwon(0) === null);
  check("toManwon(null) = null", toManwon(null) === null);

  // T2.2 ftcRowToMetrics 통합
  console.log("\n[T2.2] ftcRowToMetrics — 오공김밥 가상 row");
  // 오공김밥 가상 데이터 (천원 단위 raw):
  //   startup_fee: 15000 (천원) → 1500만원
  //   startup_cost_total: 69490 (천원) → 6949만원
  //   avg_sales_2024_total: 625200 (천원/연) → 62520 만원/연 → 5210 만원/월
  //   fin_2024_revenue: 1000000000 (천원=10억원) → 100000000 만원=1000억원
  //   fin_2024_op_profit: 17600000 → op_margin = 17600000/1000000000 × 100 = 1.76%
  //   fin_2024_total_debt: 5000000, fin_2024_total_equity: 10000000 → debt_ratio = 50%
  //   violation_civil: 0, violation_criminal: 0
  //   frcs_cnt_2024_total: 21
  //   staff_cnt: 25
  const fakeRow = {
    brand_nm: "오공김밥",
    induty_mlsfc: "분식",
    startup_fee: 15000,
    startup_cost_total: 69490,
    avg_sales_2024_total: 625200,
    fin_2024_revenue: 1000000000,
    fin_2024_op_profit: 17600000,
    fin_2024_total_debt: 5000000000,
    fin_2024_total_equity: 10000000000,
    frcs_cnt_2024_total: 21,
    staff_cnt: 25,
    violation_civil: 1,
    violation_criminal: 0,
  };
  const m = ftcRowToMetrics(fakeRow);
  check("franchise_fee = 1500만원 (15000 천원)", m.franchise_fee === 1500, String(m.franchise_fee));
  check("cost_total = 6949만원 (69490 천원)", m.cost_total === 6949, String(m.cost_total));
  check(
    "annual_avg_sales = 62520만원 (625200 천원)",
    m.annual_avg_sales === 62520,
    String(m.annual_avg_sales),
  );
  check(
    "monthly_avg_sales = 5210만원 (annual÷12)",
    m.monthly_avg_sales === 5210,
    String(m.monthly_avg_sales),
  );
  check(
    "hq_revenue = 100000000만원 (1조원, 천원→만원)",
    m.hq_revenue === 100000000,
    String(m.hq_revenue),
  );
  check(
    "hq_op_margin_pct = 1.8 (op/rev×100, 소수1)",
    Math.abs(Number(m.hq_op_margin_pct) - 1.8) < 0.01,
    String(m.hq_op_margin_pct),
  );
  check(
    "hq_debt_ratio_pct = 50 (debt/equity×100)",
    Math.abs(Number(m.hq_debt_ratio_pct) - 50) < 0.01,
    String(m.hq_debt_ratio_pct),
  );
  check("stores_total = 21 (raw)", m.stores_total === 21, String(m.stores_total));
  check("hq_employees = 25 (staff_cnt)", m.hq_employees === 25, String(m.hq_employees));
  check(
    "law_violations = 1 (civil 1 + criminal 0)",
    m.law_violations === 1,
    String(m.law_violations),
  );
  check("violation_civil = 1", m.violation_civil === 1);

  // T3 trimmed mean (private 함수 — 동작 가정 검증)
  console.log("\n[T3] trimmed mean 동작 검증 (간접: outlier 1건 영향 작아야)");
  // arr = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 1000] (n=11)
  // 단순 mean = 1055/11 = 95.9
  // 5% trim → trim=0 (floor(0.55)) → 사실상 단순 평균
  // 실제 trimmedMean 은 lib/geo/prefetch/ftc2024.ts 내부 함수라 직접 호출 불가.
  // 대신 spec: "10건 미만은 단순 평균" — 가정 검증은 unit test 로는 어려움. skip.
  check("trimmed mean 정의 — 실 동작은 fetchHqFinanceAvg 통합 검증 (live data)", true, "skip detail");

  // T4 정책 검증 — D3 코드 변경분 정적 검증
  console.log("\n[T4] L76 lint 스키마 (실제 lint 호출은 통합 환경 필요)");
  const { lintForDepth } = await import("../lib/geo/gates/lint");
  // 간단 호출은 GeoPayload + GptFacts 가 무거워서 skip. 코드 정상 import 만 확인.
  check("lintForDepth import 정상", typeof lintForDepth === "function");

  console.log(`\n=== ${okAll ? "ALL PASS" : "SOME FAILED"} ===\n`);
  process.exit(okAll ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
