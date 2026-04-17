/*
 * GEO/AEO 콘텐츠 원칙 (frandoor 프로젝트)
 * - FAQ 답변 첫 문장은 반드시 수치로 시작
 * - Tistory: <style> 태그 금지 → 모두 inline style
 * - <script>는 JSON-LD만 허용
 * - grid 대신 flex 사용
 */

const comp = require('./components');
const { generateFAQSchema, generateOrgSchema, scriptTag } = require('./jsonld');

function render(postData) {
  const { meta, summary, sections, images, faqs, conclusion, disclaimer: disc, organization } = postData;
  const parts = [];

  // 1. JSON-LD scripts
  parts.push(scriptTag(generateFAQSchema(faqs)));
  parts.push(scriptTag(generateOrgSchema(organization)));

  // 2. Main container
  parts.push('<div style="max-width:100%;color:#222;font-family:-apple-system,\'Malgun Gothic\',sans-serif;line-height:1.8;font-size:16px;">');

  // 3. Summary box
  parts.push(comp.summaryBox(summary));

  // 4. Insert image after summary (afterSection=0)
  const imgAfter0 = images?.filter(img => img.afterSection === 0) ?? [];
  imgAfter0.forEach(img => parts.push(comp.image(img)));

  // 5. Sections
  sections.forEach((section, idx) => {
    parts.push(comp.h2(section.h2));
    if (section.intro) parts.push(comp.paragraph(section.intro));

    // Render body items
    (section.body || []).forEach(item => {
      switch (item.type) {
        case 'table': parts.push(comp.table(item)); break;
        case 'paragraph': parts.push(comp.paragraph(item.text)); break;
        case 'h3': parts.push(comp.h3(item.text)); break;
        case 'infoBox': parts.push(comp.infoBox(item.text)); break;
        case 'warnBox': parts.push(comp.warnBox(item.text)); break;
        case 'source': parts.push(comp.source(item.text)); break;
        case 'statRow': parts.push(comp.statRow(item.stats)); break;
      }
    });

    // Insert images after this section
    const sectionImages = images?.filter(img => img.afterSection === idx + 1) ?? [];
    sectionImages.forEach(img => parts.push(comp.image(img)));

    // Preview text
    if (section.preview) parts.push(comp.preview(section.preview));
  });

  // 6. FAQ section
  parts.push(comp.faqSection(faqs));

  // 7. Conclusion
  parts.push(comp.conclusionBox(conclusion));

  // 8. Disclaimer
  parts.push(comp.disclaimer(disc));

  parts.push('</div>');

  return parts.join('\n\n');
}

module.exports = { render };
