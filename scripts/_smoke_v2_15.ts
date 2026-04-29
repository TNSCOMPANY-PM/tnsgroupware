/**
 * v2-15 smoke — voice_spec_v2 100% 적용 sysprompt + normalizeFrontmatter.
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
  const { buildSystemPrompt, normalizeFrontmatter } = await import("../lib/geo/v2/sysprompt");

  console.log("\n=== v2-15 smoke ===\n");

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

  // T1 today interpolation
  console.log("[T1] today interpolation");
  check(`sysprompt 안 date: "${today}"`, sp.includes(`date: "${today}"`));
  check(`sysprompt 안 dateModified: "${today}"`, sp.includes(`dateModified: "${today}"`));
  check(`slug 에 ${today.slice(0, 4)} 포함`, sp.includes(`-${today.slice(0, 4)}"`));
  check(
    `Brand 정보 의 오늘 ${today}`,
    sp.includes(`오늘: ${today}`) || sp.includes(`오늘 날짜: ${today}`),
  );

  // T2 결론 체크리스트
  console.log("\n[T2] 결론 체크리스트");
  check(`"결론 체크리스트" H2 가이드 포함`, sp.includes("## 결론 체크리스트"));
  check(`체크박스 형식 - [ ] 예시 포함`, sp.includes("- [ ] "));
  check(`"4~5개" / "brand 고유" 명시`, sp.includes("4~5") && sp.includes("brand 고유"));

  // T3 출처·집계 방식
  console.log("\n[T3] 출처·집계 방식");
  check(`"출처 · 집계 방식" H2`, sp.includes("## 출처 · 집계 방식"));
  check(`갱신 주기 / 데이터 한계 가이드`, sp.includes("갱신 주기") && sp.includes("데이터 한계"));

  // T4 frandoor 산출 박스 (markdown table)
  console.log("\n[T4] frandoor 산출 박스");
  check(`"이 글에서 계산한 값 (frandoor 산출)" H2`, sp.includes("이 글에서 계산한 값 (frandoor 산출)"));
  check(`markdown table 형식 (| 지표 | 값 | 산식 | 단위 |)`, sp.includes("| 지표 | 값 | 산식 | 단위 |"));
  check(`raw vs derived 분리 가이드`, sp.includes("raw fact") && sp.includes("derived fact"));

  // T5-말투 (v2-17 update — ~입니다/~요/~죠 톤 가이드)
  console.log("\n[T5-말투] 톤 가이드 (v2-17 ~입니다 체)");
  check(`"# 말투" 섹션`, sp.includes("# 말투"));
  check(`문장 평균 길이 가이드 (40~50자)`, sp.includes("40~50자") || sp.includes("30~50자"));
  check(
    `종결어미 가이드 (~입니다 / ~요 / ~죠 모두 명시)`,
    sp.includes("~입니다") && sp.includes("~요") && sp.includes("~죠"),
  );
  check(
    `강조 표기 1~2회만`,
    sp.includes("1~2회만") && (sp.includes("의외성") || sp.includes("핵심 결론")),
  );

  // T5-구조
  console.log("\n[T5-구조] 5 블럭 구조");
  check(`[블럭 A] 훅`, sp.includes("[블럭 A] 훅"));
  check(`[블럭 B] 시장 포지션`, sp.includes("[블럭 B] 시장 포지션"));
  check(`[블럭 C] 핵심 지표 심층`, sp.includes("[블럭 C] 핵심 지표 심층"));
  check(`[블럭 D] 진입 전 확인할 리스크`, sp.includes("[블럭 D] 진입 전 확인할 리스크"));
  check(`[블럭 E] 결정 + 출처`, sp.includes("[블럭 E] 결정 + 출처"));

  // T5-분량
  console.log("\n[T5-분량] 1,800~2,500자");
  check(`"1,800~2,500자" 명시`, sp.includes("1,800~2,500자"));
  check(`"3,000자 초과 금지"`, sp.includes("3,000자 초과 금지"));

  // 기존 voice 룰 보존
  console.log("\n[regression] 기존 voice 룰 보존");
  check(`보이스 7원칙 (lead-gen)`, sp.includes("# 보이스 7원칙"));
  check(`양면 제시 (A vs C)`, sp.includes("# 양면 제시"));
  check(`시점 정직성`, sp.includes("# 시점 정직성"));
  check(`금지 표현`, sp.includes("# 금지 표현"));
  check(`facts pool 외 숫자 절대 금지`, sp.includes("facts pool 외 숫자"));

  // normalizeFrontmatter
  console.log("\n[T1-2] normalizeFrontmatter (안전망)");
  {
    const fm = { title: "x", date: "2025-05-15", dateModified: "2025-05-15", tags: ["a"] };
    const out = normalizeFrontmatter(fm, today);
    check("date 강제 치환", out.date === today);
    check("dateModified 강제 치환", out.dateModified === today);
    check("기타 필드 보존", out.title === "x" && Array.isArray(out.tags));
  }
  {
    const out = normalizeFrontmatter({}, today);
    check("빈 frontmatter 도 date 추가", out.date === today);
  }
  {
    // today 미지정 시 자동
    const out = normalizeFrontmatter({});
    const todayAuto = new Date().toISOString().slice(0, 10);
    check(`today 미지정 → 자동 (${todayAuto})`, out.date === todayAuto);
  }

  console.log(`\n=== ${okAll ? "ALL PASS" : "SOME FAILED"} ===\n`);
  process.exit(okAll ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
