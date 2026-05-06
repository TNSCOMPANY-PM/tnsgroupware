/**
 * v4-19 smoke — 영문 잔여 정리 + Why 패턴 + 출처 outbound link footer.
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

import type { IndustryAnalysisFacts } from "../lib/geo/v4/types";

function buildSampleFacts(): IndustryAnalysisFacts {
  return {
    industry: "중식",
    n_brands: 380,
    topic: "중식 평균 매출 분포 분석",
    key_angle: "중식 380개 브랜드 매출 격차",
    analysis_axes: ["분포 분석", "ranking", "outlier"],
    selected_metrics: ["avg_sales_2024_total"],
    ranking_metric: "avg_sales_2024_total",
    distributions: {
      avg_sales_2024_total: {
        // ★ label 에 "(2024)" + " — 전체" suffix 동시 포함
        label: "가맹점 평균 연매출 — 전체 (2024)",
        unit: "만원",
        n_population: 380,
        p25: { display: "3,500만원", raw: 3500 },
        p50: { display: "1억 2,000만원", raw: 12000 },
        p75: { display: "2억 5,000만원", raw: 25000 },
        p90: { display: "4억 8,000만원", raw: 48000 },
        p95: { display: "7억원", raw: 70000 },
        mean: { display: "1억 9,000만원", raw: 19000 },
      },
      hq_total_asset: {
        label: "본사 자산총계 (2024)",
        unit: "만원",
        n_population: 380,
        p25: { display: "5억원", raw: 50000 },
        p50: { display: "20억원", raw: 200000 },
        p75: { display: "80억원", raw: 800000 },
        p90: { display: "200억원", raw: 2000000 },
        p95: { display: "500억원", raw: 5000000 },
        mean: { display: "60억원", raw: 600000 },
      },
    },
    ranking: {
      metric_id: "avg_sales_2024_total",
      label: "가맹점 평균 연매출 — 전체 (2024)",
      unit: "만원",
      top10: [
        { brand_label: "일일향", value: { display: "23억 7,722만원", raw: 237722 } },
        { brand_label: "무궁화반점", value: { display: "20억 8,332만원", raw: 208332 } },
      ],
      bottom10: [],
    },
    outliers: [
      { brand_label: "일일향", metric_id: "avg_sales_2024_total", value: { display: "23억 7,722만원", raw: 237722 }, deviation: "상단", sigma: 4.1 },
    ],
  };
}

async function main() {
  console.log("\n=== v4-19 smoke ===\n");

  const fs = await import("node:fs/promises");
  const fm = await import("../lib/geo/v4/build_industry_frontmatter");

  // T1 — frontmatter description 자연어
  console.log("[T1] frontmatter description — 영문 0 + cleanLabel 강화");
  const facts = buildSampleFacts();
  const frontmatter = fm.buildIndustryFrontmatter({
    topic: "중식 평균 매출 분포 분석",
    industry: "중식",
    draft_id: "abc12345-...",
    today: "2026-05-06",
    facts,
  });
  check(`description "ranking + outlier" 영문 0`, !frontmatter.description.includes("ranking") && !frontmatter.description.includes("outlier"));
  check(`description "상위 브랜드와 분포 차이" 한국어`, frontmatter.description.includes("상위 브랜드와 분포 차이"));
  // cleanLabel 적용 — "(2024)" 와 " — 전체" 모두 제거
  check(
    `description label "(2024)" 제거`,
    !frontmatter.description.includes("(2024)"),
    frontmatter.description,
  );
  check(
    `description label " — 전체" 제거`,
    !/—\s*전체/.test(frontmatter.description),
    frontmatter.description,
  );
  // n_brands + 출처
  check(`description "380개 브랜드"`, frontmatter.description.includes("380개 브랜드"));
  check(`description "공정위 정보공개서"`, frontmatter.description.includes("공정위 정보공개서"));

  // T2 — FAQ 답변 cleanLabel 적용 + metric 영문 0
  console.log("\n[T2] FAQ — cleanLabel 적용 + metric 영문 0");
  const faq = fm.buildIndustryFaq({ industry: "중식", facts });
  check(`FAQ 5건`, faq.length === 5);

  for (const f of faq) {
    check(
      `FAQ '${f.q.slice(0, 25)}' — 영문 0 (ranking/outlier/metric/—전체)`,
      !/ranking|outlier|metric|—\s*전체|\bmetric\s*별/i.test(f.a) &&
        !/ranking|outlier|metric|—\s*전체/i.test(f.q),
      `Q: ${f.q} | A: ${f.a}`,
    );
  }

  // ranking FAQ — "(2024)" / " — 전체" 제거됨
  const rankFaq = faq.find((f) => f.q.includes("상위 브랜드"));
  check(`ranking FAQ — "(2024)" 제거`, !!rankFaq && !rankFaq.q.includes("(2024)"));
  check(`ranking FAQ — " — 전체" 제거`, !!rankFaq && !/—\s*전체/.test(rankFaq.q));
  // " — 전체" suffix 제거 → "가맹점 평균 연매출" base label 유지.
  check(`ranking FAQ — 자연어 "가맹점 평균 연매출"`, !!rankFaq && rankFaq.q.includes("가맹점 평균 연매출"));

  // T3 — generic fallback "metric" → "항목"
  console.log("\n[T3] generic fallback — 'metric' → '항목'");
  const emptyFacts: IndustryAnalysisFacts = {
    industry: "치킨",
    n_brands: 500,
    topic: "치킨 분석",
    key_angle: "k",
    analysis_axes: [],
    selected_metrics: [],
    ranking_metric: "avg_sales_2024_total",
    distributions: {},
    ranking: { metric_id: "avg_sales_2024_total", label: "가맹점 평균 연매출 — 전체 (2024)", unit: "만원", top10: [], bottom10: [] },
    outliers: [],
  };
  const fallbackFaq = fm.buildIndustryFaq({ industry: "치킨", facts: emptyFacts });
  check(`fallback 5건`, fallbackFaq.length === 5);
  // "metric 별" 영문 0
  for (const f of fallbackFaq) {
    check(
      `fallback FAQ '${f.q.slice(0, 25)}' — 'metric' / 'metric 별' 영문 0`,
      !/metric/i.test(f.a),
      f.a,
    );
  }
  // "항목별" 자연어 등장
  const methodFaq = fallbackFaq.find((f) => f.q.includes("분포 비교"));
  check(`fallback "분포 비교" 답변 — "항목별" 자연어`, !!methodFaq && methodFaq.a.includes("항목별 분포"));
  const outlierBasisFaq = fallbackFaq.find((f) => f.q.includes("두드러지게 차이"));
  check(`fallback "outlier 추출" 답변 — "항목별 평균"`, !!outlierBasisFaq && outlierBasisFaq.a.includes("항목별 평균"));

  // T4 — writer_a_only Why 패턴 + footer 안내
  console.log("\n[T4] writer_a_only — Why 패턴 + footer 안내");
  const writer = await import("../lib/geo/v4/sysprompts/writer_a_only");
  const sp = writer.buildWriterAOnlySysprompt({
    industry: "중식",
    topic: "중식 매출 분포",
    n_brands: 380,
    today: "2026-05-06",
  });
  check(`Why 패턴 가이드 헤더`, sp.includes("Why 패턴"));
  check(`Why 한 문장 권장`, sp.includes("격차가 발생하는 구조적 배경"));
  check(`Why 예시 (운영 모델)`, sp.includes("운영 모델") || sp.includes("입지 집중도"));
  // footer 안내
  check(`출처 footer 코드 자동 추가 명시`, sp.includes("출처 footer"));
  check(`franchise.ftc.go.kr 명시`, sp.includes("franchise.ftc.go.kr"));
  check(`본문 출처 link 추가 X 명시`, sp.includes("출처 markdown link 추가 X") || sp.includes("출처 markdown link"));

  // T5 — pipeline.ts source footer
  console.log("\n[T5] pipeline runStep3WriteAOnly — source footer 자동 추가");
  const pipelineSrc = await fs.readFile("lib/geo/v4/pipeline.ts", "utf-8");
  check(`sourceFooter 변수`, pipelineSrc.includes("sourceFooter"));
  check(`franchise.ftc.go.kr outbound link`, pipelineSrc.includes("franchise.ftc.go.kr"));
  check(`** 출처 ** markdown bold`, pipelineSrc.includes("**출처**:"));
  check(`**모집단** 명시`, pipelineSrc.includes("**모집단**:"));
  check(`finalContent body + sourceFooter`, pipelineSrc.includes("${processed.body.trim()}\\n${sourceFooter}"));
  check(`v4-19 마커`, pipelineSrc.includes("v4-19"));

  // T1b — cleanLabel 단위 테스트 (export 안 됨 — frontmatter description 통해 간접)
  console.log("\n[T1b] cleanLabel 강화 — 다양한 suffix");
  // "본사 자산총계 (2024)" — 다른 metric
  const facts2 = buildSampleFacts();
  // ranking label 을 "본사 자산총계 (2024)" 로 바꾼 facts
  facts2.ranking.label = "본사 자산총계 (2024)";
  const fm2 = fm.buildIndustryFrontmatter({
    topic: "test",
    industry: "중식",
    draft_id: "x",
    today: "2026-05-06",
    facts: facts2,
  });
  check(`"(2024)" 제거`, !fm2.description.includes("(2024)"), fm2.description);
  check(`base label "본사 자산총계" 보존`, fm2.description.includes("본사 자산총계"), fm2.description);

  console.log(`\n=== ${okAll ? "ALL PASS" : "SOME FAILED"} ===\n`);
  process.exit(okAll ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
