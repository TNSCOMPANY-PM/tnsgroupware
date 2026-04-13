const Anthropic = require('@anthropic-ai/sdk');
const comp = require('./components');
const { generateFAQSchema, scriptTag } = require('./jsonld');

const fs = require('fs');
const path = require('path');

function loadEnv() {
  const envPath = path.join(__dirname, '..', '..', '.env.local');
  if (!fs.existsSync(envPath)) return;
  const lines = fs.readFileSync(envPath, 'utf-8').split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx < 0) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    const val = trimmed.slice(eqIdx + 1).trim().replace(/^['"]|['"]$/g, '');
    if (!process.env[key]) process.env[key] = val;
  }
}
loadEnv();

async function translateToEnglish(koreanText, context) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.warn('ANTHROPIC_API_KEY not set — Medium English translation skipped');
    return null;
  }

  const client = new Anthropic({ apiKey });
  const msg = await client.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 4000,
    messages: [{
      role: 'user',
      content: `Translate the following Korean franchise business article to fluent English.

Translation rules:
- 만원 amounts → use both ₩ and ~$USD (at 1 USD = 1,350 KRW)
- 가맹금 → Franchise Fee
- 교육비 → Training Fee
- 인테리어 → Interior/Renovation
- 보증금 → Deposit
- 로열티 → Royalty
- 공정거래위원회 → Korea Fair Trade Commission (KFTC)
- Keep all numbers exact
- Natural, professional English (not literal translation)
- Output HTML only (no markdown)

Context: ${context}

Korean text:
${koreanText}`
    }],
  });

  return msg.content[0]?.type === 'text' ? msg.content[0].text : null;
}

async function render(postData) {
  const { meta, summary, sections, faqs, conclusion, disclaimer: disc, organization } = postData;

  const koreanParts = [];
  koreanParts.push(`제목: ${meta.title}`);
  koreanParts.push(`요약: ${summary.headline.replace(/<[^>]*>/g, '')}`);
  summary.bullets.forEach(b => koreanParts.push(`- ${b}`));

  sections.forEach(s => {
    koreanParts.push(`\n## ${s.h2}`);
    if (s.intro) koreanParts.push(s.intro);
    (s.body || []).forEach(item => {
      if (item.type === 'paragraph') koreanParts.push(item.text);
      if (item.type === 'h3') koreanParts.push(`### ${item.text}`);
      if (item.type === 'infoBox' || item.type === 'warnBox') koreanParts.push(item.text.replace(/<[^>]*>/g, ''));
    });
  });

  faqs.forEach(f => {
    koreanParts.push(`Q: ${f.q}`);
    koreanParts.push(`A: ${f.a}`);
  });

  koreanParts.push(`결론: ${conclusion.body.replace(/<[^>]*>/g, '')}`);

  const koreanText = koreanParts.join('\n');
  const englishBody = await translateToEnglish(koreanText, `Franchise: ${meta.brand}, Category: ${meta.category}`);

  if (!englishBody) {
    return `<!-- Medium English translation failed. ANTHROPIC_API_KEY may not be set. -->\n<!-- Korean source included for manual translation -->\n${koreanText}`;
  }

  const title = meta.titleVariants?.medium || meta.title;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>${title}</title>
</head>
<body style="max-width:720px;margin:0 auto;padding:24px;font-family:Georgia,serif;line-height:1.8;color:#222;">
  <h1 style="font-size:32px;font-weight:700;line-height:1.3;">${title}</h1>
  <p style="font-size:14px;color:#888;">Published ${meta.publishDate} · Updated ${meta.updatedDate || meta.publishDate}</p>

  ${englishBody}

  <hr style="margin:32px 0;border:none;border-top:1px solid #ddd;">
  <p style="font-size:14px;color:#888;">
    For Korean-language details, visit <a href="https://frandoor.co.kr" style="color:#2d7dd2;">frandoor.co.kr</a>
    ${meta.sourceUrl ? `<br>Original article: <a href="${meta.sourceUrl}" style="color:#2d7dd2;">${meta.sourceUrl}</a>` : ''}
  </p>
</body>
</html>`;
}

module.exports = { render };
