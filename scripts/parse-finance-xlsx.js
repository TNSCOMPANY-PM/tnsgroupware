/**
 * (주)티앤에스컴퍼니 매출 통계 xlsx → finance/dashboard용 JSON
 * 시트 구조: 요약(현재 월 매출 등) = 라벨 행 + 바로 아래 값 행, 생존통장은 같은 라벨행 블록의 오른쪽 열.
 *
 * 사용: node scripts/parse-finance-xlsx.js "경로/파일.xlsx"
 * 출력: public/finance-current.json (+ data/finance-current.json)
 *
 * 통합 입출금 원장(ledgerEntries)은 기존과 동일하게 매출/매입 상세 블록에서 추출합니다.
 */
const fs = require("fs");
const path = require("path");
const XLSX = require("xlsx");

const filePath = process.argv[2];
if (!filePath) {
  console.error("Usage: node scripts/parse-finance-xlsx.js <path-to-xlsx>");
  process.exit(1);
}

function num(v) {
  if (v == null || v === "") return 0;
  if (typeof v === "number" && Number.isFinite(v)) return v;
  const s = String(v).replace(/,/g, "").replace(/\s/g, "").trim();
  if (!s) return 0;
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
}

function excelSerialToDateStr(serial) {
  if (serial == null || serial === "") return "";
  const n = Number(serial);
  if (!Number.isFinite(n)) return "";
  const d = new Date((n - 25569) * 86400 * 1000);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** 행에서 label 다음 칸의 숫자 (생존통장 이월·현재 등) */
function valueAfterLabel(row, label) {
  if (!row) return 0;
  for (let c = 0; c < row.length - 1; c++) {
    if (String(row[c]).trim() === label) return num(row[c + 1]);
  }
  return 0;
}

const wb = XLSX.readFile(filePath, { cellDates: false, cellNF: false, raw: true });
const firstSheetName = wb.SheetNames[0];
const sheet = wb.Sheets[firstSheetName];
const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" });

/** "현재 월 매출" 라벨이 있는 요약 라벨 행 (값은 바로 다음 행) */
let summaryLabelRow = -1;
for (let i = 0; i < Math.min(35, rows.length); i++) {
  const r = rows[i] || [];
  if (String(r[8]).trim() === "현재 월 매출" && String(r[9]).includes("현재 월 매입")) {
    summaryLabelRow = i;
    break;
  }
}

if (summaryLabelRow < 0) {
  for (let i = 0; i < Math.min(25, rows.length); i++) {
    const r = rows[i] || [];
    if (r.some((c) => String(c).includes("현재 월 매출"))) {
      const next = rows[i + 1] || [];
      if (num(next[8]) > 100000) {
        summaryLabelRow = i;
        break;
      }
    }
  }
}

if (summaryLabelRow < 0) {
  console.error("Could not find summary block (현재 월 매출). Check sheet layout.");
  process.exit(1);
}

const lab = rows[summaryLabelRow] || [];
const val = rows[summaryLabelRow + 1] || [];

const currentRevenue = num(val[8]);
const currentCost = num(val[9]);
const grossProfit = num(val[10]) || currentRevenue - currentCost;
const workDays = Math.max(0, Math.round(num(val[11])));
const passedWorkDays = Math.max(0, Math.round(num(val[12])));
const targetGrossProfit = num(lab[14]) || 50_000_000;
const remainingTarget = num(val[14]);

/** 달성율: 엑셀 계산값 우선 (보통 라벨행+2 의 "달성율" 열) */
const rateRow = rows[summaryLabelRow + 2] || [];
const workDayRateRow = rows[summaryLabelRow + 3] || [];
let achievementRate = targetGrossProfit > 0 ? grossProfit / targetGrossProfit : 0;
let workDayAchievementRate = 0;
for (let c = 0; c < rateRow.length - 1; c++) {
  if (String(rateRow[c]).includes("달성율") && !String(rateRow[c]).includes("영업일")) {
    const v = num(rateRow[c + 1]);
    if (v > 0 && v <= 1) achievementRate = v;
  }
}
for (let c = 0; c < workDayRateRow.length - 1; c++) {
  if (String(workDayRateRow[c]).includes("영업일 대비 달성율")) {
    const v = num(workDayRateRow[c + 1]);
    if (v > 0 && v <= 1) workDayAchievementRate = v;
  }
}
if (workDayAchievementRate === 0 && workDays > 0 && passedWorkDays > 0 && targetGrossProfit > 0) {
  workDayAchievementRate = grossProfit / ((targetGrossProfit / workDays) * passedWorkDays);
}

/** 생존 통장: 라벨행 = 이월, 값행 = 현재 잔고; 이후 행에 운영비·부가세·예상잔고·성과 */
const carryOverBalance = valueAfterLabel(lab, "이월 잔고");
const currentBalance = valueAfterLabel(val, "현재 잔고");

const survivalOpRow = rows[summaryLabelRow + 2] || [];
const survivalVatRow = rows[summaryLabelRow + 3] || [];
const survivalExpRow = rows[summaryLabelRow + 4] || [];
const survivalPerfRow = rows[summaryLabelRow + 5] || [];

const operatingDeduction = valueAfterLabel(survivalOpRow, "운영비 차감");
const vatOnGross = valueAfterLabel(survivalVatRow, "매총 부가세");
const expectedBalance = valueAfterLabel(survivalExpRow, "이번달 예상 잔고");
const monthlyPerformance = valueAfterLabel(survivalPerfRow, "이번달 성과");

// 매출 내역 헤더: NO + 날짜
let headerRowIdx = -1;
for (let i = 0; i < rows.length; i++) {
  const r = rows[i] || [];
  const col2 = String(r[2] || "").trim();
  const col3 = r[3];
  const isHeader = col2 === "NO" || (col3 && String(col3).includes("날짜"));
  if (isHeader) {
    headerRowIdx = i;
    break;
  }
}

let ledgerEntries = [];
if (headerRowIdx >= 0) {
  const now = new Date().toISOString();
  for (let i = headerRowIdx + 1; i < rows.length; i++) {
    const r = rows[i] || [];
    const salesNo = num(r[2]);
    const salesDateSerial = r[3];
    const salesClient = String(r[4] || "").trim();
    const salesTeam = String(r[5] || "").trim();
    const salesPayment = String(r[6] || "").trim();
    const salesAmount = num(r[8]) || num(r[7]);
    const purchaseDateSerial = r[10];
    const purchaseClient = String(r[11] || "").trim();
    const purchaseTeam = String(r[12] || "").trim();
    const purchaseAmount = num(r[16]) || num(r[15]);

    if (salesClient && salesAmount > 0) {
      ledgerEntries.push({
        id: `excel-sales-${i}`,
        date: excelSerialToDateStr(salesDateSerial) || excelSerialToDateStr(r[3]),
        amount: Math.round(salesAmount),
        senderName: salesClient,
        type: "DEPOSIT",
        bankName: salesPayment || "무통장",
        status: "PAID",
        classification: salesTeam || undefined,
        clientName: salesClient,
        createdAt: now,
      });
    }
    if (purchaseClient && purchaseAmount > 0) {
      ledgerEntries.push({
        id: `excel-purchase-${i}`,
        date: excelSerialToDateStr(purchaseDateSerial) || excelSerialToDateStr(r[10]),
        amount: Math.round(purchaseAmount),
        senderName: purchaseClient,
        type: "WITHDRAWAL",
        bankName: "무통장",
        status: "PAID",
        classification: purchaseTeam || undefined,
        clientName: purchaseClient,
        createdAt: now,
      });
    }
  }
  ledgerEntries.sort((a, b) => (b.date === a.date ? 0 : b.date > a.date ? 1 : -1));
}

const teamBlacklist = [
  "합계",
  "매출 내역",
  "매입 내역",
  "NO",
  "분류",
  "팀별",
  "",
];
/** 팀별 표: "분류" + 매출액 헤더 행 직후 ~ "전체 매출총익률" 직전만 (요약 블록의 "매출" 행 제외) */
let teamHeaderRow = -1;
const scanEnd = headerRowIdx >= 0 ? Math.min(headerRowIdx, summaryLabelRow + 40) : summaryLabelRow + 40;
for (let i = summaryLabelRow; i < scanEnd; i++) {
  const r = rows[i] || [];
  if (String(r[2]).trim() === "분류" && String(r[4]).includes("매출")) {
    teamHeaderRow = i;
    break;
  }
}
let teamSalesReport = [];
if (teamHeaderRow >= 0) {
  for (let i = teamHeaderRow + 1; i < scanEnd; i++) {
    const r = rows[i] || [];
    const team = String(r[2] || "").trim();
    if (!team) continue;
    if (team.includes("전체 매출총익률") || team.includes("전체 환불율")) break;
    if (teamBlacklist.some((b) => b && team === b)) continue;
    if (["매출", "매입", "환불"].some((k) => team === k || team.startsWith(`${k} `))) continue;
    const revenue = num(r[4]);
    const cost = num(r[5]);
    const gp = num(r[6]) || revenue - cost;
    if (revenue === 0 && cost === 0 && gp === 0) continue;
    const marginRatePct = revenue > 0 ? (gp / revenue) * 100 : 0;
    teamSalesReport.push({
      team,
      revenue,
      cost,
      grossProfit: gp,
      marginRatePct: Math.round(marginRatePct * 100) / 100,
    });
  }
}

let receivablesExpected = [];
let payablesExpected = [];
for (let i = summaryLabelRow; i < scanEnd; i++) {
  const r = rows[i] || [];
  const category = String(r[8] || "").trim();
  const item = String(r[9] || "").trim();
  const rawSupply = num(r[10]);
  if (category === "미수금" && item) {
    const supplyAmount = Math.abs(rawSupply);
    const vat = supplyAmount * 0.1;
    receivablesExpected.push({
      id: `er-excel-${i}`,
      category: "미수금",
      item,
      supplyAmount,
      vat,
      memo: "",
    });
  } else if (category === "미지급금" && item) {
    const supplyAmount = Math.abs(rawSupply);
    const vat = supplyAmount * 0.1;
    payablesExpected.push({
      id: `ep-excel-${i}`,
      category: "미지급금",
      item,
      supplyAmount,
      vat,
      memo: item === "CPC" ? "CPC" : "",
    });
  }
}

/** 매출·매입 상세 "합계" 행: 거래금액·공급가액 합 (엑셀과 동일) */
let salesTotalSum = 0;
let salesSupplySum = 0;
let purchaseTotalSum = 0;
let purchaseSupplySum = 0;
for (let i = summaryLabelRow; i < (headerRowIdx >= 0 ? headerRowIdx : rows.length); i++) {
  const r = rows[i] || [];
  if (String(r[2]).trim() === "합계" && num(r[8]) > 0) {
    salesTotalSum = num(r[8]);
    salesSupplySum = num(r[9]);
    /* 매입 쪽: col16 거래금액 합, col17 공급가액 합 */
    purchaseTotalSum = num(r[16]);
    purchaseSupplySum = num(r[17]);
    break;
  }
}
if (salesSupplySum === 0) salesSupplySum = currentRevenue;
if (salesTotalSum === 0) salesTotalSum = currentRevenue * 1.1;
if (purchaseSupplySum === 0) purchaseSupplySum = currentCost;
if (purchaseTotalSum === 0) purchaseTotalSum = currentCost * 1.1;

const salesVat = salesTotalSum - salesSupplySum;
const purchaseVat = purchaseTotalSum - purchaseSupplySum;
const grossSupply = salesSupplySum - purchaseSupplySum;
const grossTotal = salesTotalSum - purchaseTotalSum;
const grossVat = grossTotal - grossSupply;

const currentStatus = {
  salesSupply: salesSupplySum,
  salesVat,
  salesTotal: salesTotalSum,
  purchaseSupply: purchaseSupplySum,
  purchaseVat,
  purchaseTotal: purchaseTotalSum,
  grossSupply,
  grossVat,
  grossTotal,
  survivalBalance: currentBalance,
};

let overallRefundRatePct = 0;
for (let i = summaryLabelRow; i < scanEnd; i++) {
  const r = rows[i] || [];
  if (String(r[2]).includes("전체 환불율")) {
    overallRefundRatePct = Math.round(num(r[6]) * 10000) / 100;
    break;
  }
}

const totalTeamRevenue = teamSalesReport.reduce((s, x) => s + x.revenue, 0);
let teamTargetGp = [];
if (totalTeamRevenue > 0 && targetGrossProfit > 0) {
  teamTargetGp = teamSalesReport.map((t) => {
    const target = Math.round((targetGrossProfit * t.revenue) / totalTeamRevenue);
    const excessAchievement = t.grossProfit - target;
    return {
      team: t.team,
      target,
      grossProfit: t.grossProfit,
      excessAchievement,
      achieved: t.grossProfit >= target,
    };
  });
}

const out = {
  sheetLabel: firstSheetName,
  ledgerEntries,
  monthSummary: {
    label: firstSheetName,
    currentRevenue,
    currentCost,
    grossProfit,
    workDays,
    passedWorkDays,
    targetGrossProfit,
    remainingTarget,
    achievementRate,
    workDayAchievementRate,
  },
  survivalAccount: {
    carryOverBalance,
    currentBalance,
    operatingDeduction,
    vatOnGross,
    expectedBalance,
    monthlyPerformance,
  },
  dashboard: {
    monthlyRevenue: salesTotalSum,
    monthlyGrossProfit: grossProfit,
    survivalBalance: expectedBalance,
  },
  currentStatus,
  teamSalesReport,
  receivablesExpected,
  payablesExpected,
  teamTargetGp,
  overallRefundRatePct,
};

const root = path.join(__dirname, "..");
const publicDir = path.join(root, "public");
const dataDir = path.join(root, "data");
if (!fs.existsSync(publicDir)) fs.mkdirSync(publicDir, { recursive: true });
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

const publicPath = path.join(publicDir, "finance-current.json");
const dataPath = path.join(dataDir, "finance-current.json");
const json = JSON.stringify(out, null, 2);
fs.writeFileSync(publicPath, json, "utf8");
fs.writeFileSync(dataPath, json, "utf8");
console.log("Written:", publicPath, "&", dataPath);
console.log("monthSummary.grossProfit", out.monthSummary.grossProfit, "survival.currentBalance", out.survivalAccount.currentBalance);
