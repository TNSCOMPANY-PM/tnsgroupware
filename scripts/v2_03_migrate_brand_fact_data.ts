/**
 * v2-03 마이그레이션 — tns.brand_fact_data → frandoor.brand_facts.
 *
 * docx provenance + 매핑 가능 label 만 이전. label 매핑 없는 row 는 skip (보존).
 *
 * 사용:
 *   npx tsx scripts/v2_03_migrate_brand_fact_data.ts
 *   npx tsx scripts/v2_03_migrate_brand_fact_data.ts --dry-run
 *   npx tsx scripts/v2_03_migrate_brand_fact_data.ts --brand-id <UUID>
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

type Args = { dryRun: boolean; brandId: string | null };
function parseArgs(): Args {
  const a: Args = { dryRun: false, brandId: null };
  const argv = process.argv.slice(2);
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--dry-run") a.dryRun = true;
    else if (argv[i] === "--brand-id") a.brandId = argv[++i];
  }
  return a;
}

async function main() {
  const args = parseArgs();
  console.log(`\n=== v2-03 brand_fact_data → brand_facts 마이그레이션 ===`);
  console.log(`옵션: dryRun=${args.dryRun} brandId=${args.brandId ?? "전체"}\n`);

  const { isFrandoorConfigured, createFrandoorClient } = await import("../utils/supabase/frandoor");
  const { createAdminClient } = await import("../utils/supabase/admin");
  const { mapFactLabelToMetricId, decideProvenance } = await import("../lib/geo/v2/factLabelMap");
  const { METRIC_IDS } = await import("../lib/geo/v2/metric_ids");

  if (!isFrandoorConfigured()) {
    console.error("❌ FRANDOOR env 미설정");
    process.exit(1);
  }

  const tns = createAdminClient();
  const fra = createFrandoorClient();

  // 1. brand_fact_data 조회
  let q = tns.from("brand_fact_data").select("*");
  if (args.brandId) q = q.eq("brand_id", args.brandId);
  const { data: rows, error } = await q;
  if (error) {
    console.error("[brand_fact_data] 조회 실패:", error.message);
    process.exit(1);
  }
  console.log(`[brand_fact_data] ${rows?.length ?? 0} row\n`);

  // 2. 매핑
  const v2Rows: Array<Record<string, unknown>> = [];
  let skippedNoMap = 0;
  let skippedNoBrand = 0;
  const period = "2026-04"; // 마이그레이션 시점

  for (const r of rows ?? []) {
    if (!r.brand_id) {
      skippedNoBrand++;
      continue;
    }
    const metric_id = mapFactLabelToMetricId(
      r.label as never,
      r.source_type as never,
    );
    if (!metric_id) {
      skippedNoMap++;
      continue;
    }
    const meta = METRIC_IDS[metric_id];
    if (!meta) {
      skippedNoMap++;
      continue;
    }
    const { provenance: prov, source_tier } = decideProvenance(
      r.provenance as "docx" | "public_fetch",
      r.source_type as never,
    );

    v2Rows.push({
      brand_id: r.brand_id,
      metric_id,
      metric_label: meta.label,
      value_num: r.value_normalized,
      value_text: r.value_normalized == null ? r.value : null,
      unit: r.unit && r.unit !== "없음" ? r.unit : meta.unit,
      period,
      provenance: prov,
      source_tier,
      source_url: r.source_url ?? null,
      source_label:
        prov === "docx"
          ? `본사 docx (마이그레이션, ${period})${r.source_note ? ` — ${r.source_note}` : ""}`
          : prov === "ftc"
            ? `공정거래위원회 정보공개서 (${period})`
            : prov === "kosis"
              ? `정부 통계 (${period})`
              : null,
      confidence:
        typeof r.confidence === "number" && r.confidence >= 0.85
          ? "high"
          : typeof r.confidence === "number" && r.confidence >= 0.7
            ? "medium"
            : "low",
    });
  }

  console.log(`[mapping] 변환=${v2Rows.length} skip(매핑없음)=${skippedNoMap} skip(brand없음)=${skippedNoBrand}\n`);

  if (args.dryRun) {
    console.log("✓ dry-run — 적재 skip\n");
    if (v2Rows.length > 0) {
      console.log("샘플 5건:");
      for (const r of v2Rows.slice(0, 5)) {
        console.log(`  ${r.brand_id} / ${r.metric_id} / ${r.value_num ?? r.value_text} / ${r.provenance}/${r.source_tier}`);
      }
    }
    process.exit(0);
  }

  // 3. upsert (배치 1000)
  const BATCH = 1000;
  for (let i = 0; i < v2Rows.length; i += BATCH) {
    const slice = v2Rows.slice(i, i + BATCH);
    const { error: upErr } = await fra
      .from("brand_facts")
      .upsert(slice, { onConflict: "brand_id,metric_id,period,provenance" });
    if (upErr) {
      console.error(`[brand_facts] batch ${i} 실패:`, upErr.message);
      process.exit(1);
    }
  }
  console.log(`✓ ${v2Rows.length} row 마이그레이션 완료\n`);
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
