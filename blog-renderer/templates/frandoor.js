/*
 * GEO/AEO 콘텐츠 원칙 (frandoor.co.kr 블로그 렌더러)
 * - FAQ 답변 첫 문장은 반드시 수치로 시작
 * - <style> 태그 및 CSS 클래스 사용 가능 (Tistory와 다름)
 * - <script>는 JSON-LD만 허용
 * - 시맨틱 태그 사용: <article>, <nav>, <h1>~<h3>
 * - JSON-LD 3종: FAQPage + Organization + Article
 */

const comp = require('./components');
const { generateFAQSchema, generateOrgSchema, generateArticleSchema, scriptTag } = require('./jsonld');

function render(postData) {
  const { meta, summary, sections, images, faqs, conclusion, disclaimer: disc, organization } = postData;

  const bodyParts = [];
  bodyParts.push(comp.summaryBox(summary));
  const imgAfter0 = images?.filter(img => img.afterSection === 0) ?? [];
  imgAfter0.forEach(img => bodyParts.push(comp.image(img)));

  sections.forEach((section, idx) => {
    bodyParts.push(comp.h2(section.h2));
    if (section.intro) bodyParts.push(comp.paragraph(section.intro));
    (section.body || []).forEach(item => {
      switch (item.type) {
        case 'table': bodyParts.push(comp.table(item)); break;
        case 'paragraph': bodyParts.push(comp.paragraph(item.text)); break;
        case 'h3': bodyParts.push(comp.h3(item.text)); break;
        case 'infoBox': bodyParts.push(comp.infoBox(item.text)); break;
        case 'warnBox': bodyParts.push(comp.warnBox(item.text)); break;
        case 'source': bodyParts.push(comp.source(item.text)); break;
        case 'statRow': bodyParts.push(comp.statRow(item.stats)); break;
      }
    });
    const sectionImages = images?.filter(img => img.afterSection === idx + 1) ?? [];
    sectionImages.forEach(img => bodyParts.push(comp.image(img)));
    if (section.preview) bodyParts.push(comp.preview(section.preview));
  });
  bodyParts.push(comp.faqSection(faqs));
  bodyParts.push(comp.conclusionBox(conclusion));
  bodyParts.push(comp.disclaimer(disc));

  const bodyHTML = bodyParts.join('\n\n');

  return `<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${meta.title} | Frandoor</title>
  <meta name="description" content="${meta.description}">
  <meta name="robots" content="index, follow">
  <meta property="og:type" content="article">
  <meta property="og:title" content="${meta.title}">
  <meta property="og:description" content="${meta.description}">
  <meta property="og:site_name" content="Frandoor">
  <style>
    body { margin:0; padding:0; background:#fff; color:#222; font-family:-apple-system,'Malgun Gothic',sans-serif; }
    article { max-width:720px; margin:0 auto; padding:24px 16px 60px; line-height:1.8; }
    .breadcrumb { font-size:13px; color:#888; margin-bottom:24px; }
    .breadcrumb a { color:#2d7dd2; text-decoration:none; }
    .publish-info { font-size:13px; color:#aaa; margin-bottom:32px; }
  </style>
  ${scriptTag(generateFAQSchema(faqs))}
  ${scriptTag(generateOrgSchema(organization))}
  ${scriptTag(generateArticleSchema(meta, organization))}
</head>
<body>
  <article>
    <nav class="breadcrumb">
      <a href="https://frandoor.co.kr">Frandoor</a> &gt;
      <a href="https://frandoor.co.kr/blog">${meta.category}</a> &gt;
      <span>${meta.brand}</span>
    </nav>

    <h1 style="font-size:28px;font-weight:700;color:#1a3a5c;line-height:1.4;margin-bottom:8px;">${meta.title}</h1>
    <div class="publish-info">
      발행 ${meta.publishDate}${meta.updatedDate && meta.updatedDate !== meta.publishDate ? ` · 수정 ${meta.updatedDate}` : ''}
    </div>

    ${bodyHTML}
  </article>
</body>
</html>`;
}

module.exports = { render };
