const fs = require("fs");
const path = require("path");
const XLSX = require("xlsx");

// Load env
const envPath = path.join(__dirname, "..", ".env.local");
const envLines = fs.readFileSync(envPath, "utf8").split("\n");
for (const line of envLines) {
  const m = line.match(/^([A-Z_]+)=(.*)$/);
  if (m) process.env[m[1]] = m[2];
}

const { createClient } = require("@supabase/supabase-js");
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const wb = XLSX.readFile(path.join(__dirname, "..", "통합 문서1.xlsx"));

const EMP = {
  "김동균": { id: "d02fd372-5869-4b17-afc6-a7b19e687621", dept: "마케팅사업부", hire: "2019-07-09" },
  "김정섭": { id: "5e9b0118-b22f-4255-80db-00d2ef6cf327", dept: "마케팅사업부", hire: "2025-02-01" },
  "심규성": { id: "13f10962-acdb-4658-a3de-8fedee9a68ad", dept: "마케팅사업부", hire: "2022-08-01" },
  "김용준": { id: "7d61d4a4-b4a4-43fc-b9f5-754e9de26137", dept: "마케팅사업부", hire: "2022-01-17" },
  "박재민": { id: "26324355-dd18-438c-9e92-6f9fd66a9b45", dept: "마케팅사업부", hire: "2021-01-25" },
};

function parseDate(s) {
  const parts = s.split("–").map(p => p.trim());
  const parseOne = (p, yearHint) => {
    const m = p.match(/(\d{4})\.\s*(\d{1,2})\.\s*(\d{1,2})/);
    if (m) return m[1] + "-" + m[2].padStart(2, "0") + "-" + m[3].padStart(2, "0");
    const m2 = p.match(/(\d{1,2})\.\s*(\d{1,2})/);
    if (m2 && yearHint) return yearHint + "-" + m2[1].padStart(2, "0") + "-" + m2[2].padStart(2, "0");
    return null;
  };
  const start = parseOne(parts[0]);
  const yearHint = start ? start.slice(0, 4) : null;
  const end = parts.length > 1 ? parseOne(parts[1], yearHint) : start;
  return { start, end };
}

function parseDuration(s) {
  if (!s) return { days: 1, leaveType: "annual" };
  s = s.replace("증명필요", "");
  if (s.includes("2시간")) return { days: 0.25, leaveType: "quarter_am" };
  if (s.includes("4시간")) return { days: 0.5, leaveType: "half_am" };
  const dm = s.match(/(\d+)일/);
  if (dm) return { days: parseInt(dm[1]), leaveType: "annual" };
  return { days: 1, leaveType: "annual" };
}

function mapLeaveType(xlsxType, parsedType) {
  if (xlsxType === "포상") return "reward";
  if (xlsxType === "군소집훈련") return "military";
  return parsedType;
}

function parseSheet(name) {
  const ws = wb.Sheets[name];
  if (!ws) return [];
  const raw = XLSX.utils.sheet_to_json(ws, { header: 1 });
  const records = [];
  let i = 0;
  while (i < raw.length) {
    const val = (raw[i] && raw[i][0] ? raw[i][0] : "").toString().trim();
    if (val !== "승인완료") { i++; continue; }
    const type = (raw[i + 1] && raw[i + 1][0] ? raw[i + 1][0] : "").toString().trim();
    const dateStr = (raw[i + 2] && raw[i + 2][0] ? raw[i + 2][0] : "").toString().trim();
    // Check if next row is another record or duration
    const nextVal = (raw[i + 3] && raw[i + 3][0] ? raw[i + 3][0] : "").toString().trim();
    if (nextVal === "승인완료" || i + 3 >= raw.length) {
      records.push({ type, dateStr, duration: "" });
      i += 3;
    } else {
      records.push({ type, dateStr, duration: nextVal });
      i += 4;
    }
  }
  return records;
}

