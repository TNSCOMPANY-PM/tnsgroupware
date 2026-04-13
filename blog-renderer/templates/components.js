const C = {
  blue: "#2d7dd2",
  navy: "#1a3a5c",
  blueBg: "#f0f6ff",
  blueLight: "#f7faff",
  blueBorder: "#d0e4f7",
  green: "#3b6d11",
  red: "#e24b4a",
  redBg: "#fff3f3",
  gray: "#868e96",
  grayBg: "#f8f8f8",
  textMain: "#222",
  textBody: "#333",
  textSub: "#444",
  textLight: "#bbb",
};

function summaryBox({ label, headline, bullets }) {
  const bulletHtml = bullets
    .map(
      (b) =>
        `<li style="margin-bottom:6px;font-size:15px;line-height:1.7;color:${C.textBody}">${b}</li>`
    )
    .join("");
  return `<div style="background:${C.blueBg};border-left:4px solid ${C.blue};padding:24px;border-radius:12px;margin-bottom:24px">
<span style="font-size:13px;color:${C.blue};font-weight:600;letter-spacing:0.5px">${label}</span>
<h1 style="font-size:24px;font-weight:700;color:${C.navy};margin:8px 0 14px 0;line-height:1.4">${headline}</h1>
<ul style="margin:0;padding-left:20px;list-style:disc">${bulletHtml}</ul>
</div>`;
}

function h2(text) {
  return `<h2 style="border-left:4px solid ${C.blue};padding-left:14px;font-size:22px;font-weight:700;color:${C.navy};margin-top:48px;margin-bottom:16px">${text}</h2>`;
}

function h3(text) {
  return `<h3 style="font-size:17px;font-weight:600;color:${C.textBody};margin-top:28px;margin-bottom:10px">${text}</h3>`;
}

function paragraph(text) {
  return `<p style="font-size:16px;line-height:1.8;color:${C.textBody};margin-bottom:14px">${text}</p>`;
}

function infoBox(text) {
  return `<div style="background:${C.blueBg};border-left:4px solid ${C.blue};padding:18px 20px;border-radius:8px;font-size:15px;line-height:1.7;color:${C.textBody};margin-bottom:16px">${text}</div>`;
}

function warnBox(text) {
  return `<div style="background:${C.redBg};border-left:4px solid ${C.red};padding:18px 20px;border-radius:8px;font-size:14px;color:#666;margin-bottom:16px">${text}</div>`;
}

function source(text) {
  return `<p style="font-size:13px;color:${C.gray};margin-top:6px;margin-bottom:10px">${text}</p>`;
}

function preview(text) {
  return `<p style="font-size:15px;color:${C.blue};font-weight:500;margin:20px 0">${text}</p>`;
}

function table({ headers, rows }) {
  const thCells = headers
    .map(
      (h) =>
        `<th style="background:${C.blue};color:#fff;padding:10px 14px;font-size:14px;font-weight:600;text-align:left">${h}</th>`
    )
    .join("");

  const bodyRows = rows
    .map((row, rowIdx) => {
      const bgColor = rowIdx % 2 === 1 ? C.blueLight : "#fff";
      const isRowBold = !Array.isArray(row) && row.bold;
      const rowCells = Array.isArray(row) ? row : (row.cells || []);
      const cells = rowCells
        .map((cell, colIdx) => {
          let text = cell;
          let isBold = isRowBold;

          if (cell && typeof cell === "object" && cell.bold) {
            text = cell.text;
            isBold = true;
          } else if (typeof cell === "string" && cell.startsWith("__bold__ ")) {
            text = cell.replace("__bold__ ", "");
            isBold = true;
          }

          const isFirstCol = colIdx === 0;
          const fontWeight = isBold || isFirstCol ? "700" : "400";
          const color = isBold
            ? C.navy
            : isFirstCol
              ? C.blue
              : C.textBody;

          return `<td style="padding:10px 14px;border-bottom:1px solid #eee;font-size:14px;font-weight:${fontWeight};color:${color}">${text}</td>`;
        })
        .join("");
      return `<tr style="background:${bgColor}">${cells}</tr>`;
    })
    .join("");

  return `<table style="width:100%;border-collapse:collapse;margin-bottom:20px">
<thead><tr>${thCells}</tr></thead>
<tbody>${bodyRows}</tbody>
</table>`;
}

