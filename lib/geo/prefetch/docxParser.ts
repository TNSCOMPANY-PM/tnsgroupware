/**
 * PR053 — docx 풀-파싱 모듈. mammoth → HTML → 표/헤딩 추출.
 *
 * 출력:
 *   - sections: H1/H2/H3 헤딩 인덱스 (number + title)
 *   - tables: 표 (headers + rows + precedingHeading)
 *   - 비교 표 / 데이터 표 분류 + 영역(AreaKey) 매핑
 */

import type { ComparisonRow, ComparisonTable, DataTable } from "./frandoorDocx";
import { assignArea, assignAreaWithConfidence } from "./frandoorDocx";

export type UnmappedTable = {
  preceding_heading: string | null;
  headers: string[];
  rows: string[][];
  reason: string;
  docx_section_index: number;
};

export type SuspectTable = {
  preceding_heading: string | null;
  headers: string[];
  rows: string[][];
  reason: string;
  docx_section_index: number;
};

/** PR055 — 표 헤더 vs row 길이 정렬 검증. mismatch 시 suspect 분류. */
export function validateTableAlignment(
  headers: string[],
  rows: string[][],
): { valid: boolean; reason?: string } {
  if (headers.length === 0) return { valid: false, reason: "empty headers" };
  if (rows.length === 0) return { valid: true };
  const headerLen = headers.length;
  const rowLens = new Set(rows.map((r) => r.length));
  if (rowLens.size > 1) {
    return { valid: false, reason: `inconsistent row lengths: ${[...rowLens].join(",")}` };
  }
  const rowLen = [...rowLens][0];
  if (rowLen !== headerLen) {
    return { valid: false, reason: `header(${headerLen}) vs row(${rowLen}) length mismatch` };
  }
  return { valid: true };
}

/** PR055 — frandoorDocx FrandoorDocx 타입에 추가될 suspect_tables. */
export type AlignmentSafeOpts = { dataTableHeaders?: string[]; dataTableRows?: Record<string, string>[] };
export function isAlignmentSafe(headers: string[], rowsRecord: Record<string, string>[]): boolean {
  // record-format data 표 align 검증 — 모든 row 가 헤더 키 모두 포함하는지.
  if (headers.length === 0) return false;
  if (rowsRecord.length === 0) return true;
  const expectedKeys = headers.map((h) => h.replace(/\s+/g, "_"));
  return rowsRecord.every((row) => expectedKeys.every((k) => k in row));
}

export type DocxParseResult = {
  sections: { level: number; title: string }[];
  comparison_tables: ComparisonTable[];
  data_tables: DataTable[];
  unmapped_tables: UnmappedTable[];
  suspect_tables: SuspectTable[];
  raw_text: string;
};

type RawTable = {
  headers: string[];
  rows: string[][];
  precedingHeading?: string;
};

function decodeHtmlEntities(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ");
}

function stripTags(s: string): string {
  return decodeHtmlEntities(s.replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim());
}

/** PR055 — 셀 안 nested <p>·<br>·줄바꿈을 단일 텍스트로 결합. 셀 자체 split 차단. */
function extractCellText(cellHtml: string): string {
  return decodeHtmlEntities(
    cellHtml
      .replace(/<\/p>\s*<p[^>]*>/gi, " ") // 인접 <p> 결합
      .replace(/<br\s*\/?>/gi, " ")
      .replace(/<[^>]+>/g, "")
      .replace(/\s+/g, " ")
      .trim(),
  );
}

/** PR055 — colspan="N" 셀을 N번 복제 (단순 처리). */
function extractRowCells(rowHtml: string): string[] {
  const cells: string[] = [];
  const cellRe = /<(t[hd])([^>]*)>([\s\S]*?)<\/\1>/giu;
  let m: RegExpExecArray | null;
  while ((m = cellRe.exec(rowHtml)) !== null) {
    const attrs = m[2];
    const text = extractCellText(m[3]);
    const colspanMatch = attrs.match(/colspan\s*=\s*"?(\d+)"?/iu);
    const span = colspanMatch ? Math.max(1, parseInt(colspanMatch[1], 10)) : 1;
    for (let i = 0; i < span; i++) cells.push(text);
  }
  return cells;
}

