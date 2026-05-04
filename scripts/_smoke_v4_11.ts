/**
 * v4-11 smoke — 본문 잘림 fix + 톤 일관성 + 표 label + raw 0 처리.
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
  console.log("\n=== v4-11 smoke ===\n");

  // T1 — pipeline.ts max_tokens 3000
  console.log("[T1] write route max_tokens (v4-12 supersede 3500)");
  const fs = await import("node:fs/promises");
  const pipelineSrc = await fs.readFile("lib/geo/v4/pipeline.ts", "utf-8");
  check(`maxTokens: 3500 (v4-12)`, pipelineSrc.includes("maxTokens: 3500"));
  check(`maxTokens: 2200 제거`, !pipelineSrc.includes("maxTokens: 2200"));
  check(`v4-12 마커`, pipelineSrc.includes("v4-12"));

  // T2 — writer sysprompt v4-12: 4블럭 / 4,500자 (블럭 E 폐기)
  console.log("\n[T2] writer sysprompt — v4-12 4블럭 / 4,500자");
  const writer = await import("../lib/geo/v4/sysprompts/writer");
  const sp = writer.buildWriterSysprompt({
    brand_label: "오공김밥",
    industry: "외식",
    industry_sub: "분식",
    topic: "분식 평균 매출 비교",
    today: "2026-05-04",
    hasDocx: true,
  });
  check(`4블럭 명시 (v4-12)`, sp.includes("4블럭"));
  check(`4,500자 한도 (v4-12)`, sp.includes("4,500자"));
  check(`블럭 D ~1,500자`, sp.includes("1,500자"));
  check(`블럭 분량 A 400`, sp.includes("A 400"));
  check(`이전 5블럭 가이드 제거`, !sp.includes("# 본문 구조 — 5블럭"));
  check(`이전 5,500자 한도 제거`, !sp.includes("5,500자 한도"));

  // T3 — 톤 일관성 ★ 룰
  console.log("\n[T3] 톤 일관성 ★ top priority 룰");
  check(`톤 일관성 헤더`, sp.includes("톤 일관성"));
  check(`혼재 금지 명시`, sp.includes("혼재 금지"));
  check(`첫 문장 = 마지막 문장 톤`, sp.includes("첫 문장의 톤 = 마지막 문장의 톤"));
  check(`한 글 안 분포 명시`, sp.includes("한 글 안"));
  check(`톤 점프 X`, sp.includes("톤 점프 X"));

  // T4 — 분포 표 형식
  console.log("\n[T4] 분포 표 형식 (label 중복 금지)");
  check(`분포 표 형식 헤더`, sp.includes("분포 표 형식"));
  check(`label 중복 금지`, sp.includes("label 중복 금지") || sp.includes("괄호 안 자연어 중복 X"));
  check(`잘못된 형식 예시 (괄호 중복)`, sp.includes("하위 25% (하위 25%)"));
  check(`올바른 형식 (구간 | 금액)`, sp.includes("| 구간 | 금액 |"));
  check(`brand row 명시`, sp.includes("오공김밥 | 6,949만원"));

  // T5 — raw 0 처리
  console.log("\n[T5] raw 0 처리");
  const { formatToDisplay } = await import("../lib/geo/v3/plan_format");
  check(`formatToDisplay(0, "만원") = "데이터 없음"`, formatToDisplay(0, "만원") === "데이터 없음");
  check(`formatToDisplay(0, "개") = "데이터 없음"`, formatToDisplay(0, "개") === "데이터 없음");
  check(`formatToDisplay(0, "%") = "데이터 없음"`, formatToDisplay(0, "%") === "데이터 없음");
  check(`formatToDisplay(55, "개") = "55개"`, formatToDisplay(55, "개") === "55개");
  check(`formatToDisplay(62517, "만원") = "6억 2,517만원"`, formatToDisplay(62517, "만원") === "6억 2,517만원");

  // sysprompt — raw 0 룰
  check(`sysprompt — raw 0 룰`, sp.includes("raw 0") || sp.includes('"0만원"'));
  check(`sysprompt — 데이터 없음 표기`, sp.includes("데이터 없음") || sp.includes("별도 집계 없음"));

  // build_a_facts — raw 0 skip
  console.log("\n[T5b] buildAFactsFromMetrics — raw 0 skip");
  const { buildAFactsFromMetrics } = await import("../lib/geo/v4/build_a_facts");
  const a = buildAFactsFromMetrics({
    brand_label: "X",
    industry: "Y",
    industry_sub: null,
    topic: "t",
    ftc_brand_id: "1",
    selected_metrics: ["frcs_cnt_2024_total", "ad_2024_total"],
    key_angle: "k",
    ftc_row: { frcs_cnt_2024_total: 55, ad_2024_total: 0 },
    industry_facts: [],
  });
  check(`raw 0 인 metric 은 fact_groups 에서 제외`, !("ad_2024_total" in a.fact_groups));
  check(`raw 정상 metric 은 포함`, "frcs_cnt_2024_total" in a.fact_groups);

  // T6 — 회귀 (writer 핵심 룰들 유지)
  console.log("\n[T6] 회귀 — writer 핵심 룰 유지");
  check(`★ 절대 룰 헤더 유지`, sp.includes("★ 절대 룰"));
  check(`display 그대로 paste`, sp.includes("display 그대로 paste"));
  check(`ac_diff_analysis 그대로 paste`, sp.includes("ac_diff_analysis 그대로 paste"));
  check(`brand_position paste`, sp.includes("brand_position 그대로 paste"));
  check(`톤 60% / 25% / 5% / 10%`, sp.includes("60%") && sp.includes("25%"));
  check(`C급 활용 강제 (hasDocx=true)`, sp.includes("C급 활용 ★ 강제"));

  console.log(`\n=== ${okAll ? "ALL PASS" : "SOME FAILED"} ===\n`);
  process.exit(okAll ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
