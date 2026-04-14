/**
 * 기존 fact_data 의 label 을 FACT_LABEL_ENUM 값으로 재추출 마이그레이션.
 *
 * 사용법:
 *   npx tsx scripts/migrate_fact_labels.ts              # 전체 브랜드
 *   npx tsx scripts/migrate_fact_labels.ts --id=xxx     # 특정 브랜드
 *   npx tsx scripts/migrate_fact_labels.ts --dry-run    # 대상만 나열, 추출 안 함
 *
 * 내부적으로 runExtractFacts() 직접 호출 (HTTP 미사용 → 로그인/쿠키 불필요).
 */

import * as fs from "fs";
import * as path from "path";

function loadEnv() {
  const envPath = path.resolve(__dirname, "..", ".env.local");
  if (!fs.existsSync(envPath)) return;
  const text = fs.readFileSync(envPath, "utf8");
  for (const line of text.split(/\r?\n/)) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (!m) continue;
    let value = m[2];
    if (value.startsWith('"') && value.endsWith('"')) value = value.slice(1, -1);
    if (!process.env[m[1]]) process.env[m[1]] = value;
  }
}

loadEnv();

async function main() {
  const args = process.argv.slice(2);
  const targetId = args.find(a => a.startsWith("--id="))?.split("=")[1];
  const dryRun = args.includes("--dry-run");

  const { createClient } = await import("@supabase/supabase-js");
  const { runExtractFacts } = await import("../utils/runExtractFacts");

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) {
    console.error("Supabase env 변수 누락 (URL / service role key)");
    process.exit(1);
  }
  const supabase = createClient(supabaseUrl, serviceKey);

  let query = supabase.from("geo_brands").select("id, name, fact_file_url, landing_url");
  if (targetId) query = query.eq("id", targetId);
  const { data: brands, error } = await query;
  if (error) { console.error("브랜드 조회 실패:", error); process.exit(1); }
  if (!brands || brands.length === 0) { console.log("대상 브랜드 없음"); return; }

  console.log(`[migrate] 대상 브랜드: ${brands.length}개${dryRun ? " (dry-run)" : ""}`);

  let success = 0;
  let failed = 0;
  let skipped = 0;
  for (const b of brands) {
    const hasSource = !!b.fact_file_url || !!b.landing_url;
    if (!hasSource) {
      console.log(`  - ${b.name}: 소스 없음 skip`);
      skipped++;
      continue;
    }
    if (dryRun) {
      console.log(`  - ${b.name}: dry-run OK`);
      continue;
    }

    try {
      const t0 = Date.now();
      const { status, body } = await runExtractFacts(b.id, ev => {
        if (ev.stage === "parse") console.log(`      · 파싱 ${ev.current}/${ev.total}: ${ev.name}${ev.scan ? " [스캔]" : ""}`);
        else if (ev.stage === "parse_skip") console.log(`      ⚠ ${ev.name}: ${ev.reason}`);
        else if (ev.stage === "cache_check") console.log(`      · 캐시 ${ev.hit ? "HIT" : "MISS"}`);
        else if (ev.stage === "prescan") console.log(`      · 프리스캔 ${Math.round(ev.chars / 1000)}k자`);
        else if (ev.stage === "extract") console.log(`      · 청크 ${ev.chunks_processed}개 완료`);
      });
      const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
      if (status === 200 && body.ok) {
        console.log(`  ✓ ${b.name}: keywords=${body.keywords_count} chunks=${body.chunks_processed ?? "?"} (${elapsed}s)`);
        success++;
      } else {
        console.error(`  ✗ ${b.name}: ${body.error ?? JSON.stringify(body)}`);
        failed++;
      }
    } catch (e) {
      console.error(`  ✗ ${b.name}:`, e instanceof Error ? e.message : e);
      failed++;
    }
  }

  console.log(`[migrate] 완료: 성공 ${success} / 실패 ${failed} / skip ${skipped}`);
}

main().catch(e => { console.error(e); process.exit(1); });
