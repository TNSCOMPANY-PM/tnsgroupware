/**
 * v4 smoke — freestyle 모듈 surface + post_process 재사용 + crosscheck 재사용 + lint L9/L10.
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
  console.log("\n=== v4 smoke ===\n");

  // T1 — module surface
  console.log("[T1] module surface");
  const types = await import("../lib/geo/v4/types");
  const claude = await import("../lib/geo/v4/claude");
  const sysprompt = await import("../lib/geo/v4/sysprompt");
  const post = await import("../lib/geo/v4/post_process");
  const cc = await import("../lib/geo/v4/crosscheck");
  const lint = await import("../lib/geo/v4/lint");
  const pipeline = await import("../lib/geo/v4/pipeline");
  check(`types loaded`, typeof types === "object");
  check(`callSonnet exported`, typeof claude.callSonnet === "function");
  check(`buildSysprompt exported`, typeof sysprompt.buildSysprompt === "function");
  check(`buildUserPrompt exported`, typeof sysprompt.buildUserPrompt === "function");
  check(`postProcess exported (재사용)`, typeof post.postProcess === "function");
  check(`collectAllowedNumbers exported`, typeof cc.collectAllowedNumbers === "function");
  check(`crosscheckV4 exported`, typeof cc.crosscheckV4 === "function");
  check(`lintV4 exported`, typeof lint.lintV4 === "function");
  check(`generateV4 exported`, typeof pipeline.generateV4 === "function");
  check(`FtcBrandIdMissingError exported`, typeof pipeline.FtcBrandIdMissingError === "function");

  // T2 — sysprompt sanity
  console.log("\n[T2] sysprompt sanity");
  const sp = sysprompt.buildSysprompt({
    brand_label: "오공김밥",
    industry: "외식",
    industry_sub: "분식",
    topic: "분식 평균 매출 분석",
    today: "2026-04-30",
    hasDocx: true,
  });
  check(`sysprompt 톤 비율 60%/25%/5%/10%`, sp.includes("60%") && sp.includes("25%"));
  check(`sysprompt 데이터 제공자`, sp.includes("데이터 제공자"));
  check(`sysprompt 점포명 익명화`, sp.includes("점포명") && sp.includes("절대 금지"));
  check(`sysprompt 억 단위`, sp.includes("X억 Y,YYY만원"));
  check(`sysprompt percentile 자연어`, sp.includes("상위 10%"));
  check(`sysprompt C급 강제 (hasDocx=true)`, sp.includes("C급 (본사 docx_facts) 활용"));
  check(`sysprompt brand→브랜드`, sp.includes("\"brand\" → \"브랜드\""));
  check(`sysprompt 메타 코멘트 금지`, sp.includes("이 글의 주제입니다"));

  const spNoDocx = sysprompt.buildSysprompt({
    brand_label: "테스트",
    industry: "치킨",
    topic: "치킨 분석",
    today: "2026-04-30",
    hasDocx: false,
  });
  check(`sysprompt hasDocx=false → C급 섹션 X`, !spNoDocx.includes("# C급 (본사 docx_facts) 활용"));

  // T3 — buildUserPrompt
  console.log("\n[T3] buildUserPrompt (v4-02 docx_facts)");
  const userP = sysprompt.buildUserPrompt({
    topic: "테스트",
    ftc_row: { id: 1, brand_nm: "오공김밥", monthly_avg_revenue: 5210 },
    docx_facts: [
      {
        label: "월평균매출",
        value_num: 5210,
        value_text: null,
        unit: "만원",
        source_label: "본사 발표",
        source_type: "본사_브로셔",
      },
    ],
    industry_facts: [{ metric: "p50", value: 34704 }],
  });
  check(`user prompt 정보공개서 + docx_facts + industry`, userP.includes("정보공개서") && userP.includes("docx_facts") && userP.includes("industry"));
  check(`user prompt JSON dump`, userP.includes('"id": 1'));
  check(`user prompt docx_facts label`, userP.includes('"label": "월평균매출"'));

  const userPNoDocx = sysprompt.buildUserPrompt({
    topic: "테스트",
    ftc_row: { id: 1 },
    docx_facts: [],
    industry_facts: [],
  });
  check(`user prompt docx_facts 빈 배열 → "(없음" 표기`, userPNoDocx.includes("(없음"));

  // T4 — collectAllowedNumbers (v4-02)
  console.log("\n[T4] collectAllowedNumbers (v4-02 docx_facts)");
  const allowed = cc.collectAllowedNumbers({
    ftc_row: { revenue: 5210, stores: 21, op_margin: 1.8 },
    docx_facts: [
      { value_num: 6949, value_text: "최대 5,000만원 + 본사 무이자 3,000만원" },
    ],
    industry_facts: [{ p50: 34704, n: 238 }],
  });
  check(`ftc raw 5210 포함`, allowed.has("5210"));
  check(`ftc raw 21 포함`, allowed.has("21"));
  check(`docx_facts value_num 6949 포함`, allowed.has("6949"));
  check(`docx_facts value_text 안 5000 추출`, allowed.has("5000"));
  check(`docx_facts value_text 안 3000 추출`, allowed.has("3000"));
  check(`industry p50 34704 포함`, allowed.has("34704"));
  check(`industry n=238 포함`, allowed.has("238"));
  check(`산술 derived (5210*12=62520) 포함`, allowed.has("62520"));

  // T5 — crosscheckV4
  console.log("\n[T5] crosscheckV4");
  const allowedSet = new Set(["5210", "5,210", "62520", "21"]);
  {
    const r = cc.crosscheckV4("월매출 5,210만원입니다.", allowedSet);
    check(`정확값 매칭`, r.ok, JSON.stringify(r.unmatched));
  }
  {
    const r = cc.crosscheckV4("연매출 99,999만원으로 추정.", allowedSet);
    check(`hallucination 99,999 검출`, !r.ok);
  }

  // T6 — postProcess (v3 재사용)
  console.log("\n[T6] postProcess (v3 재사용)");
  {
    const r = post.postProcess("연매출 34,704만원, 이 brand 의 가맹점은 21개.");
    check(`억 단위 변환`, r.body.includes("3억 4,704만원"));
    check(`brand → 브랜드`, r.body.includes("브랜드"));
  }

  // T7 — lintV4 — L9 + L10
  console.log("\n[T7] lintV4 — L9 (C급 미인용) + L10 (topic 키워드)");
  {
    const r = lint.lintV4("매출은 5,210만원입니다.", { hasC: true, topic: "매출" });
    check(`L9 docx 있는데 본사 키워드 0건 → warning`, r.warnings.some((w) => w.startsWith("L9")));
  }
  {
    const r = lint.lintV4("매출은 5,210만원입니다. 본사 측 발표 기준.", {
      hasC: true,
      topic: "매출",
    });
    check(`L9 본사 측 키워드 있음 → warning X`, !r.warnings.some((w) => w.startsWith("L9")));
  }
  {
    const r = lint.lintV4("전혀 다른 본문입니다.", { hasC: false, topic: "폐점률 분석" });
    check(`L10 topic 키워드 0건 → warning`, r.warnings.some((w) => w.startsWith("L10")));
  }
  {
    const r = lint.lintV4("폐점률은 5%입니다.", { hasC: false, topic: "폐점률 분석" });
    check(`L10 topic 키워드 있음 → warning X`, !r.warnings.some((w) => w.startsWith("L10")));
  }

  console.log(`\n=== ${okAll ? "ALL PASS" : "SOME FAILED"} ===\n`);
  process.exit(okAll ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
