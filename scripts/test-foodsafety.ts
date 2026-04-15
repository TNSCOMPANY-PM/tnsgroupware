import * as fs from "fs";
import * as path from "path";

function loadEnv() {
  const envPath = path.resolve(__dirname, "..", ".env.local");
  if (!fs.existsSync(envPath)) return;
  const text = fs.readFileSync(envPath, "utf8");
  for (const line of text.split(/\r?\n/)) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (!m) continue;
    let v = m[2];
    if (v.startsWith('"') && v.endsWith('"')) v = v.slice(1, -1);
    if (!process.env[m[1]]) process.env[m[1]] = v;
  }
}
loadEnv();

async function main() {
  const { searchHygieneByBizName, searchRecallByProduct, searchNutritionByFood } =
    await import("../utils/foodSafety");

  console.log("━━━ 1) I0490 부적합 회수 — 업소명 '스타벅스' 3건 ━━━");
  try {
    const { total, rows } = await searchHygieneByBizName("스타벅스", 3);
    console.log(`  total=${total}, 반환=${rows.length}`);
    for (const r of rows) {
      console.log(`  · ${r.PRDTNM ?? "?"} | ${r.PRDLST_TYPE ?? ""} | ${r.RTRVLPRVNS ?? ""} | ${r.ADDR ?? ""}`);
    }
  } catch (e) {
    console.error("  ✗", e instanceof Error ? e.message : e);
  }

  console.log("\n━━━ 2) I0490 부적합 회수 — 제품명 '라면' 3건 ━━━");
  try {
    const { total, rows } = await searchRecallByProduct("라면", 3);
    console.log(`  total=${total}, 반환=${rows.length}`);
    for (const r of rows) {
      console.log(`  · ${r.PRDTNM ?? "?"} | ${r.PRDLST_TYPE ?? ""} | ${r.RTRVLPRVNS ?? ""} | ${r.ADDR ?? ""}`);
    }
  } catch (e) {
    console.error("  ✗", e instanceof Error ? e.message : e);
  }

  console.log("\n━━━ 3) I2790 영양성분 '김치찌개' — 키 승인 필요 시 안내 ━━━");
  try {
    const { total, rows } = await searchNutritionByFood("김치찌개", 3);
    console.log(`  total=${total}, 반환=${rows.length}`);
    for (const r of rows) console.log(`  · ${JSON.stringify(r).slice(0, 150)}`);
  } catch (e) {
    console.error("  ✗", e instanceof Error ? e.message : e);
  }
}

main().catch(e => { console.error(e); process.exit(1); });
