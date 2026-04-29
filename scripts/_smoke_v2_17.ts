/**
 * v2-17 smoke — ~입니다/~요/~죠 톤 가이드 + 호명·비유 권장.
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
  console.log(`  ${ok ? "✓" : "✗"} ${label}${detail ? ` — ${detail.slice(0, 100)}` : ""}`);
  if (!ok) okAll = false;
}

async function main() {
  const { buildSystemPrompt } = await import("../lib/geo/v2/sysprompt");

  console.log("\n=== v2-17 smoke ===\n");

  const today = "2026-04-29";
  const sp = buildSystemPrompt({
    brand: { id: "1", name: "오공김밥", industry_main: "외식", industry_sub: "분식" },
    factsPool: [
      {
        metric_id: "x",
        metric_label: "y",
        value_num: 100,
        value_text: null,
        unit: "개",
        period: "2024-12",
        source_tier: "A",
        source_label: "공정위",
      },
    ],
    topic: "오공김밥 분식 평균 비교",
    today,
  });

  // T1 톤 가이드 — ~입니다/~요/~죠 강조 (v2-19 비율 명시 형식)
  console.log("[T1] 말투 가이드");
  check(
    "~입니다 / ~요 / ~죠 모두 명시",
    sp.includes("~입니다") && sp.includes("~요") && sp.includes("~죠"),
  );
  check(
    "비율 명시 (90%+ 또는 60%/25%/5% 형식)",
    sp.includes("90%+") || (sp.includes("60%") && sp.includes("25%")),
  );
  check("단정 평어 비율 (10%)", sp.includes("10%"));
  check("~요 또는 ~다 일변도 / 보고서 톤 금지", sp.includes("일변도") || (sp.includes("보고서") && sp.includes("금지")));
  check("문장 평균 40~50자", sp.includes("40~50자"));

  // T1 좋은 vs 나쁜 예 (v2-19: 새 verbatim 4쌍)
  console.log("\n[T1] 좋은 예 vs 나쁜 예");
  check(
    `✅ p90이 50,991만원 verbatim`,
    sp.includes(`50,991만원`),
  );
  check(
    `✅ "있다는 신호죠" 또는 "있다는 뜻이죠"`,
    sp.includes(`있다는 신호죠`) || sp.includes(`있다는 뜻이죠`),
  );
  check(
    `❌ ~요 또는 ~다 일변도 verbatim`,
    sp.includes(`이에요`) || sp.includes(`이다.`),
  );

  // T4 호명·비유
  console.log("\n[T4] 호명·비유 (권장)");
  check("# 호명·비유 섹션", sp.includes("# 호명·비유"));
  check(`호명 예 "어떻게 읽으시겠어요?"`, sp.includes("어떻게 읽으시겠어요?"));
  check(`호명 예 "이게 무슨 의미일까요?"`, sp.includes("이게 무슨 의미일까요?"));
  check(`비유 예 (영업이익률 1원 80전)`, sp.includes("100원 팔고 1원 80전"));
  check(`매 글 강제 X (의미 명확화 시만)`, sp.includes("매 글 강제 X"));

  // T2 5블럭 톤 통일
  console.log("\n[T2] 5블럭 가이드 톤");
  check(
    `[블럭 B] 끝 "→ 즉, ... 입니다."`,
    sp.includes(`→ 즉, 이 brand 를 보는 맥락은 [...] 입니다.`),
  );
  check(
    `[블럭 C] 매 H2 끝 "→ 즉, ... 입니다."`,
    sp.includes(`매 H2 끝 "→ 즉, ... 입니다."`),
  );
  check(
    `output template "→ 즉, ... 입니다."`,
    sp.includes(`→ 즉, ... 입니다.`),
  );

  // T3 FAQ 톤
  console.log("\n[T3] FAQ 톤");
  check(`FAQ 답변 ~입니다/~요 명시`, sp.includes("답변 종결어미 ~입니다/~요"));
  check(`FAQ 좋은 예 (높아요)`, sp.includes("높아요"));
  check(`FAQ 나쁜 예 (높다)`, sp.includes(`6,196만원보다 높다.`));

  // regression — voice 14 원칙 + 5 블럭 + 분량 보존
  console.log("\n[regression] v2-15/16 보존");
  check("절대 규칙 — facts 외 숫자 금지", sp.includes("facts pool 외 숫자"));
  // v2-21: 입장 4분면 폐기 → 데이터 제공자 톤 확인
  check("데이터 제공자 톤 (입장 4분면 폐기)", sp.includes("데이터 제공자") && !sp.includes("⚠️ 조건부"));
  check("점포명 익명화", sp.includes("점포명") && sp.includes("절대 금지"));
  check("보이스 7원칙", sp.includes("보이스 7원칙"));
  check("양면 제시", sp.includes("양면 제시"));
  check("시점 정직성", sp.includes("시점 정직성"));
  check("금지 표현", sp.includes("금지 표현"));
  check("[블럭 A]~[E] 5개 모두", sp.includes("[블럭 A]") && sp.includes("[블럭 B]") && sp.includes("[블럭 C]") && sp.includes("[블럭 D]") && sp.includes("[블럭 E]"));
  check("결론 체크리스트 H2", sp.includes("## 결론 체크리스트"));
  check("이 글에서 계산한 값 H2", sp.includes("## 이 글에서 계산한 값 (frandoor 산출)"));
  check("출처 · 집계 방식 H2", sp.includes("## 출처 · 집계 방식"));
  check("1,800~2,500자 분량", sp.includes("1,800~2,500자"));
  check("today interpolation", sp.includes(`date: "${today}"`));

  // 길이 — v2-23 percentile 변환 + C급 룰 추가로 ~5,600자 (6,000자 이내)
  console.log("\n[T5] sysprompt 길이");
  console.log(`   sysprompt 길이 = ${sp.length} 자`);
  check(`길이 < 6,000자 (자율 가이드)`, sp.length < 6000, `len=${sp.length}`);

  console.log(`\n=== ${okAll ? "ALL PASS" : "SOME FAILED"} ===\n`);
  process.exit(okAll ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
