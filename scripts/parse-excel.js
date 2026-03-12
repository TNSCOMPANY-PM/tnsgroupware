const XLSX = require('xlsx');
const path = require('path');

const filePath = path.join(process.env.USERPROFILE, 'Downloads', '(주)티앤에스컴퍼니 매출 통계 24.01~ (1).xlsx');
const wb = XLSX.readFile(filePath);

const result = {
  sheetNames: wb.SheetNames,
  sheets: {},
};

for (const name of wb.SheetNames) {
  const sheet = wb.Sheets[name];
  const data = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });
  result.sheets[name] = data;
}

console.log(JSON.stringify(result, null, 2));
