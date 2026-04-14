// eslint-disable-next-line @typescript-eslint/no-require-imports
const XLSX = require("xlsx");
import type { Section } from "./factPrescan";

const LARGE_SHEET_CSV_THRESHOLD = 50_000;  // 시트 CSV 길이 임계값
const LARGE_SHEET_ROW_THRESHOLD = 2_000;   // 행 임계값
const SAMPLE_ROWS = 50;                    // 샘플 상·하 행 수

type Row = Record<string, unknown>;

function isNumericLike(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string") {
    const cleaned = v.replace(/[,\s원₩]/g, "");
    if (/^-?\d+(?:\.\d+)?$/.test(cleaned)) return parseFloat(cleaned);
  }
  return null;
}

function summarizeSheet(name: string, sheet: unknown): Section {
  const rows = XLSX.utils.sheet_to_json(sheet, { defval: "" }) as Row[];
  const rowCount = rows.length;
  if (rowCount === 0) {
    return { content: `[시트: ${name}] (빈 시트)`, hint: `시트:${name}`, priority: 3 };
  }

  const headers = Object.keys(rows[0]);
  const stats: string[] = [];

  for (const h of headers) {
    const nums: number[] = [];
    for (const r of rows) {
      const n = isNumericLike(r[h]);
      if (n !== null) nums.push(n);
    }
    if (nums.length >= Math.min(10, Math.floor(rowCount * 0.3))) {
      nums.sort((a, b) => a - b);
      const sum = nums.reduce((a, b) => a + b, 0);
      const avg = sum / nums.length;
      const min = nums[0];
      const max = nums[nums.length - 1];
      const med = nums[Math.floor(nums.length / 2)];
      stats.push(`  - ${h}: N=${nums.length}, min=${min}, max=${max}, avg=${avg.toFixed(1)}, median=${med}, sum=${sum}`);
    }
  }

  const head = rows.slice(0, SAMPLE_ROWS);
  const tail = rows.slice(-SAMPLE_ROWS);
  const headCsv = XLSX.utils.sheet_to_csv(XLSX.utils.json_to_sheet(head));
  const tailCsv = SAMPLE_ROWS < rowCount
    ? XLSX.utils.sheet_to_csv(XLSX.utils.json_to_sheet(tail))
    : "";

  const parts = [
    `[시트: ${name}] 전체 ${rowCount.toLocaleString()}행, ${headers.length}컬럼`,
    `컬럼: ${headers.join(", ")}`,
  ];
  if (stats.length > 0) {
    parts.push("[숫자 컬럼 통계]", ...stats);
  }
  parts.push("[상위 샘플]", headCsv);
  if (tailCsv) parts.push("[하위 샘플]", tailCsv);

  return { content: parts.join("\n"), hint: `시트:${name}`, priority: 7 };
}

/**
 * xlsx buffer → 시트별 Section 배열.
 * 큰 시트는 헤더 + 숫자컬럼 통계 + 상위/하위 샘플로 요약.
 */
export function extractXlsxSections(buffer: Buffer): Section[] {
  const wb = XLSX.read(buffer, { type: "buffer" });
  const sections: Section[] = [];

  for (const name of wb.SheetNames) {
    const sheet = wb.Sheets[name];
    const csv = XLSX.utils.sheet_to_csv(sheet);
    const rowCount = csv.split("\n").length;

    if (csv.length > LARGE_SHEET_CSV_THRESHOLD || rowCount > LARGE_SHEET_ROW_THRESHOLD) {
      sections.push(summarizeSheet(name, sheet));
    } else {
      sections.push({ content: `[시트: ${name}]\n${csv}`, hint: `시트:${name}`, priority: 6 });
    }
  }

  return sections;
}

/**
 * Section[] → 단일 텍스트 (fileParser 호환용).
 */
export function xlsxBufferToText(buffer: Buffer): string {
  const sections = extractXlsxSections(buffer);
  return sections.map(s => s.content).join("\n\n");
}
