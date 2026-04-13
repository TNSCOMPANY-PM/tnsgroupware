function render(postData) {
  const { meta, summary, sections, faqs, conclusion, disclaimer: disc } = postData;
  const lines = [];

  // Title (use naver variant)
  lines.push(meta.titleVariants?.naver || meta.title);
  lines.push('');

  // 서론 (자연스러운 구어체 도입 3~5줄)
  lines.push(`${meta.brand} 창업을 고민하면서 실제 비용이 얼마인지 정리해봤습니다.`);
  lines.push(`아래 내용은 공정거래위원회 정보공개서와 본사 POS 데이터를 기반으로 작성했습니다.`);
  lines.push('');

  // Summary
  lines.push(`■ ${summary.label}`);
  // Strip HTML from headline
  lines.push(summary.headline.replace(/<[^>]*>/g, '').replace(/<br\s*\/?>/gi, '\n'));
  summary.bullets.forEach(b => lines.push(`  · ${b}`));
  lines.push('');

  // Sections
  sections.forEach(section => {
    lines.push(`★ ${section.h2}`);
    lines.push('');
    if (section.intro) { lines.push(section.intro); lines.push(''); }

    (section.body || []).forEach(item => {
      switch (item.type) {
        case 'h3':
          lines.push(`  ▶ ${item.text}`);
          break;
        case 'paragraph':
          lines.push(item.text);
          lines.push('');
          break;
        case 'table': {
          // Text-formatted table with | separators
          const allRows = [item.headers, ...item.rows.map(r => {
            if (Array.isArray(r)) return r;
            if (r.cells) return r.cells;
            return r;
          })];
          allRows.forEach((row, i) => {
            lines.push(row.join(' | '));
            if (i === 0) lines.push('-'.repeat(row.join(' | ').length));
          });
          lines.push('');
          break;
        }
        case 'infoBox':
          lines.push('[참고]');
          lines.push(item.text.replace(/<[^>]*>/g, '').replace(/<br\s*\/?>/gi, '\n'));
          lines.push('');
          break;
        case 'warnBox':
          lines.push('[주의]');
          lines.push(item.text.replace(/<[^>]*>/g, ''));
          lines.push('');
          break;
        case 'source':
          lines.push(item.text);
          lines.push('');
          break;
        case 'statRow':
          item.stats.forEach(s => {
            lines.push(`  ${s.label}: ${s.num}`);
          });
          lines.push('');
          break;
      }
    });

    if (section.preview) { lines.push(section.preview); lines.push(''); }
  });

  // FAQ
  lines.push('★ 자주 묻는 질문');
  lines.push('');
  faqs.forEach(faq => {
    lines.push(`Q. ${faq.q}`);
    lines.push(`A. ${faq.a}`);
    if (faq.note) lines.push(faq.note);
    if (faq.source) lines.push(faq.source);
    lines.push('');
  });

  // Conclusion
  lines.push('■ 마무리');
  lines.push(conclusion.body.replace(/<[^>]*>/g, '').replace(/<br\s*\/?>/gi, '\n'));
  lines.push('');
  lines.push(conclusion.ctaText);
  lines.push(conclusion.ctaUrl);
  lines.push('');

  // Disclaimer
  lines.push('---');
  disc.forEach(d => lines.push(d));
  lines.push('');

  // Source link
  if (meta.sourceUrl) {
    lines.push(`원문: ${meta.sourceUrl}`);
  }

  return lines.join('\n');
}

module.exports = { render };