/** mammoth HTML 출력에서 테이블·헤딩 추출. 정규식 기반 (HTML 단순 구조 대상). */
function extractTablesAndHeadings(html: string): {
  sections: { level: number; title: string }[];
  tables: RawTable[];
  raw_text: string;
} {
  const sections: { level: number; title: string }[] = [];
  const tables: RawTable[] = [];
  let lastHeading: string | undefined;

  // 헤딩·테이블을 등장 순서대로 처리.
  const tokenRe = /<(h[1-3])[^>]*>([\s\S]*?)<\/\1>|<table[^>]*>([\s\S]*?)<\/table>/giu;
  let m: RegExpExecArray | null;
  while ((m = tokenRe.exec(html)) !== null) {
    if (m[1]) {
      // 헤딩
      const level = parseInt(m[1].slice(1), 10);
      const title = stripTags(m[2]);
      if (title) {
        sections.push({ level, title });
        lastHeading = title;
      }
    } else if (m[3]) {
      // 테이블 — PR055: extractRowCells (colspan + nested <p> 처리).
      const tbl = m[3];
      const rows: string[][] = [];
      const trRe = /<tr[^>]*>([\s\S]*?)<\/tr>/giu;
      let tr: RegExpExecArray | null;
      while ((tr = trRe.exec(tbl)) !== null) {
        const cells = extractRowCells(tr[1]);
        if (cells.length > 0) rows.push(cells);
      }
      if (rows.length > 0) {
        const [headers, ...rest] = rows;
        tables.push({ headers, rows: rest, precedingHeading: lastHeading });
      }
    }
  }
  const raw_text = stripTags(html);
  return { sections, tables, raw_text };
}

// PR054 — 출처 그룹별 alias 풀 확장.
const OFFICIAL_PATTERNS: RegExp[] = [
  /공정위/u,
  /정보공개서/u,
  /공식\s*수치/u,
  /공시/u,
  /등록\s*기준/u,
  /A급/u,
  /a-tier/iu,
];
const BROCHURE_PATTERNS: RegExp[] = [
  /브로셔/u,
  /본사/u,
  /홈페이지/u,
  /POS/iu,
  /판매시점/u,
  /실제/u,
  /실측/u,
  /발표/u,
  /자체/u,
  /공개\s*자료/u,
  /C급/u,
  /c-tier/iu,
];
const KOSIS_PATTERNS: RegExp[] = [
  /KOSIS/iu,
  /통계청/u,
  /외식업\s*전체/u,
  /업종\s*평균/u,
  /B급/u,
  /b-tier/iu,
];

function anyMatch(patterns: RegExp[], s: string): boolean {
  return patterns.some((p) => p.test(s));
}

function classifyTable(headers: string[], rows: string[][]): "comparison" | "data" {
  const headerJoined = headers.join(" ");
  const hasOfficial = anyMatch(OFFICIAL_PATTERNS, headerJoined);
  const hasBrochure = anyMatch(BROCHURE_PATTERNS, headerJoined);
  const hasKosis = anyMatch(KOSIS_PATTERNS, headerJoined);
  const groupCount = [hasOfficial, hasBrochure, hasKosis].filter(Boolean).length;
  if (groupCount >= 2) return "comparison";
  // 헤더 부족 시 row 안 비고 컬럼에 "차이/일치/상이/구분" ≥ 30% 등장 → 비교.
  const noteCol = headers.findIndex((h) => /비고|차이/u.test(h));
  if (noteCol >= 0 && rows.length > 0) {
    const compareRows = rows.filter((r) => /차이|일치|상이|구분/u.test(r[noteCol] ?? "")).length;
    if (compareRows / rows.length >= 0.3) return "comparison";
  }
  return "data";
}

function findHeaderIdx(headers: string[], patterns: RegExp[]): number {
  return headers.findIndex((h) => patterns.some((p) => p.test(h)));
}

function extractUnit(s: string): string | null {
  const m = s.match(/(만원|억원|개월|호점|점포|배|건|개|평|㎡|%)/u);
  return m ? m[1] : null;
}

