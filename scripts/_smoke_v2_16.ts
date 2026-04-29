/**
 * v2-16 smoke — sysprompt 압축 + max_tokens 검증.
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

  console.log("\n=== v2-16 smoke ===\n");

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

  // 압축 효과 — 길이 측정
  console.log("[T2] sysprompt 길이");
  const len = sp.length;
  console.log(`   sysprompt 총 길이 = ${len} 자`);
  // v2-15 sysprompt 길이 ≈ 7,200 (3 개 큰 예시 박스 포함)
  // v2-16 압축 목표 — 5,500 자 미만
  check(`길이 < 6,000자 (v2-15 압축 ~30% 효과)`, len < 6000, `len=${len}`);

  // 핵심 instruction 보존
  console.log("\n[regression] 핵심 instruction 보존");
  check("절대 규칙 1 (facts 외 숫자 금지)", sp.includes("facts pool 외 숫자"));
  check("입장 4분면 (✅⚠️🤔❌)", sp.includes("✅") && sp.includes("⚠️") && sp.includes("🤔") && sp.includes("❌"));
  check("점포명 익명화", sp.includes("점포명") && sp.includes("절대 금지"));
  check("보이스 7원칙", sp.includes("보이스 7원칙"));
  check(
    "말투 섹션",
    sp.includes("# 말투") || sp.includes("말투 — lead-gen"),
  );
  check("양면 제시", sp.includes("양면 제시"));
  check("시점 정직성", sp.includes("시점 정직성"));
  check("금지 표현", sp.includes("금지 표현"));

  // 5 블럭 구조 보존
  console.log("\n[regression] 5 블럭 구조");
  check("[블럭 A] 훅", sp.includes("[블럭 A] 훅"));
  check("[블럭 B] 시장 포지션", sp.includes("[블럭 B] 시장 포지션"));
  check("[블럭 C] 핵심 지표 심층", sp.includes("[블럭 C] 핵심 지표 심층"));
  check("[블럭 D] 진입 전 확인할 리스크", sp.includes("[블럭 D]") && sp.includes("리스크"));
  check("[블럭 E] 결정 + 출처", sp.includes("[블럭 E] 결정 + 출처"));

  // 블럭 E 의 3 H2
  console.log("\n[regression] 블럭 E 3 섹션");
  check("결론 체크리스트 H2", sp.includes("## 결론 체크리스트"));
  check("이 글에서 계산한 값 H2", sp.includes("## 이 글에서 계산한 값 (frandoor 산출)"));
  check("출처 · 집계 방식 H2", sp.includes("## 출처 · 집계 방식"));

  // 분량 가이드
  console.log("\n[regression] 분량 가이드");
  check("1,800~2,500자 명시", sp.includes("1,800~2,500자"));
  check("3,000자 초과 금지", sp.includes("3,000자 초과 금지"));

  // 압축 효과 — 예시 박스 단순화
  console.log("\n[T2] 예시 박스 압축 확인");
  // 체크리스트 - [ ] 마커 — 예시 1개 + template 4개 = 5~6 (≤7 허용)
  check(
    "체크리스트 예시 압축 (≤7개)",
    (sp.match(/- \[ \]/g) ?? []).length <= 7,
    `count=${(sp.match(/- \[ \]/g) ?? []).length}`,
  );
  // markdown table 행 — 헤더 + 예시 1행만
  const tableRows = (sp.match(/^\|\s*[가-힣]/gm) ?? []).length;
  check(`frandoor 산출 예시 행 1~3개 (이전 4행에서 압축)`, tableRows <= 3, `rows=${tableRows}`);

  // T1 today interpolation 보존
  console.log("\n[regression] today interpolation");
  check(`date "${today}" 포함`, sp.includes(`date: "${today}"`));
  check(`dateModified "${today}" 포함`, sp.includes(`dateModified: "${today}"`));

  console.log(`\n=== ${okAll ? "ALL PASS" : "SOME FAILED"} ===\n`);
  process.exit(okAll ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
