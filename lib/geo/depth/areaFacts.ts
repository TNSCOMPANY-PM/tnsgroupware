/**
 * PR052 — 7영역 비교표 → facts 풀 주입 + 영역별 H2 markdown 빌더.
 */

import type { Fact } from "@/lib/geo/types";
import type { ComparisonRow, ComparisonTable, DataTable, AreaKey, FrandoorDocx } from "@/lib/geo/prefetch/frandoorDocx";
import type { AreaPlan, AreaPriority } from "./areaRouter";
import { renderDataTable, summarizeDataTable } from "@/lib/geo/write/dataTable";

const AREA_HEADER: Record<AreaKey, string> = {
  brand_basic: "이 브랜드, 어떤 곳인가요?",
  avg_revenue: "평균매출, 어느 정도인가요?",
  startup_cost: "창업비용, 뭐뭐 들어가는 건가요?",
  operation: "계약 조건, 어떻게 되어 있나요?",
  frcs_status: "가맹점 현황, 어떻게 변해왔을까요?",
  revenue_detail: "매출은 어디서 어떻게 나오나요?",
  cert_compliance: "인증·법적 이슈, 어떤 신호가 보이나요?",
};

export function buildComparisonClaim(row: ComparisonRow): string {
  const note = row.note;
  if (note === "일치") {
    return `${row.metric}은 공정위·본사 ${row.official_value}로 일치합니다.`;
  }
  if (note?.includes("차이") || note?.includes("기준")) {
    return `${row.metric}: 공정위 ${row.official_value} vs 본사 ${row.brochure_value ?? "—"} (${note})`;
  }
  if (!row.brochure_value) {
    return `${row.metric} ${row.official_value} (공정위 정보공개서)`;
  }
  return `${row.metric}: 공정위 ${row.official_value}, 본사 ${row.brochure_value}`;
}

function rowMonthYear(sourceYear: string | null): string | undefined {
  if (!sourceYear) return undefined;
  return `${sourceYear}-12`;
}

/** 영역별 비교표 → facts 풀 주입. priority=primary 면 모든 row, secondary 면 note 가 있는 핵심 row 만. */
export function buildAreaFacts(opts: {
  area: AreaKey;
  docx: FrandoorDocx;
  priority: AreaPriority;
}): Fact[] {
  const { area, docx, priority } = opts;
  if (priority === "skip") return [];
  const tables = docx.comparison_tables.filter((t) => t.area === area);
  const out: Fact[] = [];
  const ym = rowMonthYear(docx.official_data?.source_year ?? null);

  for (const table of tables) {
    for (const row of table.rows) {
      if (priority === "secondary" && (!row.note || row.note === "일치")) continue;
      out.push({
        claim: buildComparisonClaim(row),
        value: row.official_value,
        unit: row.unit ?? null,
        source_url: "https://franchise.ftc.go.kr/",
        source_title: `${docx.brand_name} 공정위 정보공개서 ${docx.official_data?.source_year ?? ""}`,
        year_month: ym ?? "2024-12",
        period_month: ym,
        authoritativeness: "primary",
        tier: "A",
        source_tier: "A",
        fact_key: `area_${area}_${row.metric}`,
        derived: false,
      });
      if (row.brochure_value) {
        out.push({
          claim: `${row.metric} 본사 발표 ${row.brochure_value}${row.note ? ` (${row.note})` : ""}`,
          value: row.brochure_value,
          unit: row.unit ?? null,
          source_url: "",
          source_title: `${docx.brand_name} 본사 공개 자료`,
          year_month: new Date().toISOString().slice(0, 7),
          period_month: new Date().toISOString().slice(0, 7),
          authoritativeness: "secondary",
          tier: "C",
          source_tier: "C",
          fact_key: `area_${area}_${row.metric}_hp`,
          derived: false,
        });
      }
    }
  }
  return out;
}

/** 영역별 ComparisonTable → markdown 표. 빈 표는 빈 문자열 반환. */
export function renderAreaTable(table: ComparisonTable): string {
  if (table.rows.length === 0) return "";
  const headers = ["항목", "공정위 정보공개서", "본사 공개 자료", "비고"];
  const head = `| ${headers.join(" | ")} |`;
  const sep = `| ${headers.map(() => "---").join(" | ")} |`;
  const rows = table.rows.map((r) => {
    const a = r.official_value || "—";
    const c = r.brochure_value ?? "—";
    const n = r.note ?? "—";
    return `| ${r.metric} | ${a} | ${c} | ${n} |`;
  });
  return [head, sep, ...rows].join("\n");
}

/** 영역별 H2 섹션 markdown 조립 (헤더 + 비교표 + 비고 풀이 + data 표). primary 영역에서만 호출 권장. */
export function buildAreaSectionMarkdown(opts: {
  area: AreaKey;
  brand: string;
  tables: ComparisonTable[];
  dataTables?: DataTable[];
  priority?: AreaPriority;
}): string {
  const { area, brand, tables, dataTables = [], priority = "primary" } = opts;
  const compForArea = tables.filter((t) => t.area === area);
  const dataForArea = priority === "primary" ? dataTables.filter((t) => t.area === area) : [];
  if (compForArea.length === 0 && dataForArea.length === 0) return "";

  const heading = `## ${AREA_HEADER[area].replace(/\$\{brand\}/g, brand)}`;
  const lines: string[] = [heading, ""];

  if (compForArea.length > 0) {
    lines.push(`공정위 정보공개서와 본사 공개 자료를 같은 항목으로 나란히 비교했습니다.`);
    lines.push("");
    const noteSummaries: string[] = [];
    for (const t of compForArea) {
      const md = renderAreaTable(t);
      if (md) {
        lines.push(md);
        lines.push("");
      }
      for (const row of t.rows) {
        if (row.note && row.note !== "일치") {
          noteSummaries.push(`${row.metric}: ${row.note}`);
        }
      }
    }
    const noteLine =
      noteSummaries.length > 0
        ? `눈에 띄는 차이는 다음과 같습니다 — ${noteSummaries.slice(0, 3).join(" · ")}.`
        : `공정위 자료와 본사 발표가 핵심 항목에서 일치합니다.`;
    lines.push(noteLine);
    lines.push("");
  }

  for (const t of dataForArea.slice(0, 3)) {
    const md = renderDataTable(t);
    if (md) {
      lines.push(md);
      lines.push("");
      const summary = summarizeDataTable(t);
      if (summary) {
        lines.push(summary);
        lines.push("");
      }
    }
  }

  lines.push("→ 다른 영역 수치도 함께 살펴보겠습니다.");
  return lines.join("\n");
}

export const AREA_HEADERS = AREA_HEADER;
