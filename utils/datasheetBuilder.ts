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
<h2 style="font-size:20px;font-weight:800;color:#111827;margin:0 0 4px 0">${escapeHtml(input.title)}</h2>
<p style="font-size:12px;color:#9ca3af;margin:0 0 12px 0">${escapeHtml(input.baseDate)} 기준</p>
<p style="font-size:16px;color:#374151;line-height:1.7;margin:0 0 16px 0;font-weight:500">${escapeHtml(input.lede)}</p>
${tableBlocks}
${notesBlock}
<footer style="font-size:11px;color:#9ca3af;line-height:1.7;margin-top:16px;padding-top:12px;border-top:1px solid #e5e7eb">
출처: ${sourcesText}
</footer>
</article>`;
}

/** 복수 DS 를 하나의 통합 HTML 아티클로 합성 */
export function renderCompositeHtml(inputs: DatasheetInput[]): string {
  if (inputs.length === 0) return "";
  if (inputs.length === 1) return renderDatasheetHtml(inputs[0]);

  const dsLabels = inputs.map(i => i.title.split("—")[0].trim()).filter(Boolean);
  const compositeTitle = dsLabels.join(" · ");
  const compositeDate = inputs[0].baseDate;

  const sections = inputs.map(input => {
    const tableBlocks = input.tables.map(t => {
      const caption = t.caption
        ? `<caption style="text-align:left;font-size:13px;font-weight:700;color:#374151;padding:6px 0">${escapeHtml(t.caption)}</caption>`
        : "";
      const ths = t.headers.map(h =>
        `<th style="padding:8px 10px;border:1px solid #e5e7eb;text-align:left;font-weight:700;color:#374151;font-size:12px;background:#f9fafb">${escapeHtml(h)}</th>`
      ).join("");
      const trs = t.rows.map((row, ri) => {
        const bg = ri % 2 === 0 ? "#fff" : "#f9fafb";
        return `<tr>${row.map(cell => `<td style="padding:6px 10px;border:1px solid #e5e7eb;font-size:12px;color:#111827;background:${bg}">${escapeHtml(cell)}</td>`).join("")}</tr>`;
      }).join("\n");
      return `<table style="width:100%;border-collapse:collapse;margin:12px 0">${caption}<thead><tr>${ths}</tr></thead><tbody>${trs}</tbody></table>`;
    }).join("\n");

    const notesBlock = input.notes?.length
      ? `<ul style="margin:8px 0;padding-left:18px;font-size:11px;color:#6b7280;line-height:1.6">${input.notes.map(n => `<li>${escapeHtml(n)}</li>`).join("")}</ul>`
      : "";

    return `<section style="margin-bottom:28px">
<h3 style="font-size:16px;font-weight:700;color:#111827;margin:0 0 6px 0">${escapeHtml(input.title)}</h3>
<p style="font-size:14px;color:#374151;line-height:1.6;margin:0 0 10px 0">${escapeHtml(input.lede)}</p>
${tableBlocks}
${notesBlock}
</section>`;
  }).join("\n");

  const allSources = [...new Set(inputs.flatMap(i => i.sources))];
  const sourcesText = allSources.map(s => escapeHtml(s)).join(", ");

  return `<article style="max-width:800px;font-family:Pretendard,sans-serif">
<h2 style="font-size:20px;font-weight:800;color:#111827;margin:0 0 4px 0">${escapeHtml(compositeTitle)}</h2>
<p style="font-size:12px;color:#9ca3af;margin:0 0 20px 0">${escapeHtml(compositeDate)} 기준 · ${inputs.length}개 데이터시트 통합</p>
${sections}
<footer style="font-size:11px;color:#9ca3af;line-height:1.7;margin-top:16px;padding-top:12px;border-top:1px solid #e5e7eb">
출처: ${sourcesText}
</footer>
</article>`;
}
