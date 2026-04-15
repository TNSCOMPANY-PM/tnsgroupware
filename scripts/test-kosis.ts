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
  const { fetchStatisticsList, fetchStatisticsData, fetchKosisIndustryAvg } =
    await import("../utils/kosis");

  console.log("━━━ 1) 통계목록 검색 '서비스업동향조사' ━━━");
  try {
    const list = await fetchStatisticsList({ vwCd: "MT_ZTITLE", parentListId: "" });
    const filtered = list
      .filter(x => (x.LIST_NM ?? x.STAT_NAME ?? "").includes("서비스"))
      .slice(0, 3);
    for (const it of filtered) {
      console.log(`  · LIST_ID=${it.LIST_ID ?? it.TBL_ID} | ${it.LIST_NM ?? it.STAT_NAME ?? ""}`);
    }
    if (filtered.length === 0) {
      console.log("  (상위 목록에는 매칭 없음 — vwCd=MT_ZTITLE 기준)");
      for (const it of list.slice(0, 5)) {
        console.log(`    ↳ ${it.LIST_ID ?? it.TBL_ID} | ${it.LIST_NM ?? it.STAT_NAME ?? ""}`);
      }
    }
  } catch (e) {
    console.error("  ✗", e instanceof Error ? e.message : e);
  }

  console.log("\n━━━ 2) 인구총조사(DT_1B040A3) 최신 5행 — statisticsData.do 검증 ━━━");
  try {
    const rows = await fetchStatisticsData({
      orgId: "101",
      tblId: "DT_1B040A3",
      objL1: "00",
      itmId: "T20",
      prdSe: "Y",
      newEstPrdCnt: 5,
    });
    for (const r of rows.slice(0, 5)) {
      console.log(`  · ${r.PRD_DE} | ${r.C1_NM ?? r.C1 ?? ""} | ${r.ITM_NM ?? ""} ${r.DT}${r.UNIT_NM ?? ""}`);
    }
    if (rows.length === 0) console.log("  (응답 0행)");
  } catch (e) {
    console.error("  ✗", e instanceof Error ? e.message : e);
  }

  console.log("\n━━━ 3) fetchKosisIndustryAvg('음식점업') ━━━");
  try {
    const avg = await fetchKosisIndustryAvg("음식점업");
    console.log("  ", avg ? JSON.stringify(avg, null, 2) : "(매핑 실패)");
  } catch (e) {
    console.error("  ✗", e instanceof Error ? e.message : e);
  }
}

main().catch(e => { console.error(e); process.exit(1); });
