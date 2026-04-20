/* xlsx vs DB 대조 감사
 *  - scripts/.leave-parsed.json vs Supabase leave_requests
 *  - 2025-01-01 ~ 2026-04-13 범위
 *  - 누락/중복/불일치 건 전부 출력
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

  const parsed: Record<string, Rec[]> = JSON.parse(
    fs.readFileSync(path.resolve(__dirname, ".leave-parsed.json"), "utf8")
  );
  const names = Object.keys(parsed);

  const { data: emps } = await supa.from("employees").select("id,name").in("name", names);
  const byName = new Map<string, string>();
  const byId = new Map<string, string>();
  for (const e of (emps ?? []) as { id: string; name: string }[]) {
    byName.set(e.name, e.id);
    byId.set(e.id, e.name);
  }

  const { data: dbRows } = await supa
    .from("leave_requests")
    .select("id,applicant_id,applicant_name,leave_type,start_date,end_date,days,status,reason")
    .in("applicant_id", Array.from(byName.values()))
    .gte("start_date", "2025-01-01")
    .lte("start_date", "2026-04-13")
    .order("start_date", { ascending: false });

  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("직원별 xlsx vs DB 대조");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");

  for (const name of names) {
    const empId = byName.get(name);
    if (!empId) { console.log(`[${name}] 직원 미매칭`); continue; }

    const xlsxRows = parsed[name] ?? [];
    const dbForEmp = (dbRows ?? []).filter(r => r.applicant_id === empId) as Array<Record<string, unknown>>;

    const xlsxDays = xlsxRows.reduce((s, r) => s + r.days, 0);
    const dbDays = dbForEmp.reduce((s, r) => s + (Number(r.days) || 0), 0);
    const dbAnnualDays = dbForEmp
      .filter(r => ["annual","half_am","half_pm","quarter_am","quarter_pm","hourly"].includes(r.leave_type as string))
      .reduce((s, r) => s + (Number(r.days) || 0), 0);

    console.log(`━━ ${name} ━━`);
    console.log(`  xlsx: ${xlsxRows.length}건, 합계 ${xlsxDays}일`);
    console.log(`  DB  : ${dbForEmp.length}건, 합계 ${dbDays}일 (연차계열만: ${dbAnnualDays}일, status별: ${groupBy(dbForEmp, "status")})`);

    // 날짜별 xlsx vs DB
    const xlsxByDate = new Map<string, number>();
    for (const r of xlsxRows) xlsxByDate.set(r.date, (xlsxByDate.get(r.date) ?? 0) + r.days);
    const dbByDate = new Map<string, number>();
    for (const r of dbForEmp) {
      const d = r.start_date as string;
      dbByDate.set(d, (dbByDate.get(d) ?? 0) + (Number(r.days) || 0));
    }

    const allDates = new Set([...xlsxByDate.keys(), ...dbByDate.keys()]);
    const diffs: string[] = [];
    for (const d of [...allDates].sort().reverse()) {
      const x = xlsxByDate.get(d) ?? 0;
      const b = dbByDate.get(d) ?? 0;
      if (Math.abs(x - b) > 0.001) {
        diffs.push(`    ${d}: xlsx=${x}일 / DB=${b}일`);
      }
    }
    if (diffs.length) {
      console.log("  ⚠ 날짜별 불일치:");
      diffs.forEach(s => console.log(s));
    } else {
      console.log("  ✓ 날짜별 합계 일치");
    }

    // xlsx엔 없고 DB에만 있는 것 / 반대
    const onlyInXlsx = [...xlsxByDate.keys()].filter(d => !dbByDate.has(d));
    const onlyInDB = [...dbByDate.keys()].filter(d => !xlsxByDate.has(d));
    if (onlyInXlsx.length) console.log(`  📄 xlsx에만 있음: ${onlyInXlsx.slice(0, 10).join(", ")}${onlyInXlsx.length > 10 ? "…" : ""}`);
    if (onlyInDB.length) console.log(`  💾 DB에만 있음: ${onlyInDB.slice(0, 10).join(", ")}${onlyInDB.length > 10 ? "…" : ""}`);
    console.log();
  }
}

function groupBy<T extends Record<string, unknown>>(rows: T[], key: string): string {
  const m = new Map<string, number>();
  for (const r of rows) {
    const k = String(r[key] ?? "-");
    m.set(k, (m.get(k) ?? 0) + 1);
  }
  return Array.from(m, ([k, v]) => `${k}=${v}`).join(", ");
}

main().catch(e => { console.error(e); process.exit(1); });
