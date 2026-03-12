/**
 * (주)티앤에스컴퍼니 매출 통계 엑셀 파싱
 * 사용: node scripts/parse-finance-excel.js "경로/파일.xlsx"
 * 출력: JSON ( constants/financeData.json 으로 저장 가능 )
 */

const XLSX = require("xlsx");
const path = require("path");
const fs = require("fs");

const filePath =
  process.argv[2] ||
  path.join(process.env.USERPROFILE, "Downloads", "(주)티앤에스컴퍼니 매출 통계 24.01~ (1).xlsx");

if (!fs.existsSync(filePath)) {
  console.error("파일을 찾을 수 없습니다:", filePath);
  process.exit(1);
}

const wb = XLSX.readFile(filePath);
const firstSheet = wb.SheetNames[0];
const rows = XLSX.utils.sheet_to_json(wb.Sheets[firstSheet], {
  header: 1,
  defval: "",
});

// 헤더/레이블 패턴으로 값 추출 (행 인덱스 0-based)
function findValue(rows, labelPattern) {
  for (let r = 0; r < rows.length; r++) {
    const row = Array.isArray(rows[r]) ? rows[r] : [];
    for (let c = 0; c < row.length; c++) {
      const cell = String(row[c] || "").trim();
      if (labelPattern(cell)) {
        return { row: r, col: c, value: row[c + 1] ?? row[c + 2], rowData: row };
      }
    }
  }
  return null;
}

function toNum(v) {
  if (typeof v === "number" && !isNaN(v)) return v;
  const n = parseFloat(String(v).replace(/[^0-9.-]/g, ""));
  return isNaN(n) ? 0 : n;
}

const result = {
  sheetName: firstSheet,
  monthSummary: {
    label: firstSheet,
    currentRevenue: 0,
    currentCost: 0,
    grossProfit: 0,
    workDays: 0,
    passedWorkDays: 0,
    targetGrossProfit: 50_000_000,
    remainingTarget: 0,
    achievementRate: 0,
    workDayAchievementRate: 0,
  },
  survivalAccount: {
    carryOverBalance: 0,
    currentBalance: 0,
    operatingDeduction: 0,
    vatOnGross: 0,
    expectedBalance: 0,
    monthlyPerformance: 0,
  },
  teamSummary: [],
};

// 현재 월 매출 (열 H 근처)
const curRevenue = findValue(rows, (c) =>
  /현재\s*월\s*매출/i.test(c)
);
if (curRevenue && curRevenue.rowData) {
  const d = curRevenue.rowData;
  result.monthSummary.currentRevenue = toNum(d[8] ?? d[7]);
}
const curCost = findValue(rows, (c) =>
  /현재\s*월\s*매입/i.test(c)
);
if (curCost && curCost.rowData) {
  const d = curCost.rowData;
  result.monthSummary.currentCost = toNum(d[9] ?? d[8]);
}
const curGross = findValue(rows, (c) =>
  /현재\s*매출총이익/i.test(c)
);
if (curGross && curGross.rowData) {
  const d = curGross.rowData;
  result.monthSummary.grossProfit = toNum(d[10] ?? d[9]);
}

// 영업일
const workDays = findValue(rows, (c) => /해당월\s*영업일/i.test(c));
if (workDays && workDays.rowData) {
  const d = workDays.rowData;
  result.monthSummary.workDays = toNum(d[11] ?? d[10]);
}
const passedDays = findValue(rows, (c) => /지난\s*영업일/i.test(c));
if (passedDays && passedDays.rowData) {
  const d = passedDays.rowData;
  result.monthSummary.passedWorkDays = toNum(d[12] ?? d[11]);
}

// 목표
const target = findValue(rows, (c) => /목표\s*매출\s*총이익/i.test(c));
if (target && target.rowData) {
  const d = target.rowData;
  result.monthSummary.targetGrossProfit = toNum(d[13] ?? d[12]);
}
const remaining = findValue(rows, (c) =>
  /남은\s*목표\s*매출/i.test(c)
);
if (remaining && remaining.rowData) {
  const d = remaining.rowData;
  result.monthSummary.remainingTarget = toNum(d[14] ?? d[13]);
}
const achieve = findValue(rows, (c) => /^달성율$/i.test(c));
if (achieve && achieve.rowData) {
  const d = achieve.rowData;
  result.monthSummary.achievementRate = toNum(d[15] ?? d[14]);
}

// 생존 통장
const carryOver = findValue(rows, (c) => /이월\s*잔고/i.test(c));
if (carryOver && carryOver.rowData) {
  result.survivalAccount.carryOverBalance = toNum(carryOver.rowData[19] ?? carryOver.rowData[18]);
}
const currentBal = findValue(rows, (c) => /현재\s*잔고/i.test(c));
if (currentBal && currentBal.rowData) {
  result.survivalAccount.currentBalance = toNum(currentBal.rowData[19] ?? currentBal.rowData[18]);
}
const operating = findValue(rows, (c) => /운영비\s*차감/i.test(c));
if (operating && operating.rowData) {
  result.survivalAccount.operatingDeduction = toNum(operating.rowData[19] ?? operating.rowData[18]);
}
const vat = findValue(rows, (c) => /매총\s*부가세/i.test(c));
if (vat && vat.rowData) {
  result.survivalAccount.vatOnGross = toNum(vat.rowData[19] ?? vat.rowData[18]);
}
const expected = findValue(rows, (c) => /이번달\s*예상\s*잔고/i.test(c));
if (expected && expected.rowData) {
  result.survivalAccount.expectedBalance = toNum(expected.rowData[19] ?? expected.rowData[18]);
}
const perf = findValue(rows, (c) => /이번달\s*성과/i.test(c));
if (perf && perf.rowData) {
  result.survivalAccount.monthlyPerformance = toNum(perf.rowData[19] ?? perf.rowData[18]);
}

// 팀별 (티제이웹, 더널리)
for (const teamName of ["티제이웹", "더널리"]) {
  const teamRow = findValue(rows, (c) => c === teamName);
  if (teamRow && teamRow.rowData) {
    const d = teamRow.rowData;
    result.teamSummary.push({
      team: teamName,
      revenue: toNum(d[4]),
      cost: toNum(d[5]),
      grossProfit: toNum(d[6]),
    });
  }
}

console.log(JSON.stringify(result, null, 2));