async function main() {
  // 1. Clean up
  console.log("1. 기존 FLEX 이관 데이터 삭제...");
  await sb.from("leave_requests").delete().like("reason", "FLEX 이관%");
  await sb.from("leave_requests").delete().eq("reason", "연차");
  await sb.from("leave_requests").delete().eq("reason", "포상");
  await sb.from("leave_requests").delete().eq("reason", "군소집훈련");
  await sb.from("granted_leaves").delete().like("id", "flex-%");
  await sb.from("granted_leaves").delete().like("id", "carryover-%");
  console.log("   삭제 완료");

  // 2. Parse and insert
  const allInserts = [];
  for (const [name, emp] of Object.entries(EMP)) {
    const recs = parseSheet(name);
    console.log(`\n${name}: ${recs.length}건`);

    for (const r of recs) {
      const { start, end } = parseDate(r.dateStr);
      if (!start) { console.log(`  SKIP: ${r.dateStr}`); continue; }
      const { days, leaveType: parsedType } = parseDuration(r.duration);
      const leaveType = mapLeaveType(r.type, parsedType);

      // 포상/군소집은 연차에서 안 빠짐 → leave_type으로 구분
      allInserts.push({
        applicant_id: emp.id,
        applicant_name: name,
        applicant_department: emp.dept,
        leave_type: leaveType,
        start_date: start,
        end_date: end || start,
        days,
        reason: r.type,
        status: "승인_완료",
        auto_approved: true,
      });
      console.log(`  ${start}~${end || start} ${leaveType} ${days}일 (${r.type})`);
    }
  }

  console.log(`\n총 ${allInserts.length}건 삽입...`);
  const { data, error } = await sb.from("leave_requests").insert(allInserts).select("id, applicant_name, start_date, days, leave_type");
  if (error) {
    console.error("삽입 실패:", error.message);
    return;
  }
  console.log(`삽입 완료: ${data.length}건`);

  // 3. 김동균 이월 -5일
  await sb.from("granted_leaves").upsert({
    id: "carryover-kimdongyun-2025",
    user_id: EMP["김동균"].id,
    user_name: "김동균",
    year: 2026,
    days: -5,
    type: "carryover",
    reason: "입사일 연차 부여 시점 잔여 -5일 이월",
  }, { onConflict: "id" });
  console.log("\n김동균 이월 -5일 OK");

  // 4. 검증
  console.log("\n=== 최종 검증 ===");
  const annualTypes = ["annual", "half_am", "half_pm", "quarter_am", "quarter_pm", "hourly"];
  const { data: allLeaves } = await sb.from("leave_requests").select("applicant_id, days, leave_type, status")
    .in("status", ["승인_완료", "CANCEL_REQUESTED"]);
  const { data: allGrants } = await sb.from("granted_leaves").select("user_id, days");

  function getLegal(hire) {
    const hd = new Date(hire);
    const today = new Date("2026-04-13");
    const months = (today.getFullYear() - hd.getFullYear()) * 12 + (today.getMonth() - hd.getMonth());
    if (months < 12) return Math.min(months, 11);
    const years = Math.floor(months / 12);
    return Math.min(15 + Math.floor((years - 1) / 2), 25);
  }

  // 기대값: 엑셀 잔여
  // 김동균: 부여17 + 이월-5 = 12에서 시작, 연차18.5 사용 → 12 - 18.5 = -6.5
  // 하지만 엑셀 잔여는 -5.5. 포상(1.5일)은 연차에서 안 빠지니까: 12 - (18.5 - 포상2) = 12 - 16.5 = -4.5?
  // → 포상은 별도 유형이라 연차 차감 안 됨. 연차 사용만 카운트.

  for (const [name, emp] of Object.entries(EMP)) {
    const legal = getLegal(emp.hire);
    const adj = (allGrants || []).filter(g => g.user_id === emp.id).reduce((s, g) => s + Number(g.days), 0);
    const annualUsed = (allLeaves || []).filter(l => l.applicant_id === emp.id && annualTypes.includes(l.leave_type)).reduce((s, l) => s + Number(l.days), 0);
    const otherUsed = (allLeaves || []).filter(l => l.applicant_id === emp.id && !annualTypes.includes(l.leave_type)).reduce((s, l) => s + Number(l.days), 0);
    const remaining = legal + adj - annualUsed;
    console.log(`${name}: 법정=${legal} 이월=${adj} 연차사용=${annualUsed} 기타(포상/군사)=${otherUsed} 잔여=${remaining}`);
  }
}

main().catch(e => { console.error("오류:", e); process.exit(1); });
