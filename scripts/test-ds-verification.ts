import * as fs from "fs";
import * as path from "path";

function loadEnv() {
  const envPath = path.resolve(__dirname, "..", ".env.local");
  if (!fs.existsSync(envPath)) return;
  const text = fs.readFileSync(envPath, "utf8");
  let inQuote = false;
  let buf = "";
  const lines: string[] = [];
  for (const ch of text) {
    if (ch === '"') inQuote = !inQuote;
    if (ch === "\n" && !inQuote) { lines.push(buf); buf = ""; continue; }
    buf += ch;
  }
  if (buf) lines.push(buf);
  for (const line of lines) {
    const m = line.match(/^([A-Z0-9_]+)=([\s\S]*)$/);
    if (!m) continue;
    let v = m[2];
    if (v.startsWith("'") && v.endsWith("'")) v = v.slice(1, -1);
    if (v.startsWith('"') && v.endsWith('"')) v = v.slice(1, -1);
    if (!process.env[m[1]]) process.env[m[1]] = v;
  }
}
loadEnv();

type DsResult = {
  dsType: string;
  label: string;
  ok: boolean;
  title?: string;
  lede?: string;
  tableCount?: number;
  firstTableRows?: number;
  sources?: string[];
  error?: string;
};

async function runOne(
  label: string,
  fn: () => Promise<import("../utils/datasheetBuilder").DatasheetInput>,
  dsType: string,
): Promise<DsResult> {
  const start = Date.now();
  try {
    const input = await fn();
    const dur = Date.now() - start;
    const tableRows = input.tables[0]?.rows ?? [];
    const firstTableRows = tableRows.length;
    const hasEmptyMarker = tableRows.length === 1 && tableRows[0].every(c => c === "-" || c === "해당 업종 데이터 없음" || String(c).includes("데이터 없음"));
    const ok = input.tables.length > 0 && firstTableRows > 0 && !hasEmptyMarker && input.sources && input.sources.length > 0;
    console.log(`[${ok ? "OK " : "FAIL"}] ${dsType} (${label}) ${dur}ms — tables=${input.tables.length} rows0=${firstTableRows} sources=${input.sources.length}`);
    console.log(`       title: ${input.title}`);
    console.log(`       lede : ${input.lede.slice(0, 120)}`);
    return {
      dsType, label, ok,
      title: input.title,
      lede: input.lede,
      tableCount: input.tables.length,
      firstTableRows,
      sources: input.sources,
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.log(`[FAIL] ${dsType} (${label}) — ${msg}`);
    return { dsType, label, ok: false, error: msg };
  }
}

async function main() {
  const mod = await import("../utils/dsGenerators");
  const results: DsResult[] = [];

  console.log("\n━━━ 카페 버그 회귀 테스트 (DS-01/02/06) ━━━");
  results.push(await runOne("카페", () => mod.generateDS01("카페"), "DS-01"));
  results.push(await runOne("카페", () => mod.generateDS02("카페"), "DS-02"));
  results.push(await runOne("치킨", () => mod.generateDS06("치킨"), "DS-06"));

  console.log("\n━━━ 기존 DS-07/08 리팩터 검증 ━━━");
  results.push(await runOne("카페", () => mod.generateDS07("카페"), "DS-07"));
  results.push(await runOne("카페", () => mod.generateDS08("카페"), "DS-08"));

  console.log("\n━━━ 지역·컨텍스트 DS-17~20 ━━━");
  results.push(await runOne("서울특별시", () => mod.generateDS17("서울특별시"), "DS-17"));
  results.push(await runOne("카페/서울", () => mod.generateDS18("카페", "서울특별시"), "DS-18"));
  results.push(await runOne("치킨/서울", () => mod.generateDS19("치킨", "서울특별시"), "DS-19"));
  results.push(await runOne("서울특별시", () => mod.generateDS20("서울특별시"), "DS-20"));

  console.log("\n━━━ 브랜드·시장·계보 DS-21, 24, 25, 26 ━━━");
  results.push(await runOne("스타벅스", () => mod.generateDS21("스타벅스"), "DS-21"));
  results.push(await runOne("BBQ", () => mod.generateDS24("BBQ"), "DS-24"));
  results.push(await runOne("전체", () => mod.generateDS25(), "DS-25"));
  results.push(await runOne("전체", () => mod.generateDS26(), "DS-26"));

  console.log("\n━━━ 법령·실무 DS-22, 23 ━━━");
  results.push(await runOne("정적", () => mod.generateDS22(), "DS-22"));
  results.push(await runOne("정적", () => mod.generateDS23(), "DS-23"));

  console.log("\n━━━ 업종 종합 DS-27, 28 ━━━");
  results.push(await runOne("카페", () => mod.generateDS27("카페"), "DS-27"));
  results.push(await runOne("2026-03", () => mod.generateDS28("2026-03"), "DS-28"));

  console.log("\n━━━ 식품·시장 DS-29, 30 ━━━");
  results.push(await runOne("치킨", () => mod.generateDS29("치킨"), "DS-29"));
  results.push(await runOne("한식", () => mod.generateDS30("한식"), "DS-30"));

  const okCount = results.filter(r => r.ok).length;
  const failCount = results.length - okCount;
  console.log(`\n━━━ 요약 ━━━`);
  console.log(`PASS: ${okCount}/${results.length}`);
  console.log(`FAIL: ${failCount}`);
  if (failCount > 0) {
    console.log("실패 목록:");
    for (const r of results) if (!r.ok) console.log(`  - ${r.dsType}: ${r.error ?? "빈 테이블/sources 누락"}`);
  }

  const reportPath = path.resolve(__dirname, "..", "docs", "ds-verification-2026-04-17.md");
  const reportDir = path.dirname(reportPath);
  if (!fs.existsSync(reportDir)) fs.mkdirSync(reportDir, { recursive: true });

  const lines: string[] = [];
  lines.push(`# DS 생성기 검증 리포트 (2026-04-17)`);
  lines.push(``);
  lines.push(`- 총 ${results.length}개 DS 검증, PASS ${okCount} / FAIL ${failCount}`);
  lines.push(`- 검증 방식: tsx로 \`generateDS*\` 생성기 직접 호출 (route.ts는 generateOne의 얇은 래퍼. 인증 레이어만 추가)`);
  lines.push(`- 판정 기준: tables.length ≥ 1 AND rows[0].length ≥ 1 AND empty-marker 아님 AND sources.length ≥ 1`);
  lines.push(``);
  lines.push(`## 결과 테이블`);
  lines.push(``);
  lines.push(`| DS | 파라미터 | 결과 | tables | rows0 | sources | 비고 |`);
  lines.push(`|---|---|---|---|---|---|---|`);
  for (const r of results) {
    const mark = r.ok ? "✅" : "❌";
    const srcs = (r.sources ?? []).join("; ");
    const note = r.error ? r.error : (r.ok ? "" : "빈 테이블 또는 sources 누락");
    lines.push(`| ${r.dsType} | ${r.label} | ${mark} | ${r.tableCount ?? "-"} | ${r.firstTableRows ?? "-"} | ${srcs.slice(0, 80)} | ${note} |`);
  }
  lines.push(``);
  lines.push(`## 샘플 lede`);
  lines.push(``);
  for (const r of results) {
    if (r.lede) lines.push(`- **${r.dsType}** (${r.label}): ${r.lede.slice(0, 180)}`);
  }
  fs.writeFileSync(reportPath, lines.join("\n"), "utf8");
  console.log(`\n리포트 저장: ${reportPath}`);
  process.exit(failCount > 0 ? 1 : 0);
}

main().catch(e => {
  console.error("SCRIPT ERROR:", e);
  process.exit(2);
});
