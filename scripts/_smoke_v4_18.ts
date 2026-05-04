/**
 * v4-18 smoke — 시그마 금지 + 블럭 라벨 X + FAQ 5문항 강제 + max 3500 + metric label 자연어.
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
    industry: "한식",
    n_brands: 1000,
    topic: "한식 폐점률 분석",
    key_angle: "한식 1000개 브랜드 안에서 계약 해지 격차",
    analysis_axes: ["분포 분석", "ranking", "outlier"],
    selected_metrics: ["avg_sales_2024_total", "frcs_cnt_2024_total", "chg_2024_contract_cancel"],
    ranking_metric: "chg_2024_contract_cancel",
    distributions: {
      avg_sales_2024_total: {
        label: "가맹점 평균 연매출 — 전체 (2024)",
        unit: "만원",
        n_population: 1000,
        p25: { display: "2,500만원", raw: 2500 },
        p50: { display: "1억 3,417만원", raw: 13417 },
        p75: { display: "2억 8,123만원", raw: 28123 },
        p90: { display: "5억 991만원", raw: 50991 },
        p95: { display: "7억 5,000만원", raw: 75000 },
        mean: { display: "2억 102만원", raw: 20102 },
      },
      frcs_cnt_2024_total: {
        label: "전체 가맹점 수 (2024)",
        unit: "개",
        n_population: 1000,
        p25: { display: "5개", raw: 5 },
        p50: { display: "20개", raw: 20 },
        p75: { display: "60개", raw: 60 },
        p90: { display: "150개", raw: 150 },
        p95: { display: "250개", raw: 250 },
        mean: { display: "45개", raw: 45 },
      },
      chg_2024_contract_cancel: {
        label: "계약 해지 (2024)",
        unit: "건",
        n_population: 1000,
        p25: { display: "0건", raw: 0 },
        p50: { display: "2건", raw: 2 },
        p75: { display: "10건", raw: 10 },
        p90: { display: "30건", raw: 30 },
        p95: { display: "50건", raw: 50 },
        mean: { display: "8건", raw: 8 },
      },
    },
    ranking: {
      metric_id: "chg_2024_contract_cancel",
      label: "계약 해지 (2024)",
      unit: "건",
      top10: [
        { brand_label: "인생김치찌개", value: { display: "105건", raw: 105 } },
        { brand_label: "인생냉면", value: { display: "82건", raw: 82 } },
        { brand_label: "본죽", value: { display: "72건", raw: 72 } },
      ],
      bottom10: [
        { brand_label: "신생브랜드A", value: { display: "0건", raw: 0 } },
      ],
    },
    outliers: [
      { brand_label: "인생김치찌개", metric_id: "chg_2024_contract_cancel", value: { display: "105건", raw: 105 }, deviation: "상단", sigma: 5.7 },
      { brand_label: "인생냉면", metric_id: "chg_2024_contract_cancel", value: { display: "82건", raw: 82 }, deviation: "상단", sigma: 4.3 },
      { brand_label: "본죽", metric_id: "chg_2024_contract_cancel", value: { display: "72건", raw: 72 }, deviation: "상단", sigma: 3.7 },
    ],
  };
}

async function main() {
  console.log("\n=== v4-18 smoke ===\n");

  const fs = await import("node:fs/promises");

  // T1 — writer_a_only sysprompt 통계 용어 / 블럭 라벨 / metric label 룰
  console.log("[T1] writer_a_only sysprompt — sigma/블럭라벨/metric label 룰");
  const writer = await import("../lib/geo/v4/sysprompts/writer_a_only");
  const sp = writer.buildWriterAOnlySysprompt({
    industry: "한식",
    topic: "한식 폐점률 분석",
    n_brands: 1000,
    today: "2026-05-04",
  });
  // 통계 용어 금지 룰
  check(`★ 통계 용어 본문 등장 X 룰`, sp.includes("통계 용어 본문 등장 절대 X"));
  check(`σ / 표준편차 / 정규분포 명시 금지`, sp.includes("σ") && sp.includes("표준편차") && sp.includes("정규분포"));
  check(`outlier (영문) 금지`, sp.includes('"outlier"'));
  check(`자연어 변환 가이드 (평균과 두드러지게)`, sp.includes("두드러지게 차이 나는"));
  check(`+5.7σ 자연어 변환 예시`, sp.includes("평균보다 약 5배"));
  // 블럭 라벨 룰
  check(`★ 블럭 라벨 본문 노출 X 룰`, sp.includes("블럭 라벨 본문 노출 X"));
  check(`자연 헤더 권장 (## 분포 분석)`, sp.includes("## 분포 분석"));
  check(`자연 헤더 권장 (## 랭킹과 이례적 사례)`, sp.includes("## 랭킹과 이례적 사례") || sp.includes("## 상위·하위 브랜드"));
  // metric label 룰
  check(`★ metric label 괄호 자연어 변환 룰`, sp.includes("metric label 괄호 표기 자연어 변환"));
  check(`(2024) → 2024년 예시`, sp.includes("2024년 계약 해지 건수"));
  check(`이전 verbatim "+2σ outlier" 제거`, !sp.includes("평균 +2σ 위 outlier"));
  // 본문 길이 4,500자 / 3블럭
  check(`본문 4,500자 한도`, sp.includes("4,500자"));
  check(`이전 4,000자 한도 제거`, !sp.includes("4,000자 한도"));
  check(`훅 헤더 X 명시`, sp.includes("[훅]") && sp.includes("헤더 X"));
  check(`3블럭 분량 (훅 400 / 1,800 / 2,300)`, sp.includes("훅 400") && sp.includes("1,800") && sp.includes("2,300"));
  // 금지 표현 추가
  check(`자동 reject — σ/표준편차/정규분포`, sp.includes("σ") && sp.includes("정규분포"));
  check(`자동 reject — 블럭 라벨`, sp.includes("[블럭 A]") && sp.includes("블럭 B —"));
  check(`자동 reject — (2024) 괄호 표기`, sp.includes('"(2024)"'));
  // outlier narrative 가이드
  check(`outlier narrative 가이드 헤더`, sp.includes("outlier (평균과 두드러지게 차이 나는 브랜드) narrative 가이드"));
  check(`sigma 본문 X 명시`, sp.includes("sigma 값") && sp.includes("본문 등장 X"));

  // user prompt
  const wuser = writer.buildWriterAOnlyUserPrompt({
    topic: "한식 폐점률",
    industry: "한식",
    a_only_facts: buildSampleFacts(),
  });
  check(`user — sigma 금지 ★ 명시`, wuser.includes("σ") && wuser.includes("자연어"));
  check(`user — [블럭] 라벨 X 명시`, wuser.includes("블럭"));
  check(`user — (2024) 괄호 자연어 명시`, wuser.includes('"(2024)"'));

  // T3 — pipeline maxTokens 3000 → 3500
  console.log("\n[T3] pipeline runStep3WriteAOnly maxTokens: 3500");
  const pipelineSrc = await fs.readFile("lib/geo/v4/pipeline.ts", "utf-8");
  // v4-13 (A+C write) 는 3000 유지 — A only 만 3500
  check(`maxTokens: 3500 (v4-18 A only)`, pipelineSrc.includes("maxTokens: 3500"));
  check(`v4-18 마커`, pipelineSrc.includes("v4-18"));
  // A only Step 3 가 3500 이고 A+C 는 3000 — count
  const m3000 = (pipelineSrc.match(/maxTokens: 3000/g) ?? []).length;
  const m3500 = (pipelineSrc.match(/maxTokens: 3500/g) ?? []).length;
  check(`maxTokens 3000 1건 (A+C 유지)`, m3000 === 1, `count=${m3000}`);
  check(`maxTokens 3500 1건 (A only v4-18)`, m3500 === 1, `count=${m3500}`);

  // T4 — buildIndustryFaq 5건 강제
  console.log("\n[T4] buildIndustryFaq 5건 강제");
  const fmMod = await import("../lib/geo/v4/build_industry_frontmatter");
  const facts = buildSampleFacts();
  const faq = fmMod.buildIndustryFaq({ industry: "한식", facts });
  check(`FAQ 5건 (강제)`, faq.length === 5, `len=${faq.length}`);

  // 답변에 σ / 표준편차 / outlier 영문 / +N.Nσ 0건
  for (const f of faq) {
    check(
      `FAQ '${f.q.slice(0, 25)}' — σ / σ 표기 0`,
      !/σ/.test(f.a) && !/표준편차/.test(f.a) && !/정규분포/.test(f.a) && !/outlier/i.test(f.a),
      f.a,
    );
  }

  // outlier 자연어 ("평균과 두드러지게 차이 나는")
  const outlierFaq = faq.find((f) => f.q.includes("두드러지게"));
  check(`outlier FAQ 존재 (자연어)`, !!outlierFaq);
  check(
    `outlier FAQ — sigma 표기 X`,
    !!outlierFaq && !outlierFaq.a.includes("σ") && !outlierFaq.a.includes("±2"),
  );
  check(`outlier FAQ — 인생김치찌개 등장`, !!outlierFaq && outlierFaq.a.includes("인생김치찌개"));
  // ranking FAQ — label 의 (2024) 괄호 제거 — "계약 해지 (2024)" → "계약 해지"
  const rankFaq = faq.find((f) => f.q.includes("상위 브랜드"));
  check(`ranking FAQ — label "(2024)" 제거`, !!rankFaq && !rankFaq.q.includes("(2024)"));
  check(`ranking FAQ — "계약 해지" base label 사용`, !!rankFaq && rankFaq.q.includes("계약 해지"));

  // T4b — final fallback (sample facts 가 5건 충분히 채워주지만 빈 facts 로 fallback 검증)
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
  const emptyFaq = fmMod.buildIndustryFaq({ industry: "치킨", facts: emptyFacts });
  check(`empty facts → final fallback 5건`, emptyFaq.length === 5);
  check(`final fallback 출처 안내 포함`, emptyFaq.some((f) => f.q.includes("출처")));
  check(`final fallback 시점 안내 포함`, emptyFaq.some((f) => f.q.includes("기준 시점")));

  console.log(`\n=== ${okAll ? "ALL PASS" : "SOME FAILED"} ===\n`);
  process.exit(okAll ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
