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
    const caption = t.caption ? `<caption>${escapeHtml(t.caption)}</caption>` : "";
    const ths = t.headers.map(h => `<th>${escapeHtml(h)}</th>`).join("");
    const thead = `<thead><tr>${ths}</tr></thead>`;
    const trs = t.rows.map(row => {
      const tds = row.map(cell => `<td>${escapeHtml(cell)}</td>`).join("");
      return `<tr>${tds}</tr>`;
    }).join("\n");
    const tbody = `<tbody>${trs}</tbody>`;
    return `<table class="ds-table">${caption}${thead}${tbody}</table>`;
  }).join("\n");

  const notesBlock = input.notes?.length
    ? `<ul class="ds-notes">${input.notes.map(n => `<li>${escapeHtml(n)}</li>`).join("")}</ul>`
    : "";

  const sourcesText = input.sources.map(s => escapeHtml(s)).join(", ");

  return `<article class="ds-wrap" data-ds-type="${escapeHtml(input.dsType)}">
<h1>${escapeHtml(input.title)}</h1>
<p class="ds-lede">${escapeHtml(input.lede)}</p>
${tableBlocks}
${notesBlock}
<footer class="ds-sources">
출처: ${sourcesText}<br>
본 자료는 ${escapeHtml(input.baseDate)} 기준입니다.
</footer>
</article>`;
}
