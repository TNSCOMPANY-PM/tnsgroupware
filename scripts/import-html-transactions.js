/**
 * 26년 1~2월 HTML 스프레드시트 데이터를 Supabase finance 테이블에 삽입
 * 실행: node scripts/import-html-transactions.js
 */

const fs = require("fs");
const path = require("path");
const https = require("https");

const SUPABASE_URL = "https://REDACTED_PROJECT_REF.supabase.co";
const SUPABASE_ANON_KEY =
  "REDACTED_ANON_KEY";

const data = JSON.parse(
  fs.readFileSync(path.join(__dirname, "../transactions_2026.json"), "utf8")
);

/** DEPOSIT description에서 팀 카테고리 추출 */
function extractCategory(description, type) {
  if (type === "DEPOSIT") {
    const m = description.match(/\(([^)]+)\)$/);
    return m ? m[1].trim() : null;
  }
  // WITHDRAWAL: 설명 기반 분류
  const desc = description.toLowerCase();
  if (
    desc.includes("홈페이지") ||
    desc.includes("티제이웹") ||
    desc.includes("웹사이트") ||
    desc.includes("웹 사이트")
  ) {
    return "티제이웹";
  }
  return "더널리"; // 슬롯/플레이스/쿠팡 관련 대부분 더널리 원가
}

/** DEPOSIT description에서 업체명 추출 (괄호 앞) */
function extractClientName(description) {
  const m = description.match(/^(.+?)\s*\(/);
  return m ? m[1].trim() : description.trim();
}

/** 결정적 UUID 생성 (문자열 해시 기반, UUID v4 포맷) */
function makeId(date, type, amount, description) {
  const raw = `html|${date}|${type}|${amount}|${description}`;
  // 32자리 hex 생성
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
  const a = (h3 >>> 0).toString(16).padStart(8, "0");
  const b = (h4 >>> 0).toString(16).padStart(8, "0");
  const c2 = (h5 >>> 0).toString(16).padStart(8, "0");
  const d2 = (h6 >>> 0).toString(16).padStart(8, "0");
  // UUID 형식: xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx
  return `${a}-${b.slice(0,4)}-4${b.slice(5,8)}-${c2.slice(0,4)}-${c2.slice(4)}${d2.slice(0,8)}`;
}

/** JSON → finance 행 변환 */
function toFinanceRow(r, month) {
  const finType = r.type === "DEPOSIT" ? "매출" : "매입";
  const category = extractCategory(r.description, r.type);
  const clientName =
    r.type === "DEPOSIT"
      ? extractClientName(r.description)
      : r.description.split(" - ")[0]?.trim() ?? r.description;

  return {
    id: makeId(r.date, r.type, r.amount, r.description),
    month,
    date: r.date,
    type: finType,
    amount: r.amount,
    category,
    description: r.description,
    client_name: clientName,
    status: "completed",
  };
}

/** Supabase REST upsert */
function upsert(rows) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify(rows);
    const url = new URL(`${SUPABASE_URL}/rest/v1/finance`);

    const req = https.request(
      {
        hostname: url.hostname,
        path: url.pathname + "?on_conflict=id",
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(body),
          apikey: SUPABASE_ANON_KEY,
          Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
          Prefer: "resolution=ignore-duplicates,return=minimal",
        },
      },
      (res) => {
        let data = "";
        res.on("data", (chunk) => (data += chunk));
        res.on("end", () => {
          if (res.statusCode >= 200 && res.statusCode < 300) {
            resolve({ status: res.statusCode });
          } else {
            reject(new Error(`HTTP ${res.statusCode}: ${data}`));
          }
        });
      }
    );
    req.on("error", reject);
    req.write(body);
    req.end();
  });
}

async function main() {
  const months = Object.keys(data);
  let totalInserted = 0;

  for (const month of months) {
    const rows = data[month].map((r) => toFinanceRow(r, month));
    console.log(`\n[${month}] ${rows.length}건 upsert 중...`);

    // 100건씩 배치 처리
    const BATCH = 100;
    for (let i = 0; i < rows.length; i += BATCH) {
      const batch = rows.slice(i, i + BATCH);
      await upsert(batch);
      process.stdout.write(`  ${Math.min(i + BATCH, rows.length)}/${rows.length}\r`);
    }

    console.log(`  ✓ ${rows.length}건 완료`);
    totalInserted += rows.length;
  }

  console.log(`\n전체 ${totalInserted}건 삽입 완료.`);
}

main().catch((e) => {
  console.error("오류:", e.message);
  process.exit(1);
});