function statRow(stats) {
  const items = stats
    .map(
      (s) =>
        `<div style="min-width:140px;text-align:center;padding:16px">
<div style="font-size:28px;font-weight:700;color:${C.blue}">${s.number}</div>
<div style="font-size:13px;color:${C.gray};margin-top:4px">${s.label}</div>
</div>`
    )
    .join("");
  return `<div style="display:flex;flex-wrap:wrap;justify-content:center;margin-bottom:20px">${items}</div>`;
}

function image({ src, alt, title, caption }) {
  const altAttr = alt || title || "";
  const titleAttr = title ? ` title="${title}"` : "";
  const captionHtml = caption
    ? `<figcaption style="font-size:13px;color:${C.gray};text-align:center;margin-top:8px">${caption}</figcaption>`
    : "";
  return `<figure style="margin:20px 0">
<img src="${src}" alt="${altAttr}"${titleAttr} style="max-width:100%;border-radius:8px;display:block">
${captionHtml}
</figure>`;
}

function faqItem({ depth, q, a, note, source: src }, isLast) {
  const depthColors = { D3: C.blue, D2: C.green };
  const badgeBg = depthColors[depth] || C.gray;
  const badge = depth
    ? `<span style="display:inline-block;background:${badgeBg};color:#fff;font-size:12px;font-weight:600;padding:2px 8px;border-radius:4px;margin-right:8px">${depth}</span>`
    : "";

  const noteHtml = note
    ? `<p style="font-size:13px;color:${C.gray};margin-top:8px;margin-bottom:0">${note}</p>`
    : "";
  const sourceHtml = src
    ? `<p style="font-size:12px;color:${C.textLight};margin-top:4px;margin-bottom:0">${src}</p>`
    : "";
  const borderBottom = isLast
    ? ""
    : `border-bottom:1px solid #eee;`;

  return `<div style="padding:20px 0;${borderBottom}">
<p style="font-size:16px;font-weight:600;color:${C.navy};margin:0 0 10px 0">${badge}${q}</p>
<p style="font-size:15px;color:${C.textBody};line-height:1.7;margin:0">${a}</p>
${noteHtml}${sourceHtml}
</div>`;
}

function faqSection(faqs) {
  const items = faqs
    .map((faq, i) => faqItem(faq, i === faqs.length - 1))
    .join("");
  return `${h2("자주 묻는 질문")}
<div style="margin-bottom:24px">${items}</div>`;
}

function conclusionBox({ body, ctaText, ctaUrl, ctaLinkText }) {
  const ctaButton = ctaUrl
    ? `<a href="${ctaUrl}" style="display:inline-block;background:${C.blue};color:#fff;padding:12px 28px;border-radius:8px;font-weight:600;text-decoration:none;margin-top:20px">${ctaText || "자세히 보기"}</a>`
    : "";
  const linkHtml = ctaLinkText
    ? `<p style="font-size:13px;color:${C.textLight};margin-top:10px">${ctaLinkText}</p>`
    : "";
  return `<div style="background:${C.navy};color:#fff;border-radius:12px;padding:32px;margin-top:32px;margin-bottom:24px">
<p style="font-size:16px;line-height:1.8;color:#fff;margin:0">${body}</p>
${ctaButton}${linkHtml}
</div>`;
}

function disclaimer(items) {
  const content = items.join("<br>");
  return `<div style="background:${C.grayBg};padding:18px 20px;border-radius:8px;font-size:13px;color:${C.gray};line-height:1.6;margin-top:16px">${content}</div>`;
}

module.exports = {
  summaryBox,
  h2,
  h3,
  paragraph,
  infoBox,
  warnBox,
  source,
  preview,
  table,
  statRow,
  image,
  faqItem,
  faqSection,
  conclusionBox,
  disclaimer,
  C,
};
