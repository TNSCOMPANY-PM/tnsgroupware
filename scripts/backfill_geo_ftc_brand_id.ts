/**
 * v4 — geo_brands.ftc_brand_id backfill.
 *
 * 흐름:
 *   1. TNS geo_brands 의 모든 row 조회 (ftc_brand_id NULL 포함)
 *   2. frandoor ftc_brands_2024 에서 brand_nm 으로 fuzzy match
 *      - exact match → ftc_match_method='exact'
 *      - normalized match (공백/특수문자 제거 후 일치) → 'normalized'
 *      - 다중 후보 → CSV 출력 (수동 검토)
 *   3. UPDATE geo_brands SET ftc_brand_id, ftc_match_method
 *
 * 사용:
 *   npx tsx scripts/backfill_geo_ftc_brand_id.ts          # dry-run (CSV 출력만)
 *   npx tsx scripts/backfill_geo_ftc_brand_id.ts --apply  # 실제 UPDATE
 */

import "dotenv/config";
import { createAdminClient } from "@/utils/supabase/admin";
import { createFrandoorClient } from "@/utils/supabase/frandoor";

function normalize(s: string): string {
  return s
    .toLowerCase()
    .replace(/[\s\-_().,!?'"]/g, "")
    .replace(/[가-힣]+/g, (m) => m); // Korean unchanged
}

async function main() {
  const apply = process.argv.includes("--apply");
  console.log(`\n=== backfill_geo_ftc_brand_id (mode: ${apply ? "APPLY" : "DRY-RUN"}) ===\n`);

  const tns = createAdminClient();
  const fra = createFrandoorClient();

  // 1. geo_brands (TNS)
  const { data: geoBrands, error: gErr } = await tns
    .from("geo_brands")
    .select("id, name, ftc_brand_id, ftc_match_method");
  if (gErr) {
    console.error("geo_brands fetch:", gErr.message);
    process.exit(1);
  }
  const allGeo = geoBrands ?? [];
  const unmapped = allGeo.filter((b) => !b.ftc_brand_id);
  console.log(`geo_brands 총 ${allGeo.length} / 매핑 ${allGeo.length - unmapped.length} / 미매핑 ${unmapped.length}\n`);

  if (unmapped.length === 0) {
    console.log("모두 매핑됨. 종료.");
    process.exit(0);
  }

  // 2. ftc_brands_2024 전체 brand_nm 인덱스
  const { data: ftcBrands, error: fErr } = await fra
    .from("ftc_brands_2024")
    .select("id, brand_nm, corp_nm");
  if (fErr) {
    console.error("ftc_brands_2024 fetch:", fErr.message);
    process.exit(1);
  }
  const ftcRows = (ftcBrands ?? []) as Array<{ id: string | number; brand_nm: string; corp_nm: string }>;

  // 인덱스 빌드
  const exactMap = new Map<string, typeof ftcRows>();
  const normMap = new Map<string, typeof ftcRows>();
  for (const r of ftcRows) {
    const exact = (r.brand_nm ?? "").trim();
    if (exact) {
      const arr = exactMap.get(exact) ?? [];
      arr.push(r);
      exactMap.set(exact, arr);
    }
    const norm = normalize(exact);
    if (norm) {
      const arr = normMap.get(norm) ?? [];
      arr.push(r);
      normMap.set(norm, arr);
    }
  }

  // 3. 매칭
  type MatchResult = {
    geo_id: string;
    geo_name: string;
    method: "exact" | "normalized" | "multi" | "none";
    ftc_id?: string;
    ftc_brand_nm?: string;
    candidates?: Array<{ id: string; brand_nm: string; corp_nm: string }>;
  };
  const results: MatchResult[] = [];
  let exactCount = 0;
  let normCount = 0;
  let multiCount = 0;
  let noneCount = 0;

  for (const g of unmapped) {
    const geoName = (g.name as string) ?? "";
    const exactCandidates = exactMap.get(geoName.trim()) ?? [];
    if (exactCandidates.length === 1) {
      results.push({
        geo_id: g.id as string,
        geo_name: geoName,
        method: "exact",
        ftc_id: String(exactCandidates[0].id),
        ftc_brand_nm: exactCandidates[0].brand_nm,
      });
      exactCount++;
      continue;
    }
    if (exactCandidates.length > 1) {
      results.push({
        geo_id: g.id as string,
        geo_name: geoName,
        method: "multi",
        candidates: exactCandidates.map((c) => ({
          id: String(c.id),
          brand_nm: c.brand_nm,
          corp_nm: c.corp_nm,
        })),
      });
      multiCount++;
      continue;
    }
    const normCandidates = normMap.get(normalize(geoName)) ?? [];
    if (normCandidates.length === 1) {
      results.push({
        geo_id: g.id as string,
        geo_name: geoName,
        method: "normalized",
        ftc_id: String(normCandidates[0].id),
        ftc_brand_nm: normCandidates[0].brand_nm,
      });
      normCount++;
      continue;
    }
    if (normCandidates.length > 1) {
      results.push({
        geo_id: g.id as string,
        geo_name: geoName,
        method: "multi",
        candidates: normCandidates.map((c) => ({
          id: String(c.id),
          brand_nm: c.brand_nm,
          corp_nm: c.corp_nm,
        })),
      });
      multiCount++;
      continue;
    }
    results.push({ geo_id: g.id as string, geo_name: geoName, method: "none" });
    noneCount++;
  }

  console.log(`매칭 결과: exact=${exactCount} normalized=${normCount} multi=${multiCount} none=${noneCount}\n`);

  // 4. exact + normalized → UPDATE 후보 출력
  const autoApply = results.filter((r) => r.method === "exact" || r.method === "normalized");
  console.log(`자동 매핑 가능: ${autoApply.length}건 (exact + normalized)`);
  for (const r of autoApply.slice(0, 20)) {
    console.log(`  - ${r.geo_name} → ftc_id=${r.ftc_id} (${r.method}) [ftc=${r.ftc_brand_nm}]`);
  }
  if (autoApply.length > 20) console.log(`  ... 외 ${autoApply.length - 20}건`);

  // 5. multi 후보 — CSV
  const multi = results.filter((r) => r.method === "multi");
  if (multi.length > 0) {
    console.log(`\n다중 후보 (수동 검토 필요): ${multi.length}건`);
    console.log("CSV: geo_id,geo_name,ftc_id,ftc_brand_nm,corp_nm");
    for (const r of multi) {
      for (const c of r.candidates ?? []) {
        console.log(`${r.geo_id},${r.geo_name},${c.id},${c.brand_nm},${c.corp_nm}`);
      }
    }
  }

  // 6. none — 매핑 못 함
  const none = results.filter((r) => r.method === "none");
  if (none.length > 0) {
    console.log(`\n매칭 안 됨 (FTC 미등록 brand): ${none.length}건`);
    for (const r of none.slice(0, 10)) console.log(`  - ${r.geo_name}`);
    if (none.length > 10) console.log(`  ... 외 ${none.length - 10}건`);
  }

  // 7. apply
  if (!apply) {
    console.log(`\n[DRY-RUN] 실제 UPDATE 안 함. --apply 옵션으로 재실행.`);
    process.exit(0);
  }

  console.log(`\n[APPLY] geo_brands.ftc_brand_id UPDATE 시작...`);
  let okCount = 0;
  let errCount = 0;
  for (const r of autoApply) {
    if (!r.ftc_id) continue;
    const { error: uErr } = await tns
      .from("geo_brands")
      .update({ ftc_brand_id: r.ftc_id, ftc_match_method: r.method })
      .eq("id", r.geo_id);
    if (uErr) {
      console.error(`  ✗ ${r.geo_name}: ${uErr.message}`);
      errCount++;
    } else {
      okCount++;
    }
  }
  console.log(`\n결과: ok=${okCount} err=${errCount}`);
  console.log(`다중 후보 ${multi.length}건 + 매칭 안됨 ${none.length}건 은 수동 처리 필요.`);
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
