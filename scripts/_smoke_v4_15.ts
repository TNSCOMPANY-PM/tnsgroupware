/**
 * v4-15 smoke — 팩트 추출 + 본문 자동 chain (extract-facts → facts-a → facts-c → write).
 * 정적 source-level 검증 (UI 클릭 시뮬은 별도).
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
  console.log("\n=== v4-15 smoke ===\n");

  const fs = await import("node:fs/promises");

  // T1 — extract-facts API 응답 확장
  console.log("[T1] extract-facts API 응답 — brand_label / industry / brand_id");
  const extractSrc = await fs.readFile("app/api/brands/[id]/extract-facts/route.ts", "utf-8");
  check(`SELECT industry_main / industry_sub`, extractSrc.includes("industry_main, industry_sub"));
  check(`응답에 brand_label`, extractSrc.includes("brand_label: brandMeta.name"));
  check(`응답에 industry (sub 우선)`, extractSrc.includes("brandMeta.industry_sub ?? brandMeta.industry_main"));
  check(`응답에 brand_id`, extractSrc.includes("brand_id: brandId"));
  check(`응답에 ftc_brand_id`, extractSrc.includes("ftc_brand_id: brandMeta.ftc_brand_id"));
  check(`v4-15 마커`, extractSrc.includes("v4-15"));

  // T2 — DualSourceSection extractFactsAndGenerate 4-step chain
  console.log("\n[T2] DualSourceSection — extractFactsAndGenerate 4-step chain");
  const dualSrc = await fs.readFile("components/frandoor/DualSourceSection.tsx", "utf-8");
  check(`extractFactsAndGenerate 함수`, dualSrc.includes("extractFactsAndGenerate"));
  check(`step 1/4 — extract-facts`, dualSrc.includes("/api/brands/${brand.id}/extract-facts"));
  check(`step 2/4 — facts-a`, dualSrc.includes("/api/geo/facts-a"));
  check(`step 3/4 — facts-c`, dualSrc.includes("/api/geo/facts-c/${draftId}"));
  check(`step 4/4 — write`, dualSrc.includes("/api/geo/write/${draftId}"));
  check(`progress 1/4 메시지`, dualSrc.includes("1/4"));
  check(`progress 2/4 메시지`, dualSrc.includes("2/4"));
  check(`progress 3/4 메시지`, dualSrc.includes("3/4"));
  check(`progress 4/4 메시지`, dualSrc.includes("4/4"));
  check(`완료 confirm + redirect`, dualSrc.includes("/content/posts/${draftId}"));

  // T3 — busy state string
  console.log("\n[T3] progress UI — setBusy string");
  check(`setBusy 호출 다수`, (dualSrc.match(/setBusy\(/g) ?? []).length >= 4);

  // T4 — FTC_BRAND_ID_MISSING fallback
  console.log("\n[T4] FTC_BRAND_ID_MISSING fallback");
  check(`FTC_BRAND_ID_MISSING 분기`, dualSrc.includes("FTC_BRAND_ID_MISSING"));
  check(`fallback 안내 문구 — ftc_brand_id 매핑`, dualSrc.includes("ftc_brand_id 매핑"));

  // T2b — 버튼 라벨 (양쪽 분리)
  console.log("\n[T2b] 버튼 라벨 — 자동 생성 + 팩트만 추출");
  check(`primary 버튼 — "팩트 추출 + 본문 자동 생성"`, dualSrc.includes("팩트 추출 + 본문 자동 생성"));
  check(`secondary 버튼 — "팩트만 추출"`, dualSrc.includes("팩트만 추출"));
  check(`primary 버튼 onClick=extractFactsAndGenerate`, dualSrc.includes("onClick={extractFactsAndGenerate}"));
  check(`secondary 버튼 onClick=extractFacts`, dualSrc.includes("onClick={extractFacts}"));

  // T2c — topic auto-build
  console.log("\n[T2c] topic 자동 빌드");
  check(
    `topic = brandLabel + industry + 평균 비교`,
    dualSrc.includes("프랜차이즈 평균 비교") && dualSrc.includes("창업비용·매출·가맹점 데이터"),
  );

  console.log(`\n=== ${okAll ? "ALL PASS" : "SOME FAILED"} ===\n`);
  process.exit(okAll ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
