/**
 * v4-01 smoke — column selector + ftc catalog + truncate.
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
  console.log("\n=== v4-01 smoke ===\n");

  // T1 — ftc_column_catalog
  console.log("[T1] ftc_column_catalog");
  const cat = await import("../lib/geo/v4/ftc_column_catalog");
  const text = cat.buildFtcColumnCatalog();
  check(`catalog 길이 > 1000자`, text.length > 1000, `len=${text.length}`);
  check(`[메타] 카테고리 포함`, text.includes("[메타]"));
  check(`[가맹점 수 / 변동] 카테고리`, text.includes("[가맹점 수 / 변동]"));
  check(`[가맹점 매출] 카테고리`, text.includes("[가맹점 매출]"));
  check(`[창업비용] 카테고리`, text.includes("[창업비용]"));
  check(`[본사 재무] 카테고리`, text.includes("[본사 재무]"));
  check(`[항상 포함] 안내`, text.includes("[항상 포함]"));
  check(`brand_nm 포함`, text.includes("brand_nm"));
  check(`induty_lclas 포함`, text.includes("induty_lclas"));
  check(`avg_sales_2024_total 포함`, text.includes("avg_sales_2024_total"));
  check(`fin_2024_revenue 포함`, text.includes("fin_2024_revenue"));

  const known = cat.getKnownColumns();
  check(`getKnownColumns Set`, known.size > 50, `size=${known.size}`);
  check(`always include 6개`, cat.ALWAYS_INCLUDE_COLUMNS.length === 6);

  // T2 — claude.ts (Haiku + extractJson)
  console.log("\n[T2] claude.ts surface");
  const claude = await import("../lib/geo/v4/claude");
  check(`callHaiku exported`, typeof claude.callHaiku === "function");
  check(`callSonnet exported`, typeof claude.callSonnet === "function");
  check(`extractJson exported`, typeof claude.extractJson === "function");
  {
    const r = claude.extractJson('```json\n{"a": 1}\n```');
    check(`extractJson code fence`, JSON.stringify(r) === '{"a":1}');
  }
  {
    const r = claude.extractJson("결과:\n{\"columns\": [\"a\", \"b\"]}");
    check(`extractJson leading text`, JSON.stringify(r).includes("a"));
  }
  {
    const r = claude.extractJson("{\"a\": 1, }");
    check(`extractJson trailing comma`, JSON.stringify(r) === '{"a":1}');
  }

  // T3 — select_columns.ts surface (LLM 호출 없이)
  console.log("\n[T3] select_columns surface");
  const sc = await import("../lib/geo/v4/steps/select_columns");
  check(`selectColumns exported`, typeof sc.selectColumns === "function");

  // T4 — truncateDocxIfLarge (pipeline 내부 함수 — surface 검증 안 됨, 동작만 확인)
  console.log("\n[T4] pipeline 모듈 surface");
  const pipeline = await import("../lib/geo/v4/pipeline");
  check(`generateV4 exported`, typeof pipeline.generateV4 === "function");
  check(`FtcBrandIdMissingError exported`, typeof pipeline.FtcBrandIdMissingError === "function");

  // T5 — sysprompt 변경 없음 (회귀)
  console.log("\n[T5] v4 sysprompt 회귀");
  const sp = await import("../lib/geo/v4/sysprompt");
  const text2 = sp.buildSysprompt({
    brand_label: "오공김밥",
    industry: "외식",
    industry_sub: "분식",
    topic: "test",
    today: "2026-04-30",
    hasDocx: true,
  });
  check(`sysprompt 톤 60%`, text2.includes("60%"));
  check(`sysprompt C급 강제`, text2.includes("C급 (본사 docx) 활용"));
  check(`sysprompt 점포명 익명화`, text2.includes("점포명") && text2.includes("절대 금지"));

  console.log(`\n=== ${okAll ? "ALL PASS" : "SOME FAILED"} ===\n`);
  process.exit(okAll ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
