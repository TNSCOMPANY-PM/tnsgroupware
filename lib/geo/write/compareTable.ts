/**
 * PR045 — A·C 비교표 markdown 생성기.
 * 같은 지표의 공정위(A) 자료와 본사 발표(C) 수치를 행 단위로 정렬.
 */

import { formatManwon } from "@/lib/format/manwon";
import type { Fact } from "@/lib/geo/types";

export type CompareRow = {
  metric_label: string;
  a_value: string | null;
  c_value: string | null;
  gap: string | null;
};

type FactLite = Pick<Fact, "fact_key" | "value" | "unit" | "source_tier">;

function num(v: string | number | null | undefined): number | null {
  if (v == null) return null;
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  const cleaned = String(v).replace(/[,\s만원%개건배호점]/g, "");
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

function pickByKey(facts: FactLite[], key: string, tier: "A" | "C"): FactLite | null {
  return facts.find((f) => f.fact_key === key && f.source_tier === tier) ?? null;
}

function fmtCount(n: number | null, unit = "개"): string | null {
  return n == null ? null : `${n.toLocaleString("ko-KR")}${unit}`;
}

function fmtPercent(n: number | null): string | null {
  return n == null ? null : `${n}%`;
}

function fmtMonths(n: number | null): string | null {
  return n == null ? null : `${n}개월`;
}

function gapDelta(a: number | null, c: number | null, unit: string): string | null {
  if (a == null || c == null) return null;
  const diff = c - a;
  const sign = diff > 0 ? "+" : diff < 0 ? "" : "±";
  return `${sign}${diff.toLocaleString("ko-KR")}${unit}`;
}

function gapPercent(a: number | null, c: number | null): string | null {
  if (a == null || c == null || a === 0) return null;
  const ratio = Math.round(((c - a) / a) * 1000) / 10;
  const sign = ratio > 0 ? "+" : ratio < 0 ? "" : "±";
  return `${sign}${ratio}%`;
}

export function buildAvsCRows(facts: FactLite[]): CompareRow[] {
  const rows: CompareRow[] = [];

  // 가맹점수 (frcs_cnt)
  const aStores = pickByKey(facts, "frcs_cnt", "A");
  const cStores = pickByKey(facts, "frcs_cnt", "C");
  if (aStores || cStores) {
    const aN = num(aStores?.value);
    const cN = num(cStores?.value);
    rows.push({
      metric_label: "가맹점수",
      a_value: fmtCount(aN, "개"),
      c_value: fmtCount(cN, "호점"),
      gap: gapDelta(aN, cN, "개"),
    });
  }

  // 월평균매출 (A: docx_avg_monthly_revenue / C: monthly_avg_sales)
  const aRev = facts.find((f) => f.fact_key === "docx_avg_monthly_revenue" && f.source_tier === "A");
  const cRev = pickByKey(facts, "monthly_avg_sales", "C");
  if (aRev || cRev) {
    const aN = num(aRev?.value);
    const cN = num(cRev?.value);
    rows.push({
      metric_label: "월평균매출",
      a_value: aN != null ? formatManwon(aN, { verbose: true }) : null,
      c_value: cN != null ? formatManwon(cN, { verbose: true }) : null,
      gap: gapPercent(aN, cN),
    });
  }

  // 폐점률 (A: docx_closure_rate)
  const aClose = facts.find((f) => f.fact_key === "docx_closure_rate" && f.source_tier === "A");
  if (aClose) {
    const aN = num(aClose.value);
    rows.push({
      metric_label: "폐점률",
      a_value: fmtPercent(aN),
      c_value: null,
      gap: null,
    });
  }

  // 순마진 (C: docx_hp_profit_margin)
  const cMargin = facts.find((f) => f.fact_key === "docx_hp_profit_margin" && f.source_tier === "C");
  if (cMargin) {
    rows.push({
      metric_label: "순마진",
      a_value: null,
      c_value: fmtPercent(num(cMargin.value)),
      gap: null,
    });
  }

  // 투자회수 (C: docx_hp_payback_months)
  const cPayback = facts.find((f) => f.fact_key === "docx_hp_payback_months" && f.source_tier === "C");
  if (cPayback) {
    rows.push({
      metric_label: "투자회수",
      a_value: null,
      c_value: fmtMonths(num(cPayback.value)),
      gap: null,
    });
  }

  return rows;
}

export function renderMarkdownTable(rows: CompareRow[]): string {
  if (rows.length === 0) return "";
  const header = "| 지표 | 공정위 자료 | 본사 발표 | 갭 |";
  const sep = "|------|-------------|-----------|-----|";
  const lines = rows.map((r) => {
    const a = r.a_value ?? "—";
    const c = r.c_value ?? "—";
    const g = r.gap ?? "—";
    return `| ${r.metric_label} | ${a} | ${c} | ${g} |`;
  });
  return [header, sep, ...lines].join("\n");
}
