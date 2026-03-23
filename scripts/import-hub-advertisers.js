/**
 * hub_advertiser_202603231222.xlsx → Supabase clients 테이블 upsert
 * 실행: node scripts/import-hub-advertisers.js
 */

const XLSX = require("xlsx");
const { createClient } = require("@supabase/supabase-js");
const path = require("path");
const fs = require("fs");

// .env.local 수동 로드
function loadEnv() {
  const envPath = path.join(__dirname, "../.env.local");
  if (!fs.existsSync(envPath)) return;
  const lines = fs.readFileSync(envPath, "utf-8").split("\n");
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq < 0) continue;
    const key = trimmed.slice(0, eq).trim();
    const val = trimmed.slice(eq + 1).trim().replace(/^["']|["']$/g, "");
    if (!process.env[key]) process.env[key] = val;
  }
}
loadEnv();

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error("❌ SUPABASE_URL 또는 SERVICE_ROLE_KEY가 없습니다. .env.local을 확인하세요.");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

function parseJsonArray(val) {
  if (!val || val === "[]") return [];
  try {
    const arr = JSON.parse(val);
    return Array.isArray(arr) ? arr.map((s) => String(s).trim()).filter(Boolean) : [];
  } catch {
    return [String(val).trim()].filter(Boolean);
  }
}

async function main() {
  const xlsxPath = path.join(__dirname, "../hub_advertiser_202603231222.xlsx");
  const wb = XLSX.readFile(xlsxPath);
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1 });

  // 헤더: id, 사업자명(법인명), 전화번호, 통장번호, 세금계산서 발행 이메일, 입금자명, 주소, 사업자 정보 1, 사업자 정보 2, 사업자 번호, 대표자
  const dataRows = rows.slice(1).filter((r) => r[1]); // 사업자명 있는 것만

  console.log(`📋 총 ${dataRows.length}개 광고주 파싱 완료`);

  const records = dataRows.map((r) => {
    const aliases = [...new Set(parseJsonArray(r[5]))];    // 입금자명 (중복 제거)
    const emails = parseJsonArray(r[4]);     // 세금계산서 이메일
    const name = String(r[1] ?? "").trim();

    return {
      name,
      aliases,
      contact: r[2] ? String(r[2]).trim() : null,
      email: emails[0] ?? null,
      address: r[6] ? String(r[6]).trim() : null,
      business_type: r[7] ? String(r[7]).trim() : null,
      business_item: r[8] ? String(r[8]).trim() : null,
      business_number: r[9] ? String(r[9]).trim() : null,
      representative: r[10] ? String(r[10]).trim() : null,
      category: "더널리",  // 더널리팀 광고주 DB
      notes: null,
    };
  });

  // 기존 clients에서 사업자번호/이름 중복 체크 후 upsert
  const BATCH = 20;
  let inserted = 0, updated = 0, skipped = 0;

  for (let i = 0; i < records.length; i += BATCH) {
    const batch = records.slice(i, i + BATCH);

    for (const rec of batch) {
      // 사업자번호로 기존 데이터 조회
      let existing = null;
      if (rec.business_number) {
        const { data } = await supabase
          .from("clients")
          .select("id, aliases")
          .eq("business_number", rec.business_number)
          .limit(1);
        existing = data?.[0] ?? null;
      }
      if (!existing) {
        const { data } = await supabase
          .from("clients")
          .select("id, aliases")
          .eq("name", rec.name)
          .limit(1);
        existing = data?.[0] ?? null;
      }

      if (existing) {
        // 기존 aliases 병합 (중복 제거)
        const mergedAliases = Array.from(new Set([...(existing.aliases ?? []), ...rec.aliases]));
        const { error } = await supabase
          .from("clients")
          .update({
            aliases: mergedAliases,
            contact: rec.contact,
            email: rec.email,
            address: rec.address,
            business_type: rec.business_type,
            business_item: rec.business_item,
            business_number: rec.business_number,
            representative: rec.representative,
          })
          .eq("id", existing.id);
        if (error) { console.error(`  ⚠️ UPDATE 실패 [${rec.name}]:`, error.message); skipped++; }
        else updated++;
      } else {
        const { error } = await supabase.from("clients").insert(rec);
        if (error) { console.error(`  ⚠️ INSERT 실패 [${rec.name}]:`, error.message); skipped++; }
        else inserted++;
      }
    }

    process.stdout.write(`\r  진행: ${Math.min(i + BATCH, records.length)}/${records.length}`);
  }

  console.log(`\n\n✅ 완료 — 신규 ${inserted}개 / 업데이트 ${updated}개 / 실패 ${skipped}개`);
}

main().catch((e) => { console.error("❌ 오류:", e); process.exit(1); });
