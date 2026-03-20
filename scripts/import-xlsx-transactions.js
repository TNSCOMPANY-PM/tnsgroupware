/**
 * (주)티앤에스컴퍼니 매출 통계 xlsx → Supabase finance 테이블 삽입
 * node scripts/import-xlsx-transactions.js
 */
const XLSX = require("xlsx");
const https = require("https");
const path = require("path");

const XLSX_PATH = path.join(__dirname, "../(주)티앤에스컴퍼니 매출 통계 24.01~ (4).xlsx");
const KEY  = "REDACTED_ANON_KEY";
const HOST = "REDACTED_PROJECT_REF.supabase.co";

const SHEET_TO_MONTH = {
  "26년 1월": "2026-01",
  "26년 2월": "2026-02",
  "26년 3월": "2026-03",
};

// Excel 시리얼 → YYYY-MM-DD
function serialToDate(v) {
  if (!v && v !== 0) return null;
  if (typeof v === "number" && v > 40000) {
    const d = XLSX.SSF.parse_date_code(v);
    if (d) return `${d.y}-${String(d.m).padStart(2,"0")}-${String(d.d).padStart(2,"0")}`;
  }
  return null;
}

function num(v) {
  if (!v && v !== 0) return 0;
  const n = Number(String(v).replace(/,/g,"").trim());
  return isFinite(n) ? Math.round(n) : 0;
}

function cell(ws, r, c) {
  const cv = ws[XLSX.utils.encode_cell({r, c})];
  return cv ? cv.v ?? null : null;
}

// 결정적 UUID 생성
function makeId(date, type, amount, description) {
  const raw = `xlsx|${date}|${type}|${amount}|${description}`;
  let h1 = 0x9e3779b9, h2 = 0x6c62272e;
  for (let i = 0; i < raw.length; i++) {
    const c = raw.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 0x517cc1b7);
    h2 = Math.imul(h2 ^ c, 0xb492b66f);
    h1 = ((h1 << 5) | (h1 >>> 27)) ^ h2;
    h2 = ((h2 << 13) | (h2 >>> 19)) ^ h1;
  }
  const h3 = Math.imul(h1 ^ (h1 >>> 16), 0x45d9f3b);
  const h4 = Math.imul(h2 ^ (h2 >>> 16), 0x45d9f3b);
  const h5 = Math.imul(h3 ^ (h3 >>> 13), (raw.length * 0x1234567) | 0);
  const h6 = Math.imul(h4 ^ (h4 >>> 13), (raw.length * 0x7654321) | 0);
  const a  = (h3 >>> 0).toString(16).padStart(8,"0");
  const b  = (h4 >>> 0).toString(16).padStart(8,"0");
  const c2 = (h5 >>> 0).toString(16).padStart(8,"0");
  const d2 = (h6 >>> 0).toString(16).padStart(8,"0");
  return `${a}-${b.slice(0,4)}-4${b.slice(5,8)}-${c2.slice(0,4)}-${c2.slice(4)}${d2.slice(0,8)}`;
}