function buildComparisonRows(headers: string[], rows: string[][]): ComparisonRow[] {
  const idxMetric = headers.findIndex((h) => /항목|지표|구분|기준/u.test(h));
  const idxOfficial = findHeaderIdx(headers, OFFICIAL_PATTERNS);
  const idxBrochure = findHeaderIdx(headers, BROCHURE_PATTERNS);
  const idxKosis = findHeaderIdx(headers, KOSIS_PATTERNS);
  const idxNote = headers.findIndex((h) => /비고|차이|설명/u.test(h));
  if (idxMetric < 0 || idxOfficial < 0) return [];

  return rows
    .map((r) => {
      const metric = (r[idxMetric] ?? "").trim();
      const official_value = (r[idxOfficial] ?? "").trim();
      if (!metric || !official_value) return null;
      const brochure_value = idxBrochure >= 0 ? r[idxBrochure]?.trim() || null : null;
      const kosis_value = idxKosis >= 0 ? r[idxKosis]?.trim() || null : null;
      const note = idxNote >= 0 ? r[idxNote]?.trim() || null : null;
      const unit = extractUnit(official_value);
      return { metric, official_value, brochure_value, kosis_value, note, unit } as ComparisonRow;
    })
    .filter((x): x is ComparisonRow => x !== null);
}

function rowsToRecord(headers: string[], rows: string[][]): Record<string, string>[] {
  return rows.map((r) => {
    const obj: Record<string, string> = {};
    headers.forEach((h, i) => {
      obj[h.replace(/\s+/g, "_")] = (r[i] ?? "").trim();
    });
    return obj;
  });
}

/** 메인 진입. mammoth 가용 시 사용, 아니면 throw. 호출자가 try/catch 처리. */
export async function parseDocxFull(buffer: Buffer): Promise<DocxParseResult> {
  // 동적 import — server-only 환경에서만 실행.
  const mammoth = (await import("mammoth")) as unknown as {
    convertToHtml: (input: { buffer: Buffer }) => Promise<{ value: string }>;
  };
  const result = await mammoth.convertToHtml({ buffer });
  const html = result.value || "";
  const { sections, tables, raw_text } = extractTablesAndHeadings(html);

  const comparison_tables: ComparisonTable[] = [];
  const data_tables: DataTable[] = [];
  const unmapped_tables: UnmappedTable[] = [];
  const suspect_tables: SuspectTable[] = [];

  for (let i = 0; i < tables.length; i++) {
    const t = tables[i];
    const headerText = t.headers.join(" ");
    const sectionTitle = t.precedingHeading ?? "";
    const { area, confidence } = assignAreaWithConfidence(`${sectionTitle} ${headerText}`);
    const kind = classifyTable(t.headers, t.rows);
    void assignArea; // keep export reference

    // PR055 — 정렬 검증. 헤더 vs row 길이 mismatch 또는 row 간 길이 불일치 → suspect.
    const alignment = validateTableAlignment(t.headers, t.rows);
    if (!alignment.valid) {
      suspect_tables.push({
        preceding_heading: t.precedingHeading ?? null,
        headers: t.headers,
        rows: t.rows,
        reason: alignment.reason ?? "alignment unknown",
        docx_section_index: i,
      });
      continue;
    }

    // confidence low + 비교/데이터 분류도 모호하면 unmapped 보존.
    if (confidence === "low") {
      unmapped_tables.push({
        preceding_heading: t.precedingHeading ?? null,
        headers: t.headers,
        rows: t.rows,
        reason: `assignArea fallback (low confidence) — kind=${kind}`,
        docx_section_index: i,
      });
      continue;
    }

    if (kind === "comparison") {
      const rows = buildComparisonRows(t.headers, t.rows);
      if (rows.length > 0) {
        comparison_tables.push({
          section: sectionTitle || headerText,
          area,
          headers: t.headers,
          rows,
        });
      } else {
        // 비교 분류됐으나 row 추출 실패 — unmapped.
        unmapped_tables.push({
          preceding_heading: t.precedingHeading ?? null,
          headers: t.headers,
          rows: t.rows,
          reason: "comparison classify but buildComparisonRows empty",
          docx_section_index: i,
        });
      }
    } else {
      data_tables.push({
        section: sectionTitle || headerText,
        area,
        headers: t.headers,
        rows: rowsToRecord(t.headers, t.rows),
      });
    }
  }

  return { sections, comparison_tables, data_tables, unmapped_tables, suspect_tables, raw_text };
}
