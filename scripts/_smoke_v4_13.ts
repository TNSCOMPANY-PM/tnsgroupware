/**
 * v4-13 smoke — 블럭 D 폐기 + frontmatter/FAQ 코드 분리 + "본사 데이터" 표기 통일.
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

import type { AFactsResult, CFactsResult } from "../lib/geo/v4/types";

function buildSampleA(): AFactsResult {
  return {
    brand_label: "오공김밥",
    industry: "외식",
    industry_sub: "분식",
    topic: "오공김밥 분식 평균 대비 매출 + 본사 재무 분석",
    ftc_brand_id: "2295",
    selected_metrics: [
      "startup_cost_total",
      "avg_sales_2024_total",
      "startup_fee",
      "fin_2024_revenue",
      "fin_2024_op_profit",
      "frcs_cnt_2024_total",
    ],
    key_angle: "분식 평균 대비 매출 우위 + 본사 수익성 약점",
    fact_groups: {
      startup_cost_total: {
        label: "창업비용 총액",
        A: { display: "6,949만원", raw_value: 6949, unit: "만원", period: "2024-12", source: "공정위 정보공개서(2024-12)" },
      },
      avg_sales_2024_total: {
        label: "가맹점 평균 연매출",
        A: { display: "6억 2,517만원", raw_value: 62517, unit: "만원", period: "2024-12", source: "공정위 정보공개서(2024-12)" },
        distribution: {
          p25: { display: "2억 297만원", raw: 20297 },
          p50: { display: "3억 4,704만원", raw: 34704 },
          p75: { display: "5억 4,548만원", raw: 54548 },
          p90: { display: "7억 9,036만원", raw: 79036 },
          n_population: 238,
          brand_position: "상위 25% 기준선 이상",
        },
      },
      startup_fee: {
        label: "가맹비",
        A: { display: "550만원", raw_value: 550, unit: "만원", period: "2024-12", source: "공정위 정보공개서(2024-12)" },
      },
      fin_2024_revenue: {
        label: "본사 매출 (2024)",
        A: { display: "28억원", raw_value: 280000, unit: "만원", period: "2024-12", source: "공정위 정보공개서(2024-12)" },
      },
      fin_2024_op_profit: {
        label: "본사 영업이익 (2024)",
        A: { display: "5,040만원", raw_value: 5040, unit: "만원", period: "2024-12", source: "공정위 정보공개서(2024-12)" },
      },
      frcs_cnt_2024_total: {
        label: "전체 가맹점수 (2024)",
        A: { display: "55개", raw_value: 55, unit: "개", period: "2024-12", source: "공정위 정보공개서(2024-12)" },
      },
    },
    population_info: { avg_sales_2024_total: 238 },
  };
}

function buildSampleC(): CFactsResult {
  return {
    fact_groups: {
      startup_fee: {
        label: "가맹비",
        C: { display: "300만원", raw_value: 300, value_text: "300만원", unit: "만원", source: "본사 데이터" },
        ac_diff_analysis: "본사 데이터가 정보공개서 대비 250만원(45.5%) 낮음",
      },
    },
    c_only_facts: [
      {
        label: "수상",
        value_num: null,
        value_text: "2025 네이버 주문 어워즈 우수 브랜드",
        unit: "없음",
        source: "본사 데이터",
      },
      {
        label: "가맹점수_POS",
        value_num: 52,
        value_text: null,
        unit: "개",
        source: "본사 데이터",
      },
    ],
    ac_diff_summary: "A 와 매칭된 본사 metric 1건 (가맹비). C 단독 narrative 2건.",
  };
}

async function main() {
  console.log("\n=== v4-13 smoke ===\n");

  // T1 — writer sysprompt 본문 3블럭 + 본사 데이터 표기 + frontmatter/FAQ 제외
  console.log("[T1] writer sysprompt — 3블럭 / 본사 데이터 / frontmatter·FAQ 제외");
  const writer = await import("../lib/geo/v4/sysprompts/writer");
  const sp = writer.buildWriterSysprompt({
    brand_label: "오공김밥",
    industry: "외식",
    industry_sub: "분식",
    topic: "test",
    today: "2026-05-04",
    hasDocx: true,
  });
  check(`3블럭 명시`, sp.includes("3블럭"));
  check(`4,000자 한도`, sp.includes("4,000자"));
  check(`블럭 D 폐기 명시`, sp.includes("블럭 D") && sp.includes("폐기"));
  check(`이전 4블럭 가이드 제거`, !sp.includes("# 본문 구조 — 4블럭"));
  check(`이전 4,500자 한도 제거`, !sp.includes("4,500자 한도"));
  check(`★ 본사 데이터 통일 룰`, sp.includes('"본사 데이터" 표기 통일') || sp.includes("\"본사 데이터\" 한 가지"));
  check(`금지 표현 — 본사 측 자료`, sp.includes("본사 측 자료"));
  check(`금지 표현 — 본사 발표`, sp.includes("본사 발표"));
  check(`금지 표현 — 브로셔 단독`, sp.includes("브로셔 단독"));
  check(`★ frontmatter/FAQ 출력 금지`, sp.includes("frontmatter / FAQ 출력 금지") || sp.includes("frontmatter / FAQ 출력 X"));
  check(`A vs C 표 header 정정`, sp.includes("정보공개서 (A급) | 본사 데이터 (C급)"));

  // T2 — buildFrontmatter 코드
  console.log("\n[T2] buildFrontmatter — title/description/slug/tags");
  const { buildFrontmatter } = await import("../lib/geo/v4/build_frontmatter");
  const fm = buildFrontmatter({
    topic: "오공김밥 분식 평균 대비 매출 비교",
    brand_label: "오공김밥",
    industry: "분식",
    brand_id: "82c7ffc9-ed53-44bf-859d-a9a72b147b20",
    today: "2026-05-04",
    a_facts: buildSampleA(),
    c_facts: buildSampleC(),
  });
  check(`title = topic`, fm.title === "오공김밥 분식 평균 대비 매출 비교");
  check(`description 창업비용 포함`, fm.description.includes("6,949만원"));
  check(`description 평균 연매출 포함`, fm.description.includes("6억 2,517만원"));
  check(`description 분포 N 포함`, fm.description.includes("238개 브랜드"));
  check(`description 출처`, fm.description.includes("공정위 정보공개서"));
  check(`slug 결정론`, fm.slug === "82c7ffc9-2026", fm.slug);
  check(`category = 브랜드 분석`, fm.category === "브랜드 분석");
  check(`date = today`, fm.date === "2026-05-04");
  check(`tags 포함 brand`, fm.tags.includes("오공김밥"));
  check(`tags 포함 industry`, fm.tags.includes("분식"));

  // T3 — buildFaq 코드
  console.log("\n[T3] buildFaq — 5문항 + A vs C 차이 자동 병기");
  const { buildFaq } = await import("../lib/geo/v4/build_faq");
  const faq = buildFaq({
    brand_label: "오공김밥",
    industry: "분식",
    a_facts: buildSampleA(),
    c_facts: buildSampleC(),
  });
  check(`FAQ 5건`, faq.length === 5, `len=${faq.length}`);
  // Q1 — 창업비용
  const qCost = faq.find((f) => f.q.includes("창업비용"));
  check(`Q1 창업비용`, !!qCost && qCost.a.includes("6,949만원"));
  // Q3 — 가맹비 + A vs C 차이 (정보공개서 550 vs 본사 데이터 300)
  const qFee = faq.find((f) => f.q.includes("가맹비"));
  check(
    `Q3 가맹비 + 본사 데이터 병기`,
    !!qFee && qFee.a.includes("550만원") && qFee.a.includes("300만원") && qFee.a.includes("본사 데이터"),
    qFee?.a,
  );
  // Q5 — 가맹점수 + POS narrative
  const qStores = faq.find((f) => f.q.includes("가맹점 수"));
  check(
    `Q5 가맹점수 + 본사 데이터 (POS) 병기`,
    !!qStores && qStores.a.includes("55개") && qStores.a.includes("52"),
    qStores?.a,
  );
  // 모든 FAQ 답변에 "본사 발표" / "본사 측" / "브로셔 단독" 등 변형 표현 0건
  for (const f of faq) {
    check(
      `FAQ '${f.q.slice(0, 20)}...' 변형 표현 0`,
      !f.a.includes("본사 발표") &&
        !f.a.includes("본사 측") &&
        !f.a.includes("브로셔 단독") &&
        !f.a.includes("C급 단독"),
      f.a,
    );
  }

  // T4 — render YAML + FAQ block
  console.log("\n[T4] renderFrontmatterYaml + renderFaqBlock");
  const { renderFrontmatterYaml, renderFaqBlock } = await import("../lib/geo/v4/render_frontmatter");
  const yaml = renderFrontmatterYaml(fm, faq);
  check(`yaml 시작 ---`, yaml.startsWith("---"));
  check(`yaml 종료 ---`, yaml.trimEnd().endsWith("---"));
  check(`yaml title`, yaml.includes('title: "오공김밥 분식 평균 대비 매출 비교"'));
  check(`yaml slug`, yaml.includes('slug: "82c7ffc9-2026"'));
  check(`yaml date`, yaml.includes('date: "2026-05-04"'));
  check(`yaml tags array`, yaml.includes('tags: ["오공김밥"'));
  check(`yaml faq block`, yaml.includes("faq:"));
  check(`yaml faq q count`, yaml.split('  - q:').length - 1 === 5);

  const fb = renderFaqBlock(faq);
  check(`FAQ section header`, fb.startsWith("## FAQ"));
  check(`FAQ 5문항 명시`, fb.includes("(5문항)"));
  check(`FAQ Q. prefix`, (fb.match(/\*\*Q\./g) ?? []).length === 5);
  check(`FAQ A. prefix`, (fb.match(/\nA\./g) ?? []).length === 5);

  // T5 — pipeline 모듈 — buildFrontmatter / buildFaq / renderFrontmatterYaml import
  console.log("\n[T5] pipeline 모듈 surface (frontmatter/FAQ 코드 분리)");
  const fs = await import("node:fs/promises");
  const pipelineSrc = await fs.readFile("lib/geo/v4/pipeline.ts", "utf-8");
  check(`buildFrontmatter import`, pipelineSrc.includes("buildFrontmatter"));
  check(`buildFaq import`, pipelineSrc.includes("buildFaq"));
  check(`renderFrontmatterYaml import`, pipelineSrc.includes("renderFrontmatterYaml"));
  check(`renderFaqBlock import`, pipelineSrc.includes("renderFaqBlock"));
  check(`parseTitle 제거`, !pipelineSrc.includes("function parseTitle"));
  check(`parseFaq 제거`, !pipelineSrc.includes("function parseFaq"));
  check(`v4-13 마커`, pipelineSrc.includes("v4-13"));

  // T6 — maxTokens 3000
  console.log("\n[T6] callSonnet maxTokens 3500 → 3000");
  check(`maxTokens: 3000 (v4-13)`, pipelineSrc.includes("maxTokens: 3000"));
  check(`maxTokens: 3500 제거`, !pipelineSrc.includes("maxTokens: 3500"));

  // T7 — matchAndDiff source_label 통일
  console.log("\n[T7] matchAndDiff source_label = '본사 데이터'");
  const { matchAndDiff } = await import("../lib/geo/v4/match_and_diff");
  const aFacts = buildSampleA();
  const r = matchAndDiff({
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
  const cGroup = Object.values(r.fact_groups)[0];
  check(
    `matched C source = "본사 데이터"`,
    cGroup?.C?.source === "본사 데이터",
    cGroup?.C?.source,
  );

  // T8 — A vs C 비교표 header in sysprompt
  console.log("\n[T8] A vs C 비교표 header (정보공개서 / 본사 데이터)");
  check(`header — 정보공개서 (A급)`, sp.includes("정보공개서 (A급)"));
  check(`header — 본사 데이터 (C급)`, sp.includes("본사 데이터 (C급)"));
  check(`차이 설명 패턴`, sp.includes("본사 데이터가 정보공개서 대비"));

  // T8b — computeAcDiff 출력도 "본사 데이터" 사용
  console.log("\n[T8b] computeAcDiff 출력 표기 통일");
  const { computeAcDiff } = await import("../lib/geo/v3/plan_format");
  const diff = computeAcDiff({ raw_value: 550, unit: "만원" }, { raw_value: 300, unit: "만원" });
  check(
    `computeAcDiff "본사 데이터가 정보공개서 대비"`,
    diff.includes("본사 데이터가 정보공개서 대비"),
    diff,
  );
  check(`computeAcDiff 변형 표현 0`, !diff.includes("본사 발표가"));

  console.log(`\n=== ${okAll ? "ALL PASS" : "SOME FAILED"} ===\n`);
  process.exit(okAll ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
