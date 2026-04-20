/* sync-leave-from-xlsx 로 중복 insert된 row 청소
 *  판별 기준: reason이 "[...]" 단독 prefix + 2025-01-01~2026-04-13 내 + 대상 5명
 *  같은 날짜 DB 합계가 xlsx 합계를 초과하는 경우에만 삭제
 */
import * as fs from "fs";
import * as path from "path";
import { createClient } from "@supabase/supabase-js";

function loadEnv() {
  const envPath = path.resolve(__dirname, "..", ".env.local");
  if (!fs.existsSync(envPath)) return;
  const text = fs.readFileSync(envPath, "utf8");
  let inQuote = false, buf = "", lines: string[] = [];
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

type Rec = { date: string; type_raw: string; type_key: string; duration_raw: string; days: number };

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  const supa = createClient(url, key, { auth: { persistSession: false } });

  const apply = process.argv.includes("--apply");
  const parsed: Record<string, Rec[]> = JSON.parse(
    fs.readFileSync(path.resolve(__dirname, ".leave-parsed.json"), "utf8")
  );
  const names = Object.keys(parsed);
  const { data: emps } = await supa.from("employees").select("id,name").in("name", names);
  const byName = new Map<string, string>();
  for (const e of (emps ?? []) as { id: string; name: string }[]) byName.set(e.name, e.id);

  const { data: dbRows } = await supa
    .from("leave_requests")
    .select("id,applicant_id,applicant_name,leave_type,start_date,days,status,reason,created_at")
    .in("applicant_id", Array.from(byName.values()))
    .gte("start_date", "2025-01-01")
    .lte("start_date", "2026-04-13");

  const ROW_RE = /^\[.+\]$/; // 정확히 "[...]" 형태인 reason = 내 sync 스크립트가 남긴 것
  const toDelete: string[] = [];
  const keptDetail: string[] = [];

  for (const name of names) {
    const empId = byName.get(name);
    if (!empId) continue;
    const xlsxRows = parsed[name] ?? [];
    const xlsxByDate = new Map<string, number>();
    for (const r of xlsxRows) xlsxByDate.set(r.date, (xlsxByDate.get(r.date) ?? 0) + r.days);

    const dbForEmp = (dbRows ?? []).filter(r => r.applicant_id === empId);
    const dbByDate = new Map<string, Array<Record<string, unknown>>>();
    for (const r of dbForEmp) {
      const d = r.start_date as string;
      if (!dbByDate.has(d)) dbByDate.set(d, []);
      dbByDate.get(d)!.push(r);
    }

    for (const [date, rows] of dbByDate) {
      const xlsxDays = xlsxByDate.get(date) ?? 0;
      const dbDays = rows.reduce((s, r) => s + (Number(r.days) || 0), 0);
      if (dbDays <= xlsxDays + 0.001) continue; // 초과 아님

      // 최신 생성된 "[...]" reason 행부터 삭제 시도
      const sorted = rows
        .filter(r => typeof r.reason === "string" && ROW_RE.test(r.reason as string))
        .sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));

      let removeNeeded = dbDays - xlsxDays;
      for (const r of sorted) {
        if (removeNeeded <= 0.001) break;
        toDelete.push(r.id as string);
        keptDetail.push(`  - ${name} ${date} [${r.leave_type}] ${r.days}일 reason=${String(r.reason).slice(0, 40)}`);
        removeNeeded -= Number(r.days) || 0;
      }
    }
  }

  console.log(`삭제 대상: ${toDelete.length}건`);
  keptDetail.slice(0, 40).forEach(l => console.log(l));
  if (toDelete.length > 40) console.log(`  ... +${toDelete.length - 40}건`);

  if (!apply) {
    console.log("\n(DRY RUN — 실제 삭제하려면 --apply 추가)");
    return;
  }

  if (toDelete.length === 0) { console.log("삭제할 것 없음."); return; }
  const { error, count } = await supa
    .from("leave_requests")
    .delete({ count: "exact" })
    .in("id", toDelete);
  if (error) throw error;
  console.log(`\n✅ 삭제 완료: ${count ?? toDelete.length}건`);
}

main().catch(e => { console.error(e); process.exit(1); });
