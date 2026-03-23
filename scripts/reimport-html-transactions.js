/**
 * 잘못된 HTML import 데이터 삭제 후 정정 데이터 재삽입
 * node scripts/reimport-html-transactions.js
 */
const fs = require("fs");
const path = require("path");
const https = require("https");

const KEY = "REDACTED_ANON_KEY";
const HOST = "REDACTED_PROJECT_REF.supabase.co";

// ── makeId: import 스크립트와 동일한 함수 ──────────────────────────
function makeId(date, type, amount, description) {
  const raw = `html|${date}|${type}|${amount}|${description}`;
  let h1 = 0x9e3779b9, h2 = 0x6c62272e;
  for (let i = 0; i < raw.length; i++) {
    const c = raw.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 0x517cc1b727220a95 & 0xffffffff);
    h2 = Math.imul(h2 ^ c, 0xb492b66fbe98f273 & 0xffffffff);
    h1 = ((h1 << 5) | (h1 >>> 27)) ^ h2;
    h2 = ((h2 << 13) | (h2 >>> 19)) ^ h1;
  }
  const h3 = Math.imul(h1 ^ (h1 >>> 16), 0x45d9f3b);
  const h4 = Math.imul(h2 ^ (h2 >>> 16), 0x45d9f3b);
  const h5 = Math.imul(h3 ^ (h3 >>> 13), raw.length * 0x1234567);
  const h6 = Math.imul(h4 ^ (h4 >>> 13), raw.length * 0x7654321);
  const a  = (h3 >>> 0).toString(16).padStart(8, "0");
  const b  = (h4 >>> 0).toString(16).padStart(8, "0");
  const c2 = (h5 >>> 0).toString(16).padStart(8, "0");
  const d2 = (h6 >>> 0).toString(16).padStart(8, "0");
  return `${a}-${b.slice(0,4)}-4${b.slice(5,8)}-${c2.slice(0,4)}-${c2.slice(4)}${d2.slice(0,8)}`;
}

function extractCategory(description, type) {
  if (type === "DEPOSIT") {
    const m = description.match(/\(([^)]+)\)$/);
    return m ? m[1].trim() : null;
  }
  const desc = description.toLowerCase();
  if (desc.includes("홈페이지") || desc.includes("티제이웹") || desc.includes("웹사이트")) return "티제이웹";
  return "더널리";
}
function extractClientName(description) {
  const m = description.match(/^(.+?)\s*\(/);
  return m ? m[1].trim() : description.trim();
}

function toFinanceRow(r, month) {
  return {
    id:          makeId(r.date, r.type, r.amount, r.description),
    month,
    date:        r.date,
    type:        r.type === "DEPOSIT" ? "매출" : "매입",
    amount:      r.amount,
    category:    r.category ?? extractCategory(r.description, r.type),
    description: r.description,
    client_name: r.type === "DEPOSIT"
      ? extractClientName(r.description)
      : (r.description.split(" - ")[0]?.trim() ?? r.description),
    status:      "completed",
  };
}

function request(method, pathStr, body) {
  return new Promise((resolve, reject) => {
    const payload = body ? JSON.stringify(body) : null;
    const req = https.request({
      hostname: HOST,
      path: pathStr,
      method,
      headers: {
        "Content-Type": "application/json",
        ...(payload ? { "Content-Length": Buffer.byteLength(payload) } : {}),
        apikey: KEY,
        Authorization: `Bearer ${KEY}`,
        Prefer: "resolution=ignore-duplicates,return=minimal",
      },
    }, res => {
      let d = ""; res.on("data", c => d += c);
      res.on("end", () => {
        if (res.statusCode >= 400) reject(new Error(`HTTP ${res.statusCode}: ${d.slice(0,200)}`));
        else resolve(res.statusCode);
      });
    });
    req.on("error", reject);
    if (payload) req.write(payload);
    req.end();
  });
}

async function deleteByIds(ids) {
  // Supabase REST: id=in.(uuid1,uuid2,...)
  const BATCH = 50;
  for (let i = 0; i < ids.length; i += BATCH) {
    const chunk = ids.slice(i, i + BATCH);
    const inClause = chunk.map(id => id).join(",");
    await request("DELETE", `/rest/v1/finance?id=in.(${inClause})`);
    process.stdout.write(`  삭제 ${Math.min(i + BATCH, ids.length)}/${ids.length}\r`);
  }
}

async function upsert(rows) {
  const BATCH = 100;
  for (let i = 0; i < rows.length; i += BATCH) {
    await request("POST", "/rest/v1/finance?on_conflict=id", rows.slice(i, i + BATCH));
    process.stdout.write(`  삽입 ${Math.min(i + BATCH, rows.length)}/${rows.length}\r`);
  }
}

async function main() {
  const corrected = JSON.parse(
    fs.readFileSync(path.join(__dirname, "../transactions_2026_v2.json"), "utf8")
  );

  // 이전 잘못 삽입된 6개 항목 (중복 오입금) - 삭제 대상에 추가
  const removedItems = [
    { date:"2026-01-08", type:"DEPOSIT",    amount:347600,  description:"오리진사이트" },
    { date:"2026-01-08", type:"WITHDRAWAL", amount:347600,  description:"오리진사이트 (오입금)" },
    { date:"2026-01-26", type:"DEPOSIT",    amount:2000000, description:"모두샵" },
    { date:"2026-01-26", type:"WITHDRAWAL", amount:2000000, description:"모두샵 (오입금 환불)" },
    { date:"2026-01-27", type:"DEPOSIT",    amount:22000,   description:"연수허브단기보호센터" },
    { date:"2026-01-27", type:"WITHDRAWAL", amount:22000,   description:"연수허브단기보호센터" },
  ];

  // 삭제할 ID = 현재 정정본 전체 + 이전에 잘못 들어간 6개
  const allMonths = Object.keys(corrected);
  const allRows = allMonths.flatMap(month => corrected[month].map(r => ({ ...r, month })));
  const deleteIds = [
    ...allRows.map(r => makeId(r.date, r.type, r.amount, r.description)),
    ...removedItems.map(r => makeId(r.date, r.type, r.amount, r.description)),
  ];

  console.log(`\n기존 데이터 삭제 중 (${deleteIds.length}개 ID)...`);
  await deleteByIds(deleteIds);
  console.log("\n삭제 완료");

  // 정정 데이터 재삽입
  for (const month of allMonths) {
    const rows = corrected[month].map(r => toFinanceRow(r, month));
    console.log(`\n[${month}] ${rows.length}건 삽입 중...`);
    await upsert(rows);
    console.log(`  ✓ 완료`);
  }

  // 최종 합계 검증
  console.log("\n── 최종 검증 ──");
  for (const month of allMonths) {
    const rows = corrected[month];
    const dep = rows.filter(r=>r.type==="DEPOSIT").reduce((s,r)=>s+r.amount,0);
    const wit = rows.filter(r=>r.type==="WITHDRAWAL").reduce((s,r)=>s+r.amount,0);
    console.log(`${month} | 매출 ${dep.toLocaleString()}원 | 매입 ${wit.toLocaleString()}원`);
  }
  console.log("\n완료");
}

main().catch(e => { console.error("\n오류:", e.message); process.exit(1); });
