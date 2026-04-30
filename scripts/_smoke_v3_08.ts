/**
 * v3-08 smoke — fact_groups 재설계 + 결정론 display + 검증 함수.
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
  console.log(`  ${ok ? "✓" : "✗"} ${label}${detail ? ` — ${detail.slice(0, 200)}` : ""}`);
  if (!ok) okAll = false;
}

async function main() {
  console.log("\n=== v3-08 smoke ===\n");

  // T1 — formatToDisplay 결정론 변환
  console.log("[T1] formatToDisplay (결정론)");
  const { formatToDisplay, computeAcDiff, computeBrandPosition, postProcessPlan } =
    await import("../lib/geo/v3/plan_format");

  check(`만원 62518 → "6억 2,518만원"`, formatToDisplay(62518, "만원") === "6억 2,518만원");
  check(`만원 60000 → "6억원"`, formatToDisplay(60000, "만원") === "6억원");
  check(`만원 5210 → "5,210만원"`, formatToDisplay(5210, "만원") === "5,210만원");
  check(`만원 9999 → "9,999만원"`, formatToDisplay(9999, "만원") === "9,999만원");
  check(`만원 10000 → "1억원"`, formatToDisplay(10000, "만원") === "1억원");
  check(`만원 100001 → "10억 1만원"`, formatToDisplay(100001, "만원") === "10억 1만원");
  check(`% 1.8 → "1.8%"`, formatToDisplay(1.8, "%") === "1.8%");
  check(`개 21 → "21개"`, formatToDisplay(21, "개") === "21개");
  check(`원 100000000 → "1억원"`, formatToDisplay(100_000_000, "원") === "1억원");

  // T2 — computeAcDiff
  console.log("\n[T2] computeAcDiff (A vs C 차이)");
  {
    const r = computeAcDiff({ raw_value: 62518, unit: "만원" }, { raw_value: 68132, unit: "만원" });
    check(`A < C 차이`, r.includes("높음") && r.includes("5,614만원"), r);
  }
  {
    const r = computeAcDiff({ raw_value: 100, unit: "만원" }, { raw_value: 90, unit: "만원" });
    check(`A > C 차이`, r.includes("낮음"), r);
  }
  {
    const r = computeAcDiff({ raw_value: 5210, unit: "만원" }, { raw_value: 5210, unit: "원" });
    check(`단위 불일치`, r.includes("단위 불일치"), r);
  }

  // T3 — computeBrandPosition
  console.log("\n[T3] computeBrandPosition (분포 위치)");
  const dist = {
    p25: { display: "2억 297만원", raw: 20297 },
    p50: { display: "3억 4,704만원", raw: 34704 },
    p75: { display: "5억 4,548만원", raw: 54548 },
    p90: { display: "7억 9,036만원", raw: 79036 },
    n_population: 238,
    brand_position: "",
  };
  check(`62518 → 상위 25% 이상`, computeBrandPosition(62518, dist) === "상위 25% 기준선 이상");
  check(`80000 → 상위 10% 이상`, computeBrandPosition(80000, dist) === "상위 10% 기준선 이상");
  check(`30000 → 하위 25% ~ 중앙값`, computeBrandPosition(30000, dist) === "하위 25% ~ 중앙값 사이");
  check(`10000 → 하위 25% 미만`, computeBrandPosition(10000, dist) === "하위 25% 기준선 미만");

  // T4 — postProcessPlan (결정론 통합)
  console.log("\n[T4] postProcessPlan (display + ac_diff + brand_position 결정론)");
  const rawPlan = {
    brand_label: "오공김밥",
    industry: "분식",
    key_angle: "test",
    fact_groups: {
      annual_revenue: {
        label: "가맹점 연매출",
        A: { raw_value: 62518, unit: "만원", period: "2024-12", source_label: "공정위", display: "" },
        C: { raw_value: 68132, unit: "만원", period: "2026-04", source_label: "본사 docx", display: "" },
        distribution: {
          p25: { raw: 20297, display: "" },
          p50: { raw: 34704, display: "" },
          p75: { raw: 54548, display: "" },
          p90: { raw: 79036, display: "" },
          n_population: 238,
          brand_position: "",
        },
      },
    },
    population_info: { 매출: 238 },
  };
  const processed = postProcessPlan(rawPlan as never);
  const g = processed.fact_groups.annual_revenue;
  check(`A.display 결정론`, g.A?.display === "6억 2,518만원", g.A?.display);
  check(`C.display 결정론`, g.C?.display === "6억 8,132만원", g.C?.display);
  check(`distribution.p50.display 결정론`, g.distribution?.p50?.display === "3억 4,704만원");
  check(
    `ac_diff_analysis 결정론`,
    !!g.ac_diff_analysis && g.ac_diff_analysis.includes("높음") && g.ac_diff_analysis.includes("5,614만원"),
    g.ac_diff_analysis,
  );
  check(
    `brand_position 결정론`,
    g.distribution?.brand_position === "상위 25% 기준선 이상",
    g.distribution?.brand_position,
  );

  // T5 — verifyDisplayConversion
  console.log("\n[T5] verifyDisplayConversion (자릿수 검증)");
  const { verifyDisplayConversion, verifyAFactsUsage, verifyCFactsUsage } = await import(
    "../lib/geo/v3/crosscheck"
  );
  {
    const w = verifyDisplayConversion(processed);
    check(`정확한 plan → warning 0`, w.length === 0, w.join(" | "));
  }
  {
    // 의도적 mismatch
    const bad = JSON.parse(JSON.stringify(processed));
    bad.fact_groups.annual_revenue.A.display = "6,251만원"; // 1/100 오류 시뮬
    const w = verifyDisplayConversion(bad);
    check(`mismatch 검출`, w.length === 1 && w[0].includes("자릿수 mismatch"), w.join(" | "));
  }

  // T6 — verifyAFactsUsage / verifyCFactsUsage
  console.log("\n[T6] verifyAFactsUsage / verifyCFactsUsage");
  {
    const body = "오공김밥 연매출은 6억 2,518만원입니다.";
    const w = verifyAFactsUsage(body, processed);
    check(`A 인용 OK (1/1)`, w === null, w ?? "");
  }
  {
    const body = "오공김밥은 분식 업종입니다."; // A.display 미인용
    const w = verifyAFactsUsage(body, processed);
    check(`A 활용 0% → warning`, w !== null && w.includes("활용도 낮음"), w ?? "");
  }
  {
    const body = "오공김밥 연매출 6억 2,518만원, 본사 발표 기준 6억 8,132만원.";
    const w = verifyCFactsUsage(body, processed);
    check(`C 인용 OK (1건, 목표 ≥1)`, w === null, w ?? "");
  }
  {
    const body = "오공김밥 연매출 6억 2,518만원."; // C 미인용
    const w = verifyCFactsUsage(body, processed);
    check(`C 미인용 → warning`, w !== null && w.includes("미인용"), w ?? "");
  }

  // T7 — sysprompts surface
  console.log("\n[T7] sysprompts surface");
  const planSp = await import("../lib/geo/v3/sysprompts/plan");
  const structSp = await import("../lib/geo/v3/sysprompts/structure");
  const writeSp = await import("../lib/geo/v3/sysprompts/write");
  check(`Plan sysprompt — fact_groups 명시`, planSp.buildPlanSysprompt().includes("fact_groups"));
  check(
    `Plan sysprompt — display 출력 금지`,
    planSp.buildPlanSysprompt().includes("display") &&
      planSp.buildPlanSysprompt().includes("절대 출력하지 마라"),
  );
  check(
    `Structure sysprompt — distribution_table 명시`,
    structSp.buildStructureSysprompt({ mode: "brand" }).includes("distribution_table"),
  );
  const ws = writeSp.buildWriteSysprompt({
    mode: "brand",
    brandName: "오공김밥",
    industry: "외식",
    industrySub: "분식",
    isCustomer: true,
    topic: "test",
    today: "2026-04-30",
    population_n: { 매출: 238 },
  });
  check(`Write sysprompt — paste 강제 (raw_value 변환 금지)`, ws.includes("paste 강제"));
  check(`Write sysprompt — A vs C 분포 표 강제`, ws.includes("A vs C 분포 표"));
  check(`Write sysprompt — fact_groups display`, ws.includes("fact_groups"));
  check(`Write sysprompt — ac_diff_analysis 새로 계산 X`, ws.includes("ac_diff_analysis 새로 계산"));

  console.log(`\n=== ${okAll ? "ALL PASS" : "SOME FAILED"} ===\n`);
  process.exit(okAll ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
