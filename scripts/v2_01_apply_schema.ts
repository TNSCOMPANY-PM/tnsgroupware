/**
 * v2-01 schema apply 스크립트.
 *
 * frandoor supabase 에 brand_facts / industry_facts 테이블 신설.
 *
 * 적용 방식 (자동 fallback):
 *   1. supabase RPC `exec_sql` 가 있으면 호출 (idempotent)
 *   2. 없으면 SQL 파일 경로 + 수동 실행 안내 출력
 *
 * 실행: npx tsx scripts/v2_01_apply_schema.ts
 *      npx tsx scripts/v2_01_apply_schema.ts --verify   (적용 검증만)
 */

import * as fs from "node:fs";
import * as path from "node:path";

// ─────────────────────────────────────────────
// .env.local 직접 로드
// ─────────────────────────────────────────────
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

const SQL_PATH = path.resolve(process.cwd(), "db/migrations/v2_01_brand_facts.sql");

async function verifyOnly() {
  const { isFrandoorConfigured, createFrandoorClient } = await import(
    "../utils/supabase/frandoor"
  );
  if (!isFrandoorConfigured()) {
    console.error("❌ FRANDOOR env 미설정.");
    process.exit(1);
  }
  const sb = createFrandoorClient();

  console.log("\n=== v2-01 schema 검증 ===\n");

  // brand_facts 존재 확인
  const { count: bfCount, error: bfErr } = await sb
    .from("brand_facts")
    .select("*", { count: "exact", head: true });
  if (bfErr) {
    console.log(`❌ brand_facts: ${bfErr.message}`);
  } else {
    console.log(`✓ brand_facts 존재 (row=${bfCount ?? 0})`);
  }

  // industry_facts 존재 확인
  const { count: ifCount, error: ifErr } = await sb
    .from("industry_facts")
    .select("*", { count: "exact", head: true });
  if (ifErr) {
    console.log(`❌ industry_facts: ${ifErr.message}`);
  } else {
    console.log(`✓ industry_facts 존재 (row=${ifCount ?? 0})`);
  }

  // 기존 테이블 무영향 확인
  const { count: ftcCount, error: ftcErr } = await sb
    .from("ftc_brands_2024")
    .select("*", { count: "exact", head: true });
  if (ftcErr) {
    console.log(`⚠️  ftc_brands_2024: ${ftcErr.message}`);
  } else {
    console.log(`✓ ftc_brands_2024 보존 (row=${ftcCount ?? 0})`);
  }

  process.exit(0);
}

async function applyViaRpc(sql: string): Promise<{ ok: boolean; reason?: string }> {
  const { createFrandoorClient } = await import("../utils/supabase/frandoor");
  const sb = createFrandoorClient();
  try {
    // exec_sql RPC 가 있으면 호출. 없으면 PGRST 에러.
    const { error } = await (sb as unknown as {
      rpc: (name: string, args: { sql: string }) => Promise<{ error: { message: string } | null }>;
    }).rpc("exec_sql", { sql });
    if (error) return { ok: false, reason: error.message };
    return { ok: true };
  } catch (e) {
    return { ok: false, reason: e instanceof Error ? e.message : String(e) };
  }
}

async function main() {
  if (process.argv.includes("--verify")) {
    await verifyOnly();
    return;
  }

  if (!fs.existsSync(SQL_PATH)) {
    console.error(`❌ SQL 파일 없음: ${SQL_PATH}`);
    process.exit(1);
  }
  const sql = fs.readFileSync(SQL_PATH, "utf8");

  const { isFrandoorConfigured } = await import("../utils/supabase/frandoor");
  if (!isFrandoorConfigured()) {
    console.error("❌ FRANDOOR env 미설정. .env.local 의 FRANDOOR_SUPABASE_URL / SERVICE_ROLE_KEY 확인.");
    process.exit(1);
  }

  console.log("\n=== v2-01 schema 적용 시도 (RPC exec_sql) ===\n");
  const r = await applyViaRpc(sql);

  if (r.ok) {
    console.log("✓ exec_sql RPC 통해 적용 완료\n");
    console.log("→ npx tsx scripts/v2_01_apply_schema.ts --verify 로 검증 권장.");
    process.exit(0);
  }

  // RPC 미존재 시 수동 실행 안내
  console.log("⚠️  exec_sql RPC 호출 실패 (RPC 미설치 또는 권한 부족):");
  console.log(`   ${r.reason ?? "unknown"}\n`);
  console.log("=== 수동 적용 절차 ===\n");
  console.log("1. supabase dashboard 접속:");
  console.log("   https://app.supabase.com/project/felaezeqnoskkowoqsja");
  console.log("2. SQL Editor 열기 → New query");
  console.log(`3. 다음 파일 내용 복사·붙여넣기 후 Run:`);
  console.log(`   ${SQL_PATH}`);
  console.log("4. 적용 후 검증:");
  console.log("   npx tsx scripts/v2_01_apply_schema.ts --verify\n");

  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