function parseSheet(ws, month) {
  const rows = [];

  // 합계 행 위치 탐색 (헤더 "NO"가 있는 행 = 데이터 시작 -1)
  let dataStart = -1;
  let expectedDepSum = 0, expectedWitSum = 0;

  for (let r = 15; r <= 30; r++) {
    const v = cell(ws, r, 2);
    if (v === "합계") {
      expectedDepSum = Math.round(num(cell(ws, r, 8)));
      expectedWitSum = Math.round(num(cell(ws, r, 16)));
    }
    if (v === "NO") {
      dataStart = r + 1;
      break;
    }
  }
  if (dataStart < 0) { console.error("헤더 행을 찾지 못했습니다:", month); return rows; }

  // 컬럼 인덱스 (0-based):
  // 매출: C=2(NO) D=3(날짜) E=4(업체명) F=5(팀) G=6(결제방식) H=7(내용) I=8(거래금액) J=9(공급가액)
  // 매입: K=10(날짜) L=11(업체명) M=12(팀) N=13(환불/매입) O=14(입금방식) P=15(내용) Q=16(거래금액) R=17(공급가액)

  let actualDepSum = 0, actualWitSum = 0;

  for (let r = dataStart; r < dataStart + 2000; r++) {
    const depDate = serialToDate(cell(ws, r, 3));
    const depAmt  = num(cell(ws, r, 8));
    const witDate = serialToDate(cell(ws, r, 10));
    const witAmt  = num(cell(ws, r, 16));

    // 매출 행
    if (depDate && depAmt !== 0) {
      const name    = String(cell(ws, r, 4) ?? "").trim();
      const team    = String(cell(ws, r, 5) ?? "").trim();
      const content = String(cell(ws, r, 7) ?? "").trim();
      const desc    = content ? `${name} - ${content}` : name;
      rows.push({
        id:          makeId(depDate, "매출", depAmt, desc),
        month,
        date:        depDate,
        type:        "매출",
        amount:      depAmt,
        category:    team || null,
        description: desc,
        client_name: name,
        status:      "completed",
      });
      actualDepSum += depAmt;
    }

    // 매입/환불 행
    if (witDate && witAmt !== 0) {
      const name    = String(cell(ws, r, 11) ?? "").trim();
      const team    = String(cell(ws, r, 12) ?? "").trim();
      const subtype = String(cell(ws, r, 13) ?? "").trim(); // 매입 or 환불
      const content = String(cell(ws, r, 15) ?? "").trim();
      const desc    = content ? `${name} - ${content}` : name;
      rows.push({
        id:          makeId(witDate, "매입", witAmt, desc),
        month,
        date:        witDate,
        type:        "매입",
        amount:      witAmt,
        category:    team || null,
        description: desc,
        client_name: name,
        status:      "completed",
      });
      actualWitSum += witAmt;
    }

    // 양쪽 다 비어있으면 종료
    if (!depDate && !witDate && !cell(ws, r, 2) && !cell(ws, r, 10)) {
      // 연속 5행 빈 경우만 종료
      let blank = 0;
      for (let rr = r; rr < r + 5; rr++) {
        if (!cell(ws, rr, 3) && !cell(ws, rr, 10)) blank++;
      }
      if (blank >= 5) break;
    }
  }

  console.log(`\n[${month}] 매출 ${rows.filter(r=>r.type==="매출").length}건 / 매입 ${rows.filter(r=>r.type==="매입").length}건`);
  console.log(`  매출합계: ${actualDepSum.toLocaleString()}원 (시트: ${expectedDepSum.toLocaleString()}) ${actualDepSum === expectedDepSum ? "✓" : "✗ 불일치"}`);
  console.log(`  매입합계: ${actualWitSum.toLocaleString()}원 (시트: ${expectedWitSum.toLocaleString()}) ${actualWitSum === expectedWitSum ? "✓" : "✗ 불일치"}`);

  return rows;
}

function request(method, p, body) {
  return new Promise((resolve, reject) => {
    const payload = body ? JSON.stringify(body) : null;
    const req = https.request({
      hostname: HOST, path: p, method,
      headers: {
        "Content-Type": "application/json",
        ...(payload ? {"Content-Length": Buffer.byteLength(payload)} : {}),
        apikey: KEY, Authorization: `Bearer ${KEY}`,
        Prefer: "resolution=ignore-duplicates,return=minimal",
      },
    }, res => {
      let d = ""; res.on("data", c => d += c);
      res.on("end", () => res.statusCode >= 400 ? reject(new Error(`HTTP ${res.statusCode}: ${d.slice(0,300)}`)) : resolve(res.statusCode));
    });
    req.on("error", reject);
    if (payload) req.write(payload);
    req.end();
  });
}

async function deleteByIds(ids) {
  const BATCH = 50;
  for (let i = 0; i < ids.length; i += BATCH) {
    const chunk = ids.slice(i, i + BATCH).join(",");
    await request("DELETE", `/rest/v1/finance?id=in.(${chunk})`);
    process.stdout.write(`  삭제 ${Math.min(i+BATCH, ids.length)}/${ids.length}\r`);
  }
}

async function upsertRows(rows) {
  const BATCH = 100;
  for (let i = 0; i < rows.length; i += BATCH) {
    await request("POST", "/rest/v1/finance?on_conflict=id", rows.slice(i, i + BATCH));
    process.stdout.write(`  삽입 ${Math.min(i+BATCH, rows.length)}/${rows.length}\r`);
  }
}

async function main() {
  const wb = XLSX.readFile(XLSX_PATH);
  const allRows = [];

  for (const [sheetName, month] of Object.entries(SHEET_TO_MONTH)) {
    const ws = wb.Sheets[sheetName];
    if (!ws) { console.warn(`시트 없음: ${sheetName}`); continue; }
    const rows = parseSheet(ws, month);
    allRows.push(...rows);
  }

  // 기존 xlsx import 데이터 삭제 후 재삽입
  const ids = allRows.map(r => r.id);
  if (ids.length > 0) {
    console.log(`\n기존 데이터 삭제 중 (${ids.length}개)...`);
    await deleteByIds(ids);
    console.log("\n삽입 중...");
    await upsertRows(allRows);
    console.log(`\n✓ 총 ${allRows.length}건 완료`);
  }
}

main().catch(e => { console.error("오류:", e.message); process.exit(1); });
