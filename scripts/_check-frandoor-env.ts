/**
 * PR056 — frandoor supabase 연결 검증 + 스키마 점검.
 *
 *   npx tsx scripts/_check-frandoor-env.ts
 *
 * 출력:
 *   - 연결 성공 / 실패
 *   - ftc_brands_2024 행 수
 *   - 첫 행 컬럼 (정확한 이름·타입 확인)
 *   - induty_mlsfc 분포 (업종별 brand 수)
 */

import * as fs from "node:fs";
import * as path from "node:path";

const envPath = path.resolve(process.cwd(), ".env.local");
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const m = line.match(/^([A-Z0-9_]+)=([\s\S]*)$/);
    if (!m) continue;
    let v = m[2];
    if (v.startsWith("'") && v.endsWith("'")) v = v.slice(1, -1);
    if (v.startsWith('"') && v.endsWith('"')) v = v.slice(1, -1);
    if (!process.env[m[1]]) process.env[m[1]] = v;
  }
}

async function main() {
  const { isFrandoorConfigured, createFrandoorClient } = await import("../utils/supabase/frandoor");
  if (!isFrandoorConfigured()) {
    console.error(
      "❌ env 미설정. .env.local 에 다음 추가 필요:\n  FRANDOOR_SUPABASE_URL=https://felaezeqnoskkowoqsja.supabase.co\n  FRANDOOR_SUPABASE_SERVICE_ROLE_KEY=<service_role_key>",
    );
    process.exit(1);
  }
  const sb = createFrandoorClient();

  console.log("[1] count check ...");
  const { count, error: ce } = await sb
    .from("ftc_brands_2024")
    .select("*", { count: "exact", head: true });
  if (ce) {
    console.error("count error:", ce.message);
    process.exit(2);
  }
  console.log(`  ftc_brands_2024 행 수: ${count}`);

  console.log("\n[2] sample row (1) — 컬럼 확인 ...");
  const { data: sample, error: se } = await sb
    .from("ftc_brands_2024")
    .select("*")
    .limit(1);
  if (se || !sample || sample.length === 0) {
    console.error("sample error:", se?.message ?? "no rows");
    process.exit(3);
  }
  const cols = Object.keys(sample[0]);
  console.log(`  컬럼 ${cols.length}개:`);
  console.log(`  ${cols.slice(0, 30).join(", ")}${cols.length > 30 ? ", ..." : ""}`);

  console.log("\n[3] 분식 brand 검색 ...");
  const { data: oogong, error: oe } = await sb
    .from("ftc_brands_2024")
    .select("*")
    .eq("brand_nm", "오공김밥")
    .limit(1)
    .maybeSingle();
  if (oe) console.error("  fetch 오공김밥 error:", oe.message);
  else if (!oogong) console.log("  '오공김밥' brand_nm 매칭 없음 (corp_nm 또는 reg_no 시도 필요)");
  else {
    console.log(`  오공김밥 row 발견: brand_nm=${oogong.brand_nm}, induty_mlsfc=${oogong.induty_mlsfc}`);
  }

  console.log("\n[4] 분식 induty_mlsfc 행 수 ...");
  const { count: snackCount } = await sb
    .from("ftc_brands_2024")
    .select("*", { count: "exact", head: true })
    .eq("induty_mlsfc", "분식");
  console.log(`  분식 brand 수: ${snackCount}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
