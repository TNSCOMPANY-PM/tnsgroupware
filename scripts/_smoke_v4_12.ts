/**
 * v4-12 smoke — 브로셔 dual 추출 + matchAndDiff source 필터 + 블럭 E 폐기 + 단위 환산.
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
  console.log("\n=== v4-12 smoke ===\n");

  // T1 — extract-facts SYSTEM_PROMPT dual 출처 룰
  console.log("[T1] extract-facts SYSTEM_PROMPT dual 출처 추출 룰");
  const fs = await import("node:fs/promises");
  const extractSrc = await fs.readFile("app/api/brands/[id]/extract-facts/route.ts", "utf-8");
  check(`rule 9 dual 출처 명시`, extractSrc.includes("같은 항목이 두 출처"));
  check(`source_type 분리 (공정위/본사_브로셔)`, extractSrc.includes('"공정위"') && extractSrc.includes('"본사_브로셔"'));
  check(`docx 비교 표 형식 명시`, extractSrc.includes("공정위 vs 브로셔") || extractSrc.includes("공정위 기준"));
  check(`예시 (가맹비 dual row)`, extractSrc.includes("가맹비") && extractSrc.includes("550") && extractSrc.includes("300"));
  check(`예시 (창업비용총액 dual row)`, extractSrc.includes("창업비용총액") && extractSrc.includes("6949") && extractSrc.includes("6500"));
  check(`confidence 차등 (0.95 / 0.85)`, extractSrc.includes("confidence 차등"));

  // T3 — matchAndDiff source 필터
  console.log("\n[T3] matchAndDiff source 필터 (A 보강 row skip)");
  const { matchAndDiff } = await import("../lib/geo/v4/match_and_diff");
  const aFacts = {
    brand_label: "오공김밥",
    industry: "한식",
    industry_sub: "분식",
    topic: "test",
    ftc_brand_id: "2295",
    selected_metrics: ["cost_franchise_fee"],
    key_angle: "k",
    fact_groups: {
      cost_franchise_fee: {
        label: "가맹비",
        A: {
          display: "550만원",
          raw_value: 550,
          unit: "만원",
          period: "2024-12",
          source: "공정위 정보공개서",
        },
      },
    },
    population_info: {},
  };
  // 공정위 row + 본사_브로셔 row dual
  const docxDual = [
    {
      label: "가맹비",
      value: "5,500천원 (550만원)",
      value_normalized: 550,
      unit: "만원",
      source_type: "공정위",
      source_note: "공정거래위원회 정보공개서, 단위: 천원",
    },
    {
      label: "가맹비",
      value: "300만원",
      value_normalized: 300,
      unit: "만원",
      source_type: "본사_브로셔",
      source_note: "본사 공식 브로셔",
    },
  ];
  const r1 = matchAndDiff({ a_facts: aFacts, docx_facts_raw: docxDual });
  check(
    `A 보강 row (공정위) skip → c_facts 1건만 (본사_브로셔)`,
    Object.keys(r1.fact_groups).length === 1,
    `groups=${Object.keys(r1.fact_groups).join(",")}`,
  );
  check(`c_only_facts 도 0 (skip 된 row 가 c_only 로 새지 않음)`, r1.c_only_facts.length === 0);

  // source_note 가 "정보공개서" 만 있어도 skip
  const r2 = matchAndDiff({
    a_facts: aFacts,
    docx_facts_raw: [
      {
        label: "가맹비",
        value: "550만원",
        value_normalized: 550,
        unit: "만원",
        source_type: "본사_브로셔",
        source_note: "공정거래위원회 정보공개서 인용",
      },
    ],
  });
  check(
    `source_note "정보공개서" 포함 → skip`,
    Object.keys(r2.fact_groups).length === 0 && r2.c_only_facts.length === 0,
  );

  // 진짜 C 만 — 본사_브로셔 + source_note 본사 자료
  const r3 = matchAndDiff({
    a_facts: aFacts,
    docx_facts_raw: [
      {
        label: "가맹비",
        value: "300만원",
        value_normalized: 300,
        unit: "만원",
        source_type: "본사_브로셔",
        source_note: "본사 공식 브로셔",
      },
    ],
  });
  check(`본사_브로셔 row → fact_groups 1건 매칭`, Object.keys(r3.fact_groups).length === 1);

  // T4 — writer sysprompt — A vs C 표기 + 본사 측 자료 룰
  console.log("\n[T4] writer sysprompt — A vs C / 본사 측 자료 룰");
  const writer = await import("../lib/geo/v4/sysprompts/writer");
  const sp = writer.buildWriterSysprompt({
    brand_label: "오공김밥",
    industry: "외식",
    industry_sub: "분식",
    topic: "분식 평균 매출 비교",
    today: "2026-05-04",
    hasDocx: true,
  });
  check(`A vs C 비교표 룰 헤더`, sp.includes("A vs C 비교표 룰"));
  check(`c_facts 0건 fallback 문구`, sp.includes("불일치 항목 없음"));
  check(`본사 측 자료 표기 룰 헤더`, sp.includes('"본사 측 자료" 표기 룰'));
  check(`정보공개서 본사 재무 항목 표기`, sp.includes("정보공개서") && sp.includes("본사 재무 항목"));
  check(`혼동 금지 예시 (천원 단위 노출)`, sp.includes("천원"));

  // T5 — 블럭 E 폐기 / 4블럭 / 4,500자 / max_tokens 3500
  console.log("\n[T5] 블럭 E 폐기 → 4블럭 / 4,500자 / max_tokens 3500");
  check(`4블럭 명시`, sp.includes("4블럭"));
  check(`4,500자 한도`, sp.includes("4,500자"));
  check(`블럭 E 폐기 명시`, sp.includes("E 폐기") || sp.includes("E (결론") || sp.includes("결론 체크리스트는 폐기"));
  check(`이전 5블럭 가이드 제거`, !sp.includes("# 본문 구조 — 5블럭"));
  check(`이전 5,500자 한도 제거`, !sp.includes("5,500자 한도"));
  check(`블럭 D 끝 마무리 한 줄`, sp.includes("자본·상권·운영 역량과 비교 검토"));

  const pipelineSrc = await fs.readFile("lib/geo/v4/pipeline.ts", "utf-8");
  check(`pipeline maxTokens: 3500`, pipelineSrc.includes("maxTokens: 3500"));
  check(`pipeline maxTokens: 3000 제거`, !pipelineSrc.includes("maxTokens: 3000"));
  check(`v4-12 마커`, pipelineSrc.includes("v4-12"));

  // T6 — formatToDisplay 단위 환산
  console.log("\n[T6] formatToDisplay 단위 환산 (천원/원 → 만원/억원)");
  const { formatToDisplay } = await import("../lib/geo/v3/plan_format");
  // 천원 → 원 → 만원/억원
  check(
    `formatToDisplay(379780, "천원") = "3억 7,978만원"`,
    formatToDisplay(379780, "천원") === "3억 7,978만원",
    formatToDisplay(379780, "천원"),
  );
  check(
    `formatToDisplay(50000, "천원") = "5,000만원"`,
    formatToDisplay(50000, "천원") === "5,000만원",
    formatToDisplay(50000, "천원"),
  );
  // 원 → 만원/억원
  check(
    `formatToDisplay(379_780_000, "원") = "3억 7,978만원"`,
    formatToDisplay(379_780_000, "원") === "3억 7,978만원",
    formatToDisplay(379_780_000, "원"),
  );
  check(
    `formatToDisplay(50_000_000, "원") = "5,000만원"`,
    formatToDisplay(50_000_000, "원") === "5,000만원",
    formatToDisplay(50_000_000, "원"),
  );
  check(
    `formatToDisplay(8_500, "원") = "8,500원" (1만원 미만 유지)`,
    formatToDisplay(8_500, "원") === "8,500원",
    formatToDisplay(8_500, "원"),
  );
  // 회귀
  check(
    `formatToDisplay(62517, "만원") = "6억 2,517만원" (회귀)`,
    formatToDisplay(62517, "만원") === "6억 2,517만원",
  );
  check(
    `formatToDisplay(0, "만원") = "데이터 없음" (v4-11 회귀)`,
    formatToDisplay(0, "만원") === "데이터 없음",
  );

  console.log(`\n=== ${okAll ? "ALL PASS" : "SOME FAILED"} ===\n`);
  process.exit(okAll ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
