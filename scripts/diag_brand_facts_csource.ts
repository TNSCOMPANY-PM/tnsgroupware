/**
 * v3-07 진단 — 특정 brand 의 docx label 매핑 분포 보고.
 *
 * 사용:
 *   npx tsx scripts/diag_brand_facts_csource.ts <geo_brands.id 또는 brand_name>
 *
 * 출력:
 *   1. geo_brands row (id, name, ftc_brand_id 매핑 여부)
 *   2. brand_fact_data (TNS) 전체 label 빈도
 *   3. mapFactLabelToMetricId 결과 — mapped vs unmapped 분포
 *   4. frandoor.brand_facts (dual-write 결과) — source_tier='C' row 갯수
 *   5. unmapped label 권장 조치
 */

import "dotenv/config";
import { createAdminClient } from "@/utils/supabase/admin";
import { isFrandoorConfigured, createFrandoorClient } from "@/utils/supabase/frandoor";
import { mapFactLabelToMetricId } from "@/lib/geo/v2/factLabelMap";
import type { FactLabel, FactSourceType } from "@/types/factSchema";

async function main() {
  const arg = process.argv[2];
  if (!arg) {
    console.error("Usage: npx tsx scripts/diag_brand_facts_csource.ts <geo_brand_id | brand_name>");
    process.exit(1);
  }

  const tns = createAdminClient();

  // 1. geo_brands row 찾기
  const isUuid = /^[0-9a-f-]{36}$/i.test(arg);
  const { data: brands, error: bErr } = isUuid
    ? await tns.from("geo_brands").select("id, name, ftc_brand_id, ftc_match_method").eq("id", arg)
    : await tns.from("geo_brands").select("id, name, ftc_brand_id, ftc_match_method").ilike("name", `%${arg}%`);
  if (bErr) {
    console.error("geo_brands 조회 실패:", bErr.message);
    process.exit(1);
  }
  if (!brands || brands.length === 0) {
    console.error(`brand 없음: ${arg}`);
    process.exit(1);
  }
  if (brands.length > 1) {
    console.log(`${brands.length} 건 매칭:`);
    for (const b of brands) console.log(`  - id=${b.id} name=${b.name}`);
    console.log("정확한 id 또는 더 구체적인 이름으로 재시도 권장.\n");
  }
  const brand = brands[0];
  console.log("\n=== 1. geo_brands ===");
  console.log(`  id: ${brand.id}`);
  console.log(`  name: ${brand.name}`);
  console.log(`  ftc_brand_id: ${brand.ftc_brand_id ?? "(NULL — 미매핑)"}`);
  console.log(`  ftc_match_method: ${brand.ftc_match_method ?? "(NULL)"}`);

  // 2. brand_fact_data 전체 label 빈도
  const { data: facts, error: fErr } = await tns
    .from("brand_fact_data")
    .select("label, value, value_normalized, unit, provenance, source_type, source_note, confidence")
    .eq("brand_id", brand.id)
    .eq("provenance", "docx");
  if (fErr) {
    console.error("brand_fact_data 조회 실패:", fErr.message);
    process.exit(1);
  }

  console.log(`\n=== 2. brand_fact_data (provenance='docx') ===`);
  console.log(`  총 ${facts?.length ?? 0} 건`);
  if (!facts || facts.length === 0) {
    console.log("  → docx 미업로드 또는 extract-facts 미실행. 결과: C급 0건.\n");
    process.exit(0);
  }

  const labelCount: Record<string, number> = {};
  for (const f of facts) {
    const k = String(f.label);
    labelCount[k] = (labelCount[k] ?? 0) + 1;
  }
  const sortedLabels = Object.entries(labelCount).sort((a, b) => b[1] - a[1]);
  console.log("  label 빈도:");
  for (const [label, count] of sortedLabels) console.log(`    ${count.toString().padStart(3)}  ${label}`);

  // 3. mapFactLabelToMetricId 결과
  console.log(`\n=== 3. mapFactLabelToMetricId 매핑 ===`);
  const mapped: Array<{ label: string; metric_id: string; count: number }> = [];
  const unmapped: Array<{ label: string; count: number; sample_value: string }> = [];
  for (const [label, count] of sortedLabels) {
    // 첫 fact 의 source_type 사용 (label 단위 매핑이므로 source_type 영향 적음)
    const sample = facts.find((f) => String(f.label) === label);
    const metric_id = mapFactLabelToMetricId(label as FactLabel, sample?.source_type as FactSourceType);
    if (metric_id) {
      mapped.push({ label, metric_id, count });
    } else {
      unmapped.push({ label, count, sample_value: String(sample?.value ?? "") });
    }
  }
  console.log(`  mapped: ${mapped.length} label, ${mapped.reduce((s, m) => s + m.count, 0)} row`);
  for (const m of mapped) console.log(`    ${m.count.toString().padStart(3)}  ${m.label} → ${m.metric_id}`);
  console.log(`  unmapped: ${unmapped.length} label, ${unmapped.reduce((s, u) => s + u.count, 0)} row`);
  for (const u of unmapped)
    console.log(`    ${u.count.toString().padStart(3)}  ${u.label}  (예: "${u.sample_value.slice(0, 40)}")`);

  // 4. frandoor.brand_facts dual-write 결과
  console.log(`\n=== 4. frandoor.brand_facts (dual-write) ===`);
  if (!brand.ftc_brand_id) {
    console.log("  ftc_brand_id NULL → dual-write skip — frandoor.brand_facts 에 0건 추정.");
  } else if (!isFrandoorConfigured()) {
    console.log("  isFrandoorConfigured() === false — frandoor 클라이언트 미설정.");
  } else {
    const fra = createFrandoorClient();
    const { data: fraFacts, error: fraErr } = await fra
      .from("brand_facts")
      .select("metric_id, source_tier, provenance")
      .eq("brand_id", brand.ftc_brand_id);
    if (fraErr) {
      console.error("  frandoor.brand_facts 조회 실패:", fraErr.message);
    } else {
      const tierCount: Record<string, number> = {};
      for (const r of fraFacts ?? []) {
        const t = String(r.source_tier);
        tierCount[t] = (tierCount[t] ?? 0) + 1;
      }
      console.log(`  총 ${fraFacts?.length ?? 0} 건. 분포:`);
      for (const t of ["A", "B", "C"]) {
        console.log(`    ${t}: ${tierCount[t] ?? 0} 건`);
      }
    }
  }

  // 5. 권장 조치
  console.log(`\n=== 5. 권장 조치 ===`);
  if (!brand.ftc_brand_id) {
    console.log("  [필수] geo_brands.ftc_brand_id 매핑:");
    console.log("    1) frandoor supabase 에서 ftc_brands_2024 의 brand_nm 검색 → id 확인");
    console.log("    2) TNS supabase 에서 UPDATE geo_brands SET ftc_brand_id='<id>', ftc_match_method='manual' WHERE id='" + brand.id + "';");
    console.log("    3) /frandoor 에서 'docx 팩트 추출' 다시 실행 → dual-write 트리거");
  }
  if (unmapped.length > 0) {
    console.log("  [선택] unmapped label 처리:");
    console.log("    옵션 (a) lib/geo/v2/factLabelMap.ts 에 매핑 추가 (metric_id 47개 확장 필요 시 metric_ids.ts 도)");
    console.log("    옵션 (b) v3-07 T2 — Step 1 facts pool 쿼리에서 C급 metric_id NULL 도 포함 (이미 코드 변경됨)");
  }
  if (mapped.length === 0 && (facts?.length ?? 0) === 0) {
    console.log("  brand_fact_data 0건 → docx 업로드 + extract-facts 실행 필요.");
  }

  console.log("");
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
