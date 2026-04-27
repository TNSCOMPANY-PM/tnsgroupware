/**
 * PR054 — data 표 (비교 아닌 자유 형태) markdown 변환 + 자연어 요약.
 */

import type { DataTable } from "@/lib/geo/prefetch/frandoorDocx";

export function renderDataTable(table: DataTable): string {
  if (table.rows.length === 0 || table.headers.length === 0) return "";
  const header = `| ${table.headers.join(" | ")} |`;
  const sep = `| ${table.headers.map(() => "---").join(" | ")} |`;
  const rows = table.rows.map((row) => {
    return `| ${table.headers
      .map((h) => row[h.replace(/\s+/g, "_")] ?? row[h] ?? "—")
      .join(" | ")} |`;
  });
  return [header, sep, ...rows].join("\n");
}

/** data 표에서 단일 컬럼 분포 또는 다중 컬럼 첫 행을 자연어 1~2 문장으로. */
export function summarizeDataTable(table: DataTable): string {
  if (table.rows.length === 0) return "";
  const headers = table.headers;
  const first = table.rows[0];

  // 시간대·지역·점포 분포 패턴: 컬럼 2~3개, 비중/비율/매출 키워드.
  const isDistribution =
    headers.length >= 2 &&
    table.rows.length >= 2 &&
    /(시간대|지역|점포|채널|평일|주말)/u.test(headers.join(" "));

  if (isDistribution) {
    const labelKey = headers[0].replace(/\s+/g, "_");
    const valueKey = headers[1].replace(/\s+/g, "_");
    const top3 = table.rows
      .slice(0, 3)
      .map((r) => `${r[labelKey] ?? "—"} ${r[valueKey] ?? "—"}`)
      .join(", ");
    return `${headers[0]}별 ${headers[1]} 상위 분포: ${top3}.`;
  }

  // 그 외: 첫 행 요약.
  const pairs = headers
    .map((h) => `${h} ${first[h.replace(/\s+/g, "_")] ?? first[h] ?? "—"}`)
    .slice(0, 4)
    .join(", ");
  return `예시 행: ${pairs}.`;
}
