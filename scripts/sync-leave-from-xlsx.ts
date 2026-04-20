/* 통합 문서1.xlsx → Supabase leave_requests 동기화
 *  - scripts/parse-leave-xlsx.py 결과 scripts/.leave-parsed.json 소비
 *  - employees 테이블에서 이름 매칭 → applicant_id
 *  - 기존 leave_requests 와 (applicant_id, start_date, leave_type) 기준 중복 방지
 *  - 신규 건만 insert
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

type Rec = {
  date: string;
  type_raw: string;
  type_key: string;
  duration_raw: string;
  days: number;
};

const KNOWN_LEAVE_TYPES = new Set([
  "annual","half_am","half_pm","quarter_am","quarter_pm","hourly",
  "military","marriage_self","condolence_close","condolence_extended",
  "menstrual","family_care","spouse_birth",
]);

function normalizeType(rec: Rec): { leave_type: string; reason_suffix: string } {
  if (KNOWN_LEAVE_TYPES.has(rec.type_key)) return { leave_type: rec.type_key, reason_suffix: "" };
  // 직장교육 / 기타 → reason에 원본 유지, type은 annual 임시 분류 금지 → "training" 저장
  if (rec.type_raw.includes("직장교육")) return { leave_type: "training", reason_suffix: `[직장교육]` };
  return { leave_type: "annual", reason_suffix: `[${rec.type_raw}]` };
}

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Supabase env 미설정");
  const supa = createClient(url, key, { auth: { persistSession: false } });

  const parsedPath = path.resolve(__dirname, ".leave-parsed.json");
  const data: Record<string, Rec[]> = JSON.parse(fs.readFileSync(parsedPath, "utf8"));
  const names = Object.keys(data);

  const { data: emps, error: eErr } = await supa
    .from("employees")
    .select("id,name,department,emp_number")
    .in("name", names);
  if (eErr) throw eErr;
  const byName = new Map<string, Record<string, string>>();
  for (const e of emps ?? []) byName.set(String((e as Record<string, unknown>).name), e as Record<string, string>);

  console.log("직원 매핑:");
  for (const n of names) {
    const hit = byName.get(n);
    console.log(`  ${n} → ${hit ? `id=${hit.id} / ${hit.department} / ${hit.emp_number}` : "❌ 매칭 실패"}`);
  }

  const applicantIds = Array.from(byName.values()).map(e => e.id);
  const { data: existing } = await supa
    .from("leave_requests")
    .select("applicant_id,start_date,leave_type,days")
    .in("applicant_id", applicantIds)
    .gte("start_date", "2025-01-01")
    .lte("start_date", "2026-04-13");
  const existingKey = new Set<string>();
  for (const r of (existing ?? []) as Record<string, string>[]) {
    existingKey.add(`${r.applicant_id}|${r.start_date}|${r.leave_type}`);
  }
  console.log(`\n기존 DB 동일 기간 행 수: ${existingKey.size}`);

  const toInsert: Record<string, unknown>[] = [];
  const skipped: { name: string; date: string; reason: string }[] = [];
  for (const [name, recs] of Object.entries(data)) {
    const emp = byName.get(name);
    if (!emp) {
      for (const r of recs) skipped.push({ name, date: r.date, reason: "직원 매핑 실패" });
      continue;
    }
    for (const r of recs) {
      const { leave_type, reason_suffix } = normalizeType(r);
      const key = `${emp.id}|${r.date}|${leave_type}`;
      if (existingKey.has(key)) {
        skipped.push({ name, date: r.date, reason: `중복 (${leave_type})` });
        continue;
      }
      existingKey.add(key);
      toInsert.push({
        applicant_id: emp.id,
        applicant_name: name,
        applicant_department: emp.department ?? null,
        leave_type,
        start_date: r.date,
        end_date: r.date,
        days: r.days,
        status: "승인_완료",
        reason: reason_suffix || `[${r.type_raw} ${r.duration_raw}]`,
      });
    }
  }

  console.log(`\n삽입 대상: ${toInsert.length}건`);
  console.log(`스킵: ${skipped.length}건`);
  for (const s of skipped) console.log(`  - ${s.name} ${s.date}: ${s.reason}`);

  if (toInsert.length > 0) {
    const { data: ins, error } = await supa.from("leave_requests").insert(toInsert).select("id");
    if (error) throw error;
    console.log(`\n✅ 삽입 완료: ${ins?.length ?? 0}건`);
  } else {
    console.log("\n(삽입할 신규 건 없음)");
  }
}

main().catch(e => { console.error(e); process.exit(1); });
