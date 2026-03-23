/**
 * clients 테이블의 aliases 중복 제거
 * 실행: node scripts/dedup-aliases.js
 */
const { createClient } = require("@supabase/supabase-js");
const path = require("path");
const fs = require("fs");

function loadEnv() {
  const envPath = path.join(__dirname, "../.env.local");
  if (!fs.existsSync(envPath)) return;
  for (const line of fs.readFileSync(envPath, "utf-8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq < 0) continue;
    const key = trimmed.slice(0, eq).trim();
    const val = trimmed.slice(eq + 1).trim().replace(/^[\"']|[\"']$/g, "");
    if (!process.env[key]) process.env[key] = val;
  }
}
loadEnv();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

async function main() {
  const { data, error } = await supabase.from("clients").select("id, name, aliases");
  if (error) { console.error("조회 실패:", error.message); process.exit(1); }

  let fixed = 0;
  for (const c of data ?? []) {
    const deduped = [...new Set((c.aliases ?? []).map((a) => String(a).trim()).filter(Boolean))];
    if (deduped.length !== (c.aliases ?? []).length) {
      const { error: upErr } = await supabase.from("clients").update({ aliases: deduped }).eq("id", c.id);
      if (!upErr) { fixed++; console.log(`  ✓ ${c.name}: ${c.aliases.length} → ${deduped.length}개`); }
    }
  }
  console.log(`\n✅ 완료 — ${fixed}개 거래처 aliases 중복 제거`);
}

main().catch((e) => { console.error("❌ 오류:", e); process.exit(1); });
