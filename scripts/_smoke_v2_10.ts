/**
 * v2-10 smoke — ftc_column_labels heuristic + isIngestibleColumn + getColumnMeta.
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
  console.log(`  ${ok ? "✓" : "✗"} ${label}${detail ? ` — ${detail}` : ""}`);
  if (!ok) okAll = false;
}

async function main() {
  const { FTC_COLUMN_META, getColumnMeta, isIngestibleColumn, inferColumnMeta } = await import(
    "../lib/geo/v2/ftc_column_labels"
  );

  console.log("\n=== v2-10 smoke ===\n");

  // 1. 명시 매핑
  console.log("[explicit]");
  check(`frcs_cnt_2024_total → 개`, FTC_COLUMN_META["frcs_cnt_2024_total"]?.unit === "개");
  check(`startup_cost_total → 만원 + transform`, FTC_COLUMN_META["startup_cost_total"]?.unit === "만원" && typeof FTC_COLUMN_META["startup_cost_total"]?.transform === "function");
  check(`fin_2024_revenue → 만원`, FTC_COLUMN_META["fin_2024_revenue"]?.unit === "만원");
  check(`avg_sales_2024_seoul → 만원 transform`, FTC_COLUMN_META["avg_sales_2024_seoul"]?.transform?.(15000) === 1500);
  check(`brand_nm → skip`, FTC_COLUMN_META["brand_nm"]?.skip === true);
  check(`induty_mlsfc → skip`, FTC_COLUMN_META["induty_mlsfc"]?.skip === true);

  // 2. heuristic — skip 패턴
  console.log("\n[heuristic skip]");
  check(`my_special_id → skip`, inferColumnMeta("my_special_id").skip === true);
  check(`founded_dt → skip`, inferColumnMeta("founded_dt").skip === true);
  check(`is_active → skip`, inferColumnMeta("is_active").skip === true);
  check(`registered_yn → skip`, inferColumnMeta("registered_yn").skip === true);
  check(`new_field_url → skip`, inferColumnMeta("new_field_url").skip === true);

  // 3. heuristic — unit 추론
  console.log("\n[heuristic unit]");
  check(`some_pct → %`, inferColumnMeta("some_pct").unit === "%");
  check(`growth_rate → %`, inferColumnMeta("growth_rate").unit === "%");
  check(`some_cnt → 개`, inferColumnMeta("some_cnt").unit === "개");
  check(`special_count → 개`, inferColumnMeta("special_count").unit === "개");
  {
    const m = inferColumnMeta("extra_fee");
    check(
      `extra_fee → 만원 + transform (1만 → 1000)`,
      m.unit === "만원" && typeof m.transform === "function" && m.transform!(10000) === 1000,
    );
  }
  {
    const m = inferColumnMeta("lease_amount");
    check(
      `lease_amount → 만원 + transform`,
      m.unit === "만원" && typeof m.transform === "function",
    );
  }
  check(`store_area → ㎡`, inferColumnMeta("store_area").unit === "㎡");
  {
    const m = inferColumnMeta("unknown_field");
    check(
      `unknown_field → "" + raw (skip=false, no transform)`,
      m.unit === "" && !m.skip && !m.transform,
    );
  }

  // 4. isIngestibleColumn 통합
  console.log("\n[isIngestibleColumn]");
  check(`brand_nm → false (skip)`, isIngestibleColumn("brand_nm") === false);
  check(`startup_cost_total → true`, isIngestibleColumn("startup_cost_total") === true);
  check(`unknown_field → true (heuristic 통과)`, isIngestibleColumn("unknown_field") === true);
  check(`my_id → false (heuristic skip)`, isIngestibleColumn("my_id") === false);

  // 5. getColumnMeta — explicit > heuristic
  console.log("\n[getColumnMeta]");
  const knownMeta = getColumnMeta("startup_cost_total");
  check(`startup_cost_total label = '창업비용 총액'`, knownMeta.label === "창업비용 총액");
  const unknownMeta = getColumnMeta("totally_new_metric_pct");
  check(`totally_new_metric_pct → heuristic %`, unknownMeta.unit === "%" && unknownMeta.label === "totally_new_metric_pct");

  // 6. transform 환산 정확성
  console.log("\n[transform]");
  check(`fin_2024_revenue 1억 (천원=10만) → 1만 (만원)`, FTC_COLUMN_META["fin_2024_revenue"]?.transform?.(100000) === 10000);
  check(`startup_fee 1500 천원 → 150 만원`, FTC_COLUMN_META["startup_fee"]?.transform?.(1500) === 150);

  console.log(`\n=== ${okAll ? "ALL PASS" : "SOME FAILED"} ===\n`);
  process.exit(okAll ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
