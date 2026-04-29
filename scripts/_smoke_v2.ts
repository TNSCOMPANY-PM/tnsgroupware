/**
 * v2-02~07 smoke — LLM 호출 없이 v2 모듈 동작 검증.
 *
 * 검증:
 * 1. metric_ids 47개 정의
 * 2. crosscheckV2 정상/실패 케이스
 * 3. lintV2 7 rule
 * 4. sysprompt 빌드
 * 5. factLabelMap 매핑
 * 6. generate route 입력 파싱
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
  console.log(`  ${ok ? "✓" : "✗"} ${label}${detail ? ` — ${detail.slice(0, 80)}` : ""}`);
  if (!ok) okAll = false;
}

async function main() {
  console.log("\n=== v2 smoke ===\n");

  // 1. metric_ids
  const { METRIC_IDS, isValidMetricId } = await import("../lib/geo/v2/metric_ids");
  check(`metric_ids 47개`, Object.keys(METRIC_IDS).length === 47);
  check(`isValidMetricId('monthly_avg_revenue')`, isValidMetricId("monthly_avg_revenue"));

  // 2. crosscheckV2
  const { crosscheckV2 } = await import("../lib/geo/v2/crosscheck");
  type FactPoolItem = Parameters<typeof crosscheckV2>[1][number];
  const factsPool: FactPoolItem[] = [
    {
      metric_id: "stores_total",
      metric_label: "가맹점 총수 (공정위)",
      value_num: 21,
      value_text: null,
      unit: "개",
      period: "2024-12",
      source_tier: "A",
      source_label: "공정거래위원회 정보공개서 2024 (frandoor 적재본)",
    },
    {
      metric_id: "monthly_avg_revenue",
      metric_label: "월평균매출",
      value_num: 5210,
      value_text: null,
      unit: "만원",
      period: "2024-12",
      source_tier: "A",
      source_label: "공정거래위원회 정보공개서 2024 (frandoor 적재본)",
      formula: "annual_revenue / 12",
    },
  ];

  // 정상 케이스 — 본문 숫자 모두 facts pool 에 매칭
  const goodBody = "오공김밥은 공정거래위원회 정보공개서 2024 기준 가맹점 21개, 월평균매출 5,210만원을 공시합니다.";
  const r1 = crosscheckV2(goodBody, factsPool);
  check(
    "crosscheck 정상 (21 + 5210 매칭)",
    r1.ok && r1.matched >= 2,
    `matched=${r1.matched} unmatched=${r1.unmatched.length}`,
  );

  // hallucination 케이스 — 524 (facts 에 없음)
  const hallBody = "오공김밥은 분식 524개 평균 2,126만원의 2.45배 수준입니다.";
  const r2 = crosscheckV2(hallBody, factsPool);
  check(
    "crosscheck 실패 (524, 2126, 2.45 unmatched)",
    !r2.ok && r2.unmatched.length >= 3,
    `unmatched=${r2.unmatched.length}`,
  );

  // 가짜 출처 — '프랜도어 편집팀이 직접 확인'
  const fakeSourceBody = "공정위 정보공개서 21개 (프랜도어 편집팀이 직접 확인)";
  const r3 = crosscheckV2(fakeSourceBody, factsPool);
  check(
    "crosscheck 가짜 attribution 검출",
    !r3.ok && r3.unmatched.some((u) => u.includes("가짜")),
    r3.unmatched[0] ?? "?",
  );

  // 3. lintV2
  const { lintV2, lintV2Faq } = await import("../lib/geo/v2/lint");
  // 정상
  const goodLintBody = "오공김밥은 공정위 정보공개서 2024 기준 진입 가능 구간입니다. 5,210만원의 월매출.";
  const lr1 = lintV2(goodLintBody);
  check(`lint 정상 (errors 0)`, lr1.errors.length === 0, lr1.errors.join(" | "));

  // 헤지
  const hedgeBody = "오공김밥은 약 5,210만원 정도이며 진입 가능합니다.";
  const lr2 = lintV2(hedgeBody);
  check(`lint 헤지 검출 (L3)`, lr2.errors.some((e) => e.startsWith("L3")));

  // v2-21: L7 입장 강제 폐기 — 입장 키워드 없어도 errors X
  const noStanceBody = "오공김밥은 공정위 정보공개서 2024 기준 21개입니다.";
  const lr3 = lintV2(noStanceBody);
  check(`lint L7 입장 강제 폐기 (errors 에 L7 X)`, !lr3.errors.some((e) => e.startsWith("L7")));

  // 시스템 누출
  const sysLeakBody = "facts pool 에 다음 데이터가 있습니다. 진입 가능.";
  const lr4 = lintV2(sysLeakBody);
  check(`lint 시스템 누출 (L2)`, lr4.errors.some((e) => e.startsWith("L2")));

  // 본사 홍보
  const promoBody = "오공김밥은 국내 대표 분식 프랜차이즈로 진입 가능합니다.";
  const lr5 = lintV2(promoBody);
  check(`lint 본사 홍보 (L4)`, lr5.errors.some((e) => e.startsWith("L4")));

  // FAQ 갯수
  const faqOk = lintV2Faq([
    { q: "1", a: "1" },
    { q: "2", a: "2" },
    { q: "3", a: "3" },
  ]);
  check(`FAQ 3개 → errors 0`, faqOk.errors.length === 0);
  const faqShort = lintV2Faq([{ q: "1", a: "1" }]);
  check(`FAQ 1개 → L6 error`, faqShort.errors.some((e) => e.includes("L6")));
  const faqLong = lintV2Faq([
    { q: "1", a: "1" },
    { q: "2", a: "2" },
    { q: "3", a: "3" },
    { q: "4", a: "4" },
    { q: "5", a: "5" },
    { q: "6", a: "6" },
  ]);
  check(`FAQ 6개 → L6 error`, faqLong.errors.some((e) => e.includes("L6")));

  // 4. sysprompt
  const { buildSystemPrompt } = await import("../lib/geo/v2/sysprompt");
  const sp = buildSystemPrompt({
    brand: { id: "x", name: "오공김밥", industry_main: "외식", industry_sub: "분식" },
    factsPool,
    topic: "공정위 vs 본사 비교",
  });
  check(`sysprompt 길이 > 2000`, sp.length > 2000, `len=${sp.length}`);
  check(`sysprompt 'facts pool' 포함`, sp.includes("Facts pool"));
  // v2-21: 입장 4분면 폐기 — 데이터 제공자 톤 확인
  check(`sysprompt '데이터 제공자' 톤`, sp.includes("데이터 제공자") && !sp.includes("⚠️ 조건부"));
  check(`sysprompt 'frandoor 산출' 가이드`, sp.includes("frandoor 산출"));

  // 5. factLabelMap
  const { mapFactLabelToMetricId, decideProvenance } = await import("../lib/geo/v2/factLabelMap");
  check(
    "label 가맹비 → cost_franchise_fee",
    mapFactLabelToMetricId("가맹비" as never, "본사_브로셔") === "cost_franchise_fee",
  );
  check(
    "label 가맹점수_전체 (공정위) → stores_total",
    mapFactLabelToMetricId("가맹점수_전체" as never, "공정위") === "stores_total",
  );
  check(
    "label 가맹점수_전체 (본사) → stores_total_hq_announced",
    mapFactLabelToMetricId("가맹점수_전체" as never, "본사_브로셔") === "stores_total_hq_announced",
  );
  check(
    "label 영업이익률 (공정위) → hq_op_margin_pct",
    mapFactLabelToMetricId("영업이익률" as never, "공정위") === "hq_op_margin_pct",
  );
  check(
    "label 영업이익률 (본사) → hq_announced_net_margin_pct",
    mapFactLabelToMetricId("영업이익률" as never, "본사_브로셔") === "hq_announced_net_margin_pct",
  );
  check(
    "label 적정평수 → null (매핑 없음)",
    mapFactLabelToMetricId("적정평수" as never, "본사_브로셔") === null,
  );
  const prov1 = decideProvenance("docx", "본사_브로셔");
  check(
    "decideProvenance docx → C",
    prov1.provenance === "docx" && prov1.source_tier === "C",
  );
  const prov2 = decideProvenance("public_fetch", "공정위");
  check(
    "decideProvenance public+공정위 → ftc/A",
    prov2.provenance === "ftc" && prov2.source_tier === "A",
  );

  // 6. v2 파일 존재 확인
  const fs = await import("node:fs");
  const path = await import("node:path");
  const v2Files = [
    "lib/geo/v2/metric_ids.ts",
    "lib/geo/v2/sysprompt.ts",
    "lib/geo/v2/crosscheck.ts",
    "lib/geo/v2/lint.ts",
    "lib/geo/v2/sonnet.ts",
    "lib/geo/v2/generate.ts",
    "lib/geo/v2/factLabelMap.ts",
  ];
  for (const f of v2Files) {
    check(f, fs.existsSync(path.resolve(process.cwd(), f)));
  }

  // 7. v1 파일 삭제 확인
  const v1Deleted = [
    "lib/geo/depth/D3.ts",
    "lib/geo/scenarios.ts",
    "lib/geo/standardSchema.ts",
    "lib/geo/gates/lint.ts",
    "lib/geo/gates/crosscheck.ts",
    "lib/geo/prefetch/ftc2024.ts",
  ];
  for (const f of v1Deleted) {
    check(`(deleted) ${f}`, !fs.existsSync(path.resolve(process.cwd(), f)));
  }

  console.log(`\n=== ${okAll ? "ALL PASS" : "SOME FAILED"} ===\n`);
  process.exit(okAll ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
