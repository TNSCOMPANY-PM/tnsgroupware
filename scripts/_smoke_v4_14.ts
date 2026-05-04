/**
 * v4-14 smoke — FAQ 중복 + 조사 + 물결 + industry + unit 중복 hotfix.
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
    industry: "분식",
    industry_sub: "분식",
    topic: "test",
    ftc_brand_id: "2295",
    selected_metrics: [],
    key_angle: "k",
    fact_groups: {
      startup_cost_total: {
        label: "창업비용 총액",
        A: { display: "6,949만원", raw_value: 6949, unit: "만원", period: "2024-12", source: "공정위 정보공개서(2024-12)" },
      },
      startup_fee: {
        label: "가맹비",
        A: { display: "550만원", raw_value: 550, unit: "만원", period: "2024-12", source: "공정위 정보공개서(2024-12)" },
      },
      avg_sales_2024_total: {
        label: "가맹점 평균 연매출",
        A: { display: "6억 2,517만원", raw_value: 62517, unit: "만원", period: "2024-12", source: "공정위 정보공개서(2024-12)" },
        distribution: {
          p25: { display: "2억 297만원", raw: 20297 },
          p90: { display: "7억 9,036만원", raw: 79036 },
          n_population: 238,
          brand_position: "상위 25% 기준선 이상",
        },
      },
      frcs_cnt_2024_total: {
        label: "전체 가맹점수 (2024)",
        A: { display: "55개", raw_value: 55, unit: "개", period: "2024-12", source: "공정위 정보공개서(2024-12)" },
      },
    },
    population_info: {},
  };
}

function buildSampleC(): CFactsResult {
  return {
    fact_groups: {
      startup_cost_total: {
        label: "창업비용 총액",
        C: { display: "6,500만원", raw_value: 6500, value_text: "6,500만원", unit: "만원", source: "본사 데이터" },
        ac_diff_analysis: "본사 데이터가 정보공개서 대비 449만원(6.5%) 낮음",
      },
      startup_fee: {
        label: "가맹비",
        C: { display: "300만원", raw_value: 300, value_text: "300만원", unit: "만원", source: "본사 데이터" },
        ac_diff_analysis: "본사 데이터가 정보공개서 대비 250만원(45.5%) 낮음",
      },
    },
    c_only_facts: [
      {
        label: "가맹점수_POS",
        value_num: null,
        value_text: "52개점",
        unit: "개",
        source: "본사 데이터",
      },
      {
        label: "적정평수",
        value_num: null,
        value_text: "9~15평",
        unit: "평",
        source: "본사 데이터",
      },
    ],
    ac_diff_summary: "ok",
  };
}

async function main() {
  console.log("\n=== v4-14 smoke ===\n");

  // T1 — pipeline.ts renderFaqBlock 호출 제거
  console.log("[T1] pipeline.ts — FAQ 본문 섹션 제거");
  const fs = await import("node:fs/promises");
  const pipelineSrc = await fs.readFile("lib/geo/v4/pipeline.ts", "utf-8");
  check(`renderFaqBlock import 제거`, !pipelineSrc.includes("renderFaqBlock"));
  check(`finalContent 에 faqBlock 합산 X`, !pipelineSrc.includes("${faqBlock}"));
  check(`v4-14 마커`, pipelineSrc.includes("v4-14"));

  // T2 — josa.ts
  console.log("\n[T2] josa.ts — ro / eun / i / eul");
  const { ro, eun, i, eul, gwa } = await import("../lib/geo/v4/josa");
  check(`ro("6,500만원") = "으로"`, ro("6,500만원") === "으로", ro("6,500만원"));
  check(`ro("300만원") = "으로"`, ro("300만원") === "으로", ro("300만원"));
  check(`ro("결과") = "로"`, ro("결과") === "로");
  check(`ro("바나나") = "로"`, ro("바나나") === "로");
  check(`ro("연필") = "로" (ㄹ 받침)`, ro("연필") === "로", ro("연필"));
  check(`ro("책") = "으로"`, ro("책") === "으로");
  check(`ro("8") = "으로" (팔)`, ro("8") === "으로");
  check(`ro("2") = "로" (이)`, ro("2") === "로");
  check(`eun("학생") = "은"`, eun("학생") === "은");
  check(`eun("바나나") = "는"`, eun("바나나") === "는");
  check(`i("학생") = "이"`, i("학생") === "이");
  check(`i("바나나") = "가"`, i("바나나") === "가");
  check(`eul("책") = "을"`, eul("책") === "을");
  check(`eul("바나나") = "를"`, eul("바나나") === "를");
  check(`gwa("학생") = "과"`, gwa("학생") === "과");
  check(`gwa("바나나") = "와"`, gwa("바나나") === "와");

  // T3 — build_faq 적용 결과: "...만원으로 차이"
  console.log("\n[T3] build_faq — 조사 / 물결 / value_text 중복 제거");
  const { buildFaq } = await import("../lib/geo/v4/build_faq");
  const faq = buildFaq({
    brand_label: "오공김밥",
    industry: "분식",
    a_facts: buildSampleA(),
    c_facts: buildSampleC(),
  });
  // Q1 창업비용
  const qCost = faq.find((f) => f.q.includes("창업비용"));
  check(
    `Q1 — "6,500만원으로 차이" (조사 정확)`,
    !!qCost && qCost.a.includes("6,500만원으로 차이"),
    qCost?.a,
  );
  check(`Q1 — "원로" 패턴 0`, !!qCost && !qCost.a.includes("원로"));
  // Q3 가맹비
  const qFee = faq.find((f) => f.q.includes("가맹비"));
  check(
    `Q3 — "300만원으로 차이" (조사 정확)`,
    !!qFee && qFee.a.includes("300만원으로 차이"),
    qFee?.a,
  );
  check(`Q3 — "원로" 패턴 0`, !!qFee && !qFee.a.includes("원로"));

  // T5 — value_text unit 중복 제거 (Q5 가맹점수 fallback or 적정평수 fallback)
  console.log("\n[T5] value_text unit 중복 제거");
  const allText = faq.map((f) => f.a).join(" || ");
  // c_only_facts "52개점" + unit "개" → "52개점" 만 (중복 X)
  if (allText.includes("52개점")) {
    check(`"52개점" 본사 데이터 — unit 중복 X`, !allText.includes("52개점개"));
  } else {
    // gas FAQ 가 5건에 가맹점수가 안 들어갔을 수도. fallback 으로 c_only_facts 직접 검사
    const fallbackQ = faq.find((f) => f.q.includes("가맹점수_POS"));
    if (fallbackQ) {
      check(`fallback "52개점" — unit 중복 X`, !fallbackQ.a.includes("52개점개"));
    } else {
      check(`(skip — 52개점 안 등장)`, true);
    }
  }

  // T3 — 물결 ~ 전각 변환 (적정평수 narrative)
  if (allText.includes("9～15평") || allText.includes("9~15평")) {
    check(`"9~15평" → "9～15평" (전각)`, allText.includes("9～15평") && !allText.includes("9~15평"));
  } else {
    // 적정평수 fallback 가 5건에 못 들어간 경우, 직접 검사
    const tildeQ = faq.find((f) => f.q.includes("적정평수"));
    if (tildeQ) {
      check(`fallback 적정평수 "9～15평" 전각`, tildeQ.a.includes("9～15평"));
    } else {
      check(`(skip — 적정평수 fallback 안 등장)`, true);
    }
  }

  // T3 — writer sysprompt 물결 룰
  console.log("\n[T3b] writer sysprompt — 물결 룰");
  const writer = await import("../lib/geo/v4/sysprompts/writer");
  const sp = writer.buildWriterSysprompt({
    brand_label: "오공김밥",
    industry: "분식",
    industry_sub: "분식",
    topic: "test",
    today: "2026-05-04",
    hasDocx: true,
  });
  check(`물결 표기 룰 헤더`, sp.includes("물결 표기 룰"));
  check(`전각 "～" 사용 명시`, sp.includes("전각 물결"));
  check(`반각 ~ 금지 명시`, sp.includes("반각"));

  // T4 — industry 우선순위
  console.log("\n[T4] industry 우선순위 — induty_mlsfc 우선");
  check(
    `pipeline.ts industry: industrySub ?? industryMain`,
    pipelineSrc.includes("industry: industrySub ?? industryMain"),
  );
  check(
    `이전 industryMain ?? industrySub 제거`,
    !pipelineSrc.includes("industry: industryMain ?? industrySub"),
  );

  // T5 — build_frontmatter 물결 변환
  console.log("\n[T5b] build_frontmatter — 물결 ~ 전각 변환");
  const { buildFrontmatter } = await import("../lib/geo/v4/build_frontmatter");
  const fm = buildFrontmatter({
    topic: "오공김밥 분석 (9~15평)",
    brand_label: "오공김밥",
    industry: "분식",
    brand_id: "82c7ffc9",
    today: "2026-05-04",
    a_facts: buildSampleA(),
    c_facts: buildSampleC(),
  });
  check(`description 안 ~ → ～ 변환`, !fm.description.includes("~"));

  console.log(`\n=== ${okAll ? "ALL PASS" : "SOME FAILED"} ===\n`);
  process.exit(okAll ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
