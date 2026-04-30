/**
 * v3-01 smoke — 4 step pipeline 단위 검증 (LLM 호출 없이).
 *  · post_process 5룰
 *  · crosscheckV3 (억 단위 normalizeKoreanNumbers)
 *  · lintV3 (L1~L4 + L8 percentile 잔존)
 *  · sysprompts 빌더 출력 sanity
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
  console.log(`  ${ok ? "✓" : "✗"} ${label}${detail ? ` — ${detail.slice(0, 120)}` : ""}`);
  if (!ok) okAll = false;
}

import type { Fact } from "../lib/geo/v3/types";

function fact(metric_id: string, value_num: number, opts: Partial<Fact> = {}): Fact {
  return {
    metric_id,
    metric_label: opts.metric_label ?? metric_id,
    value_num,
    value_text: null,
    unit: opts.unit ?? "만원",
    period: opts.period ?? "2024-12",
    source_tier: opts.source_tier ?? "A",
    source_label: opts.source_label ?? "공정거래위원회 정보공개서",
    formula: null,
    industry: opts.industry ?? null,
    n: opts.n ?? null,
    agg_method: opts.agg_method ?? null,
  };
}

async function main() {
  console.log("\n=== v3-01 smoke ===\n");

  // T1 — post_process 5룰
  console.log("[T1] post_process 5룰");
  const { postProcess } = await import("../lib/geo/v3/post_process");
  {
    const r = postProcess("이 brand 의 가맹점은 50개입니다.");
    check(`brand → 브랜드`, r.body.includes("브랜드") && !/(?<![a-zA-Z_\-/])brand(?![a-zA-Z_\-/])/.test(r.body));
  }
  {
    const r = postProcess("월매출 5,210만원, 연매출 34,704만원입니다.");
    check(`만원 ≥ 10000 → 억 변환`, r.body.includes("3억 4,704만원") && r.body.includes("5,210만원"));
  }
  {
    const r = postProcess("월매출 5,000만원, 연매출 60,000만원.");
    check(`60,000만원 → 6억원 (만 부분 0)`, r.body.includes("6억원"));
  }
  {
    const r = postProcess("p25는 2,000만원, p50은 3,000만원, p75는 4,000만원입니다.");
    check(`p25/p50/p75 자연어 변환`, r.body.includes("하위 25%") && r.body.includes("중앙값") && r.body.includes("상위 25%"));
  }
  {
    const body = "→ 즉, 첫째.\n→ 즉, 둘째.\n→ 즉, 셋째.";
    const r = postProcess(body);
    const occurrences = (r.body.match(/→ 즉,/g) ?? []).length;
    check(`"→ 즉," 첫 1회만 유지`, occurrences === 1, `count=${occurrences}`);
  }
  {
    const body =
      "공정위 정보공개서(2024-12) 기준 100개입니다. 공정위 정보공개서(2024-12) 기준 200개도.";
    const r = postProcess(body);
    const fullCount = (r.body.match(/공정위\s*정보공개서\s*\(2024-12\)\s*기준/g) ?? []).length;
    check(`출처 풀 명시 1회만`, fullCount === 1, `fullCount=${fullCount}`);
  }
  {
    // brand 영문 식별자 (-/_) 제외 확인
    const r = postProcess('slug: "brand-name" 코드: brand_id');
    check(
      `brand-name / brand_id 등 식별자 미변환`,
      r.body.includes("brand-name") && r.body.includes("brand_id"),
    );
  }

  // T2 — crosscheckV3 (억 단위 → 만 정규화)
  console.log("\n[T2] crosscheckV3 (억 단위 normalize)");
  const { crosscheckV3 } = await import("../lib/geo/v3/crosscheck");
  {
    const pool = [fact("rev", 34704)];
    const body = "연매출은 3억 4,704만원입니다.";
    const r = crosscheckV3(body, pool);
    check(`"3억 4,704만원" ↔ 34704 매칭`, r.ok, JSON.stringify(r.unmatched));
  }
  {
    const pool = [fact("rev", 60000)];
    const body = "연매출은 6억원입니다.";
    const r = crosscheckV3(body, pool);
    check(`"6억원" ↔ 60000 매칭`, r.ok, JSON.stringify(r.unmatched));
  }
  {
    const pool = [fact("rev", 5210)];
    const body = "월매출 5,210만원, 다른 brand 평균 99,999만원입니다.";
    const r = crosscheckV3(body, pool);
    check(`hallucination (99,999) 검출`, !r.ok && r.unmatched.length > 0);
  }

  // T3 — lintV3 (L8 percentile 잔존)
  console.log("\n[T3] lintV3 — L8 percentile 잔존");
  const { lintV3 } = await import("../lib/geo/v3/lint");
  {
    const r = lintV3("p75 기준선이 8,123만원입니다.");
    check(`L8 p75 잔존 검출`, r.errors.some((e) => e.startsWith("L8")));
  }
  {
    const r = lintV3("백분위 90 위치입니다.");
    check(`L8 백분위 잔존 검출`, r.errors.some((e) => e.startsWith("L8")));
  }
  {
    const r = lintV3("상위 25% 기준선이 8,123만원입니다.");
    check(`자연어 변환된 본문 통과 (L8 X)`, !r.errors.some((e) => e.startsWith("L8")));
  }

  console.log("\n[T3] lintV3 — L1~L4 보존");
  {
    const r = lintV3("국내 대표 브랜드입니다.");
    check(`L4 본사 홍보 보존`, r.errors.some((e) => e.startsWith("L4")));
  }
  {
    const r = lintV3("매출은 약 50개 정도입니다.");
    check(`L3 헤지 보존`, r.errors.some((e) => e.startsWith("L3")));
  }
  {
    const r = lintV3("데이터 부재로 산출 불가입니다.");
    check(`L2 시스템 누출 보존`, r.errors.some((e) => e.startsWith("L2")));
  }

  // T4 — sysprompts 빌더 sanity
  console.log("\n[T4] sysprompts 빌더 sanity");
  const { buildPlanSysprompt } = await import("../lib/geo/v3/sysprompts/plan");
  const { buildStructureSysprompt } = await import("../lib/geo/v3/sysprompts/structure");
  const { buildWriteSysprompt } = await import("../lib/geo/v3/sysprompts/write");
  // v3-05: buildPolishSysprompt 제거 (Step 4-B haiku 폐기)

  const planSp = buildPlanSysprompt();
  check(`Plan sysprompt — "JSON 만"`, planSp.includes("JSON 만"));
  check(`Plan sysprompt — outliers 룰`, planSp.includes("outliers"));

  const structSp = buildStructureSysprompt({ mode: "brand" });
  check(`Structure sysprompt — H2 5개`, structSp.includes("H2 정확히 5개"));
  check(`Structure sysprompt — table format`, structSp.includes('format: "table"'));

  const structInd = buildStructureSysprompt({ mode: "industry" });
  check(`Structure (industry) — 업종 개관 순서`, structInd.includes("업종 개관"));

  const writeSp = buildWriteSysprompt({
    mode: "brand",
    brandName: "오공김밥",
    industry: "외식",
    industrySub: "분식",
    isCustomer: true,
    topic: "월평균 매출",
    today: "2026-04-30",
    population_n: { 매출: 1512 },
  });
  check(`Write sysprompt — 톤 60%/25%/5%/10%`, writeSp.includes("60%") && writeSp.includes("25%") && writeSp.includes("10%"));
  check(`Write sysprompt — 단위 강제 (억 단위)`, writeSp.includes("3억 4,704만원"));
  check(`Write sysprompt — brand → 브랜드`, writeSp.includes("\"brand\" → \"브랜드\""));
  check(`Write sysprompt — percentile 자연어`, writeSp.includes('p90 → "상위 10%"'));
  check(`Write sysprompt — 데이터 제공자 톤`, writeSp.includes("데이터 제공자"));
  check(`Write sysprompt — C급 활용 (brand mode)`, writeSp.includes("C급 (본사 docx) 활용"));
  check(`Write sysprompt — 메타 코멘트 금지`, writeSp.includes("이 글의 주제입니다"));

  const writeIndSp = buildWriteSysprompt({
    mode: "industry",
    industry: "분식",
    topic: "분식 평균",
    today: "2026-04-30",
    population_n: { 매출: 1512 },
  });
  check(`Write (industry) — C급 섹션 미포함`, !writeIndSp.includes("C급 (본사 docx) 활용"));

  // v3-05: Polish sysprompt 폐기 — runPolish 가 post_process 만 호출

  // T5 — types & extractJson (v3-02: extractJson 이 unknown 반환)
  console.log("\n[T5] claude.ts extractJson");
  const { extractJson } = await import("../lib/geo/v3/claude");
  {
    const raw = "```json\n{\"a\": 1}\n```";
    const parsed = extractJson(raw) as { a: number };
    check(`code fence 안 JSON 추출`, parsed.a === 1);
  }
  {
    const raw = '여기 결과: {"key": "value"} 입니다.';
    const parsed = extractJson(raw) as { key: string };
    check(`텍스트 안 JSON 추출`, parsed.key === "value");
  }

  console.log(`\n=== ${okAll ? "ALL PASS" : "SOME FAILED"} ===\n`);
  process.exit(okAll ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
