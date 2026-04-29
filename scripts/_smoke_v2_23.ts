/**
 * v2-23 smoke — percentile 자연어 변환 + C급 (본사 docx) 활용 룰.
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
  console.log("\n=== v2-23 smoke ===\n");

  const { buildSystemPrompt, buildIndustrySystemPrompt } = await import(
    "../lib/geo/v2/sysprompt"
  );

  const today = "2026-04-29";
  const brandSp = buildSystemPrompt({
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
    topic: "오공김밥 분석",
    today,
  });

  const indSp = buildIndustrySystemPrompt({
    industry: "분식",
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
        n: 21,
      },
    ],
    topic: "분식 평균",
    today,
  });

  // T1 — percentile 자연어 변환 (brand + industry)
  console.log("[T1] percentile 자연어 변환 (brand)");
  check(`# 통계 용어 자연어 변환 섹션`, brandSp.includes("# 통계 용어 자연어 변환"));
  check(`p25 → 하위 25% 변환`, brandSp.includes("p25") && brandSp.includes('"하위 25%"'));
  check(`p50/median → 중앙값`, brandSp.includes("p50/median") && brandSp.includes('"중앙값"'));
  check(`p75 → 상위 25% 변환`, brandSp.includes("p75") && brandSp.includes('"상위 25%"'));
  check(`p90 → 상위 10% 변환`, brandSp.includes("p90") && brandSp.includes('"상위 10%"'));
  check(`p95 → 상위 5% 변환`, brandSp.includes("p95") && brandSp.includes('"상위 5%"'));
  check(`백분위 표기 금지 명시`, brandSp.includes("백분위"));
  check(`좋은 예 verbatim "분식 상위 25% 기준선인 8,123만원"`, brandSp.includes("분식 상위 25% 기준선인 8,123만원"));
  check(`좋은 예 verbatim "상위 10% 기준선인 4,249만원"`, brandSp.includes("분식 상위 10% 기준선인 4,249만원도 넘어섭니다"));
  check(`나쁜 예 verbatim "p75인 8,123만원"`, brandSp.includes('"분식 p75인 8,123만원"'));

  console.log("\n[T1] percentile 자연어 변환 (industry)");
  check(`# 통계 용어 자연어 변환 섹션`, indSp.includes("# 통계 용어 자연어 변환"));
  check(`p25/p50/p75/p90/p95 모두`, ["p25", "p50", "p75", "p90", "p95"].every((p) => indSp.includes(p)));
  check(`자연어 매핑 (하위/중앙값/상위)`, indSp.includes('"하위 25%"') && indSp.includes('"중앙값"') && indSp.includes('"상위 10%"'));

  // T2 — C급 활용 룰 (brand only)
  console.log("\n[T2] C급 (본사 docx) 활용 룰 (brand)");
  check(`# C급 (본사 docx) 출처 활용 섹션`, brandSp.includes("# C급 (본사 docx) 출처 활용"));
  check(`C급 정의 ("frandoor.co.kr 에 업로드")`, brandSp.includes("frandoor.co.kr 에 업로드"));
  check(`A vs C 동급 인용 X`, brandSp.includes("동급으로 인용 X"));
  check(`A급 + C급 조합 패턴`, brandSp.includes("월매출은 분식 상위 10% 수준입니다(공정위)"));
  check(`"본사 측 자료 기준" 가이드`, brandSp.includes("본사 측 자료 기준") || brandSp.includes("본사 발표 기준"));
  check(`충돌 시 A급 우선`, brandSp.includes("A급 우선") || brandSp.includes('"다만 본사 측은'));
  check(`무근거 수식어 차단 ("국내 최고")`, brandSp.includes("국내 최고"));
  check(`무근거 수식어 차단 ("최저가" / "1위")`, brandSp.includes("최저가") && brandSp.includes("1위"));
  check(`facts 외 본사 측 수치 인용 금지`, brandSp.includes("facts 에 없는 본사 측 수치 인용"));
  check(
    `C급 활용 권장 (인용 0건 = 활용 부족)`,
    brandSp.includes("C급이 facts pool 에 있는데 본문 인용 0건"),
  );

  // industry sysprompt 는 C급 룰 미포함 (industry mode = A 전용)
  console.log("\n[T2] industry sysprompt — C급 룰 미포함");
  check(`industry sysprompt # C급 섹션 X`, !indSp.includes("# C급 (본사 docx) 출처 활용"));

  // 회귀 — 기존 룰 보존
  console.log("\n[regression] v2-15/17/19/20/21/22 보존");
  check(`# 글의 본질 (v2-21 데이터 제공자)`, brandSp.includes("# 글의 본질"));
  check(`데이터 제공자 톤 (v2-21)`, brandSp.includes("프랜도어는 데이터 제공자"));
  check(`종결어미 비율 60%/25%/5%/10% (v2-19)`, brandSp.includes("60%") && brandSp.includes("10%"));
  check(`5블럭 [A]~[E]`, brandSp.includes("[블럭 A]") && brandSp.includes("[블럭 E]"));
  check(`결론 체크리스트`, brandSp.includes("## 결론 체크리스트"));
  check(`이 글에서 계산한 값`, brandSp.includes("이 글에서 계산한 값"));
  check(`출처 · 집계 방식`, brandSp.includes("## 출처 · 집계 방식"));
  check(`마지막 한 줄 중립 마무리 (v2-21)`, brandSp.includes("자본·상권·운영 역량"));
  check(`facts pool 외 숫자 금지`, brandSp.includes("facts pool 외 숫자"));
  check(`점포명 익명화`, brandSp.includes("점포명") && brandSp.includes("절대 금지"));
  check(`industry round number 룰 (v2-20)`, indSp.includes("round number 임의 사용"));
  check(`# 양면 제시 (A vs C)`, brandSp.includes("# 양면 제시 (A vs C)"));

  // 길이
  console.log(`\n   brand sysprompt 길이 = ${brandSp.length} 자`);
  console.log(`   industry sysprompt 길이 = ${indSp.length} 자`);
  check(`brand 길이 < 6,000자`, brandSp.length < 6000, `len=${brandSp.length}`);
  check(`industry 길이 < 6,000자`, indSp.length < 6000, `len=${indSp.length}`);

  console.log(`\n=== ${okAll ? "ALL PASS" : "SOME FAILED"} ===\n`);
  process.exit(okAll ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
