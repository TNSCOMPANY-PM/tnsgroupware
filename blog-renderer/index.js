/**
 * frandoor 블로그 렌더러 — 통합 진입점
 *
 * 사용법 (모듈):
 *   const renderer = require('./blog-renderer');
 *   const result = await renderer.render(postData);
 *   // result.tistory  — Tistory HTML (인라인 스타일)
 *   // result.frandoor — frandoor 블로그 HTML (semantic + JSON-LD)
 *   // result.naver    — 네이버 블로그 텍스트
 *   // result.medium   — Medium 영문 HTML (Claude 번역)
 *
 * 사용법 (CLI):
 *   node blog-renderer/index.js blog-renderer/data/example-post.js
 *   node blog-renderer/index.js blog-renderer/data/example-post.js --skip-medium
 */

const fs = require('fs');
const path = require('path');

const tistory = require('./templates/tistory');
const frandoor = require('./templates/frandoor');
const naver = require('./templates/naver');
const medium = require('./templates/medium');

// ─── Validate ────────────────────────────────────────────
function validate(html, platform) {
  const issues = [];

  if (platform === 'tistory') {
    if (/<style[\s>]/i.test(html)) issues.push('❌ <style> 태그 발견 — Tistory에서 텍스트로 출력됨');
    if (/class="/.test(html)) issues.push('⚠️  class 속성 발견 — 스타일 미적용될 수 있음');
    if (!html.includes('ld+json')) issues.push('❌ JSON-LD 없음 — AEO 최적화 누락');
  }

  if (platform === 'frandoor') {
    if (!html.includes('FAQPage')) issues.push('❌ FAQPage 스키마 없음');
    if (!html.includes('Article')) issues.push('❌ Article 스키마 없음');
    if (!html.includes('dateModified')) issues.push('❌ 수정일 없음 — AI 신뢰도 신호 누락');
  }

  const faqMatch = html.match(/"text"\s*:\s*"([^"]{5,50})/);
  if (faqMatch) {
    const firstChars = faqMatch[1];
    if (!/^[0-9총월연약평원가]/.test(firstChars)) {
      issues.push('⚠️  FAQ 첫 번째 답변이 수치로 시작하지 않을 수 있음');
    }
  }

  return { ok: issues.length === 0, issues };
}

// ─── Render (module export) ──────────────────────────────
async function render(postData, options = {}) {
  const skipMedium = options.skipMedium ?? false;

  const result = {
    tistory: tistory.render(postData),
    frandoor: frandoor.render(postData),
    naver: naver.render(postData),
    medium: null,
    validation: {},
  };

  result.validation.tistory = validate(result.tistory, 'tistory');
  result.validation.frandoor = validate(result.frandoor, 'frandoor');
  result.validation.naver = { ok: true, issues: [] };

  if (!skipMedium) {
    try {
      result.medium = await medium.render(postData);
      result.validation.medium = { ok: true, issues: [] };
    } catch (e) {
      result.validation.medium = { ok: false, issues: [`Medium 번역 실패: ${e.message}`] };
    }
  }

  return result;
}

module.exports = { render, validate };

// ─── CLI mode ────────────────────────────────────────────
if (require.main === module) {
  const args = process.argv.slice(2);
  const dataFile = args.find(a => !a.startsWith('--'));

  if (!dataFile) {
    console.error('사용법: node blog-renderer/index.js <data-file.js> [--skip-medium]');
    process.exit(1);
  }

  const skipMedium = args.includes('--skip-medium');
  const postData = require(path.resolve(dataFile));

  const slug = postData.meta.title
    .replace(/[^가-힣a-zA-Z0-9\s]/g, '')
    .trim()
    .split(/\s+/)
    .slice(0, 5)
    .join('-');

  const outDir = path.join(__dirname, 'output', slug);
  fs.mkdirSync(outDir, { recursive: true });

  console.log(`\n📝 블로그 렌더링: ${postData.meta.brand}`);

  render(postData, { skipMedium }).then(result => {
    fs.writeFileSync(path.join(outDir, 'tistory.html'), result.tistory, 'utf-8');
    fs.writeFileSync(path.join(outDir, 'frandoor.html'), result.frandoor, 'utf-8');
    fs.writeFileSync(path.join(outDir, 'naver.txt'), result.naver, 'utf-8');
    if (result.medium) fs.writeFileSync(path.join(outDir, 'medium.html'), result.medium, 'utf-8');

    for (const [p, v] of Object.entries(result.validation)) {
      if (v.ok) console.log(`  ✅ ${p} 검증 통과`);
      else v.issues.forEach(i => console.log(`  ${i}`));
    }

    console.log(`\n✅ 완료: output/${slug}/`);
  }).catch(e => {
    console.error('❌ 오류:', e.message);
    process.exit(1);
  });
}
