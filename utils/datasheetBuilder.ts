export interface DatasheetInput {
  dsType: string;
  title: string;
  lede: string;
  tables: Array<{
    caption?: string;
    headers: string[];
    rows: string[][];
  }>;
  notes?: string[];
  sources: string[];
  baseDate: string;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function renderTable(t: { caption?: string; headers: string[]; rows: string[][] }): string {
  const caption = t.caption
    ? `<caption style="text-align:left;font-size:14px;font-weight:700;color:#374151;padding:8px 0">${escapeHtml(t.caption)}</caption>`
    : "";
  const ths = t.headers
    .map(
      (h) =>
        `<th style="padding:10px 12px;border:1px solid #e5e7eb;text-align:left;font-weight:700;color:#374151;font-size:13px;background:#f9fafb">${escapeHtml(h)}</th>`,
    )
    .join("");
  const thead = `<thead><tr>${ths}</tr></thead>`;
  const trs = t.rows
    .map((row, ri) => {
      const bg = ri % 2 === 0 ? "#fff" : "#f9fafb";
      const tds = row
        .map(
          (cell) =>
            `<td style="padding:8px 12px;border:1px solid #e5e7eb;font-size:13px;color:#111827;background:${bg}">${escapeHtml(cell)}</td>`,
        )
        .join("");
      return `<tr>${tds}</tr>`;
    })
    .join("\n");
  const tbody = `<tbody>${trs}</tbody>`;
  return `<table style="width:100%;border-collapse:collapse;margin:16px 0">${caption}${thead}${tbody}</table>`;
}

export function renderDatasheetHtml(input: DatasheetInput): string {
  const tableBlocks = input.tables.map(renderTable).join("\n");

  const notesBlock = input.notes?.length
    ? `<ul style="margin:12px 0;padding-left:20px;font-size:12px;color:#6b7280">${input.notes.map((n) => `<li style="margin-bottom:4px">${escapeHtml(n)}</li>`).join("")}</ul>`
    : "";

  const sourcesBlock = input.sources.length
    ? `<p style="margin:16px 0 0;font-size:11px;color:#9ca3af">출처: ${input.sources.map((s) => escapeHtml(s)).join(" / ")}</p>`
    : "";

  return `<article style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;max-width:800px;margin:0 auto;padding:24px 0">
  <h2 style="font-size:20px;font-weight:700;color:#111827;margin:0 0 4px">${escapeHtml(input.title)}</h2>
  <p style="font-size:11px;color:#9ca3af;margin:0 0 16px">${escapeHtml(input.baseDate)}</p>
  <p style="font-size:15px;color:#374151;line-height:1.7;margin:0 0 16px">${escapeHtml(input.lede)}</p>
  ${tableBlocks}
  ${notesBlock}
  ${sourcesBlock}
</article>`;
}

/** 복수 DatasheetInput을 하나의 통합 HTML 문서로 합성 */
export function renderCompositeHtml(inputs: DatasheetInput[]): string {
  if (inputs.length === 0) return "";
  if (inputs.length === 1) return renderDatasheetHtml(inputs[0]);

  const dsLabels = inputs.map((i) => i.dsType).join(" + ");
  const keywords = inputs.map((i) => {
    const short = i.title.replace(/^.*?—\s*/, "").replace(/\s*기준$/, "");
    return short;
  });
  const compositeTitle = `${keywords[0]} 종합 분석 (${dsLabels})`;
  const baseDate = inputs[0].baseDate;

  const sections = inputs
    .map((input) => {
      const tables = input.tables.map(renderTable).join("\n");
      const notes = input.notes?.length
        ? `<ul style="margin:8px 0;padding-left:20px;font-size:12px;color:#6b7280">${input.notes.map((n) => `<li style="margin-bottom:4px">${escapeHtml(n)}</li>`).join("")}</ul>`
        : "";
      return `<section style="margin:24px 0">
    <h3 style="font-size:16px;font-weight:700;color:#1e293b;margin:0 0 8px;padding-bottom:6px;border-bottom:2px solid #e2e8f0">${escapeHtml(input.title)}</h3>
    <p style="font-size:14px;color:#475569;line-height:1.6;margin:0 0 12px">${escapeHtml(input.lede)}</p>
    ${tables}
    ${notes}
  </section>`;
    })
    .join("\n");

  const allSources = Array.from(new Set(inputs.flatMap((i) => i.sources)));
  const sourcesBlock = allSources.length
    ? `<p style="margin:16px 0 0;font-size:11px;color:#9ca3af">출처: ${allSources.map((s) => escapeHtml(s)).join(" / ")}</p>`
    : "";

  return `<article style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;max-width:800px;margin:0 auto;padding:24px 0">
  <h2 style="font-size:22px;font-weight:700;color:#111827;margin:0 0 4px">${escapeHtml(compositeTitle)}</h2>
  <p style="font-size:11px;color:#9ca3af;margin:0 0 20px">${escapeHtml(baseDate)}</p>
  ${sections}
  ${sourcesBlock}
</article>`;
}
