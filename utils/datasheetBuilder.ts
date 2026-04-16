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

export function renderDatasheetHtml(input: DatasheetInput): string {
  const tableBlocks = input.tables.map(t => {
    const caption = t.caption
      ? `<caption style="text-align:left;font-size:14px;font-weight:700;color:#374151;padding:8px 0">${escapeHtml(t.caption)}</caption>`
      : "";
    const ths = t.headers.map(h =>
      `<th style="padding:10px 12px;border:1px solid #e5e7eb;text-align:left;font-weight:700;color:#374151;font-size:13px;background:#f9fafb">${escapeHtml(h)}</th>`
    ).join("");
    const thead = `<thead><tr>${ths}</tr></thead>`;
    const trs = t.rows.map((row, ri) => {
      const bg = ri % 2 === 0 ? "#fff" : "#f9fafb";
      const tds = row.map(cell =>
        `<td style="padding:8px 12px;border:1px solid #e5e7eb;font-size:13px;color:#111827;background:${bg}">${escapeHtml(cell)}</td>`
      ).join("");
      return `<tr>${tds}</tr>`;
    }).join("\n");
    const tbody = `<tbody>${trs}</tbody>`;
    return `<table style="width:100%;border-collapse:collapse;margin:16px 0">${caption}${thead}${tbody}</table>`;
  }).join("\n");

  const notesBlock = input.notes?.length
    ? `<ul style="margin:12px 0;padding-left:20px;font-size:12px;color:#6b7280;line-height:1.7">${input.notes.map(n => `<li>${escapeHtml(n)}</li>`).join("")}</ul>`
    : "";

  const sourcesText = input.sources.map(s => escapeHtml(s)).join(", ");

  return `<article style="max-width:800px;font-family:Pretendard,sans-serif" data-ds-type="${escapeHtml(input.dsType)}">
<h1 style="font-size:20px;font-weight:800;color:#111827;margin:0 0 8px 0">${escapeHtml(input.title)}</h1>
<p style="font-size:15px;color:#374151;line-height:1.7;margin:0 0 16px 0;font-weight:500">${escapeHtml(input.lede)}</p>
${tableBlocks}
${notesBlock}
<footer style="font-size:12px;color:#9ca3af;line-height:1.7;margin-top:16px;padding-top:12px;border-top:1px solid #e5e7eb">
출처: ${sourcesText}<br>
본 자료는 ${escapeHtml(input.baseDate)} 기준입니다.
</footer>
</article>`;
}
