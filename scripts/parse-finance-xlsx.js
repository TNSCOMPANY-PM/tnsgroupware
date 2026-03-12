/**
 * (주)티앤에스컴퍼니 매출 통계 xlsx 파싱 → finance/dashboard용 JSON
 * 사용: node scripts/parse-finance-xlsx.js "경로/파일.xlsx"
 * 출력: 프로젝트 data/finance-current.json 에 저장
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
  const n = Number(v);
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

const wb = XLSX.readFile(filePath, { cellDates: false, cellNF: false });
const firstSheetName = wb.SheetNames[0];
const sheet = wb.Sheets[firstSheetName];
const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" });

// 라벨 "현재 월 매출" 포함 행 찾기
let labelRow = 8;
let valueRow = 9;
for (let i = 0; i < Math.min(20, rows.length); i++) {
  const row = rows[i] || [];
  const nextRow = rows[i + 1] || [];
  const hasLabel = row.some((c) => String(c).includes("현재 월 매출"));
  const hasNum = nextRow.some((c) => typeof c === "number" && c > 100000);
  if (hasLabel && hasNum) {
    labelRow = i;
    valueRow = i + 1;
    break;
  }
}
const r8 = rows[labelRow] || [];
const r9 = rows[valueRow] || [];
const r10 = rows[valueRow + 1] || [];
const r11 = rows[valueRow + 2] || [];
const r12 = rows[valueRow + 3] || [];
const r13 = rows[valueRow + 4] || [];

const currentRevenue = num(r9[8]) || num(r8[5]);
const currentCost = num(r9[9]) || num(r9[5]);
const grossProfit = num(r9[10]) || (currentRevenue - currentCost);
const workDays = Math.max(0, Math.round(num(r9[11])));
const passedWorkDays = Math.max(0, Math.round(num(r9[12])));
const targetGrossProfit = num(r8[15]) || 50000000;
const remainingTarget = num(r9[14]);
const carryOverBalance = num(r8[19]) || num(r9[19]);
const currentBalance = num(r9[18]) || num(r9[19]);
const operatingDeduction = num(r10[18]) || num(r10[19]);
const vatOnGross = num(r11[18]) || num(r11[19]);
const expectedBalance = num(r12[18]) || num(r12[19]);
const monthlyPerformance = num(r13[18]) || num(r13[19]);

const achievementRate = targetGrossProfit > 0 ? grossProfit / targetGrossProfit : 0;
const workDayAchievementRate = workDays > 0 && passedWorkDays > 0 ? grossProfit / (targetGrossProfit / workDays * passedWorkDays) : 0;

// 매출 내역: 헤더 "NO","날짜","업체명","팀",... (row 27), 데이터 row 28~
// 매입 내역: 같은 행 오른쪽 "날짜","업체명","팀","환불/매입",...
let ledgerEntries = [];
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

// 팀별 매출: valueRow ~ headerRowIdx 사이에서 col 2가 팀명(티제이웹, 더널리 등), col 4=매출 col 5=매입 col 6=매총
const teamBlacklist = ["전체 매출총이익률", "전체 환불율", "합계", "매출 내역", "매입 내역", "NO", "분류"];
let teamSalesReport = [];
const scanEnd = headerRowIdx >= 0 ? Math.min(headerRowIdx, valueRow + 25) : valueRow + 25;
for (let i = valueRow; i < scanEnd; i++) {
  const r = rows[i] || [];
  const team = String(r[2] || "").trim();
  if (!team || teamBlacklist.some((b) => team.includes(b))) continue;
  const revenue = num(r[4]);
  const cost = num(r[5]);
  const grossProfit = num(r[6]) || (revenue - cost);
  if (revenue === 0 && cost === 0 && grossProfit === 0) continue;
  const marginRatePct = revenue > 0 ? (grossProfit / revenue) * 100 : 0;
  teamSalesReport.push({ team, revenue, cost, grossProfit, marginRatePct: Math.round(marginRatePct * 100) / 100 });
}

// 미수금/미지급금: col 2 = "미수금"|"미지급금", col 3 = 항목, col 4 또는 col 6 = 금액(공급가 또는 합계)
let receivablesExpected = [];
let payablesExpected = [];
for (let i = valueRow; i < scanEnd; i++) {
  const r = rows[i] || [];
  const category = String(r[2] || "").trim();
  const item = String(r[3] || "").trim();
  const rawAmount = num(r[4]) || num(r[6]);
  if (category === "미수금" && item) {
    const supplyAmount = Math.abs(Math.round(rawAmount / 1.1)) || Math.abs(rawAmount);
    const vat = Math.round(supplyAmount * 0.1);
    receivablesExpected.push({
      id: `er-excel-${i}`,
      category: "매출 예정",
      item,
      supplyAmount,
      vat,
      memo: "",
    });
  } else if (category === "미지급금" && item) {
    const supplyAmount = Math.abs(Math.round(rawAmount / 1.1)) || Math.abs(rawAmount);
    const vat = Math.round(supplyAmount * 0.1);
    payablesExpected.push({
      id: `ep-excel-${i}`,
      category: "매입 예정",
      item,
      supplyAmount,
      vat,
      memo: "",
    });
  }
}

// 현재 현황: monthSummary + survival 기반
const salesSupply = currentRevenue;
const salesVat = Math.round(currentRevenue * 0.1);
const salesTotal = currentRevenue + salesVat;
const purchaseSupply = currentCost;
const purchaseVat = Math.round(currentCost * 0.1);
const purchaseTotal = currentCost + purchaseVat;
const grossSupply = grossProfit;
const grossVat = Math.round(grossProfit * 0.1);
const grossTotal = grossProfit + grossVat;
const currentStatus = {
  salesSupply,
  salesVat,
  salesTotal,
  purchaseSupply,
  purchaseVat,
  purchaseTotal,
  grossSupply,
  grossVat,
  grossTotal,
  survivalBalance: currentBalance,
};

// 팀별 목표 GP: 전체 목표를 매출 비율로 배분
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
    monthlyRevenue: Math.round(currentRevenue * 1.1),
    monthlyGrossProfit: Math.round(grossProfit),
    survivalBalance: Math.round(expectedBalance),
  },
  // 매출 분석 뷰용
  currentStatus,
  teamSalesReport,
  receivablesExpected,
  payablesExpected,
  teamTargetGp,
  overallRefundRatePct: 0,
};

const publicDir = path.join(__dirname, "..", "public");
if (!fs.existsSync(publicDir)) fs.mkdirSync(publicDir, { recursive: true });
const outPath = path.join(publicDir, "finance-current.json");
fs.writeFileSync(outPath, JSON.stringify(out, null, 2), "utf8");
console.log("Written:", outPath);
console.log(JSON.stringify(out, null, 2));
