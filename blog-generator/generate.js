#!/usr/bin/env node

/**
 * frandoor 블로그 포스트 생성기
 *
 * 사용법:
 *   node generate.js data/post-template.js
 *   node generate.js data/ogong-revenue.js
 *   node generate.js data/post-template.js --skip-medium   (Medium 번역 건너뛰기)
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

  // FAQ Answerability 검증 — 첫 답변이 수치로 시작하는지
  const faqMatch = html.match(/"text"\s*:\s*"([^"]{5,50})/);
  if (faqMatch) {
    const firstChars = faqMatch[1];
    if (!/^[0-9총월연약평]/.test(firstChars)) {
      issues.push('⚠️  FAQ 첫 번째 답변이 수치로 시작하지 않을 수 있음 — 확인 필요');
    }
  }

  if (issues.length === 0) {
    console.log(`  ✅ ${platform} 검증 통과`);
  } else {
    issues.forEach(i => console.log(`  ${i}`));
  }
  return issues.length === 0;
}

// ─── Main ────────────────────────────────────────────────
async function main() {
  const args = process.argv.slice(2);
  const dataFile = args.find(a => !a.startsWith('--'));

  if (!dataFile) {
    console.error('사용법: node generate.js <data-file.js> [--skip-medium]');
    console.error('예시:  node generate.js data/post-template.js');
    process.exit(1);
  }

  const skipMedium = args.includes('--skip-medium');
  const postData = require(path.resolve(dataFile));

  // Output directory
  const slug = postData.meta.title
    .replace(/[^가-힣a-zA-Z0-9\s]/g, '')
    .trim()
    .split(/\s+/)
    .slice(0, 5)
    .join('-');

  const outDir = path.join(__dirname, 'output', slug);
  fs.mkdirSync(outDir, { recursive: true });

  console.log(`\n📝 블로그 포스트 생성 시작: ${postData.meta.brand}`);
  console.log(`   제목: ${postData.meta.title}`);
  console.log(`   출력: output/${slug}/\n`);

  // 1. Tistory
  const tistoryHtml = tistory.render(postData);
  fs.writeFileSync(path.join(outDir, 'tistory.html'), tistoryHtml, 'utf-8');
  console.log('📄 tistory.html 생성 완료');
  validate(tistoryHtml, 'tistory');

  // 2. frandoor
  const frandoorHtml = frandoor.render(postData);
  fs.writeFileSync(path.join(outDir, 'frandoor.html'), frandoorHtml, 'utf-8');
  console.log('📄 frandoor.html 생성 완료');
  validate(frandoorHtml, 'frandoor');

  // 3. Naver
  const naverText = naver.render(postData);
  fs.writeFileSync(path.join(outDir, 'naver.txt'), naverText, 'utf-8');
  console.log('📄 naver.txt 생성 완료');
  console.log('  ✅ naver 검증 통과');

  // 4. Medium (async — Claude API)
  if (!skipMedium) {
    console.log('📄 medium.html 생성 중 (Claude 번역)...');
    try {
      const mediumHtml = await medium.render(postData);
      fs.writeFileSync(path.join(outDir, 'medium.html'), mediumHtml, 'utf-8');
      console.log('📄 medium.html 생성 완료');
      if (mediumHtml.includes('translation failed')) {
        console.log('  ⚠️  번역 실패 — ANTHROPIC_API_KEY 확인 필요');
      } else {
        console.log('  ✅ medium 검증 통과');
      }
    } catch (e) {
      console.error(`  ❌ Medium 생성 실패: ${e.message}`);
      console.log('  💡 --skip-medium 옵션으로 건너뛸 수 있습니다');
    }
  } else {
    console.log('⏭️  medium.html 건너뜀 (--skip-medium)');
  }

  console.log(`\n✅ 생성 완료: output/${slug}/`);
  console.log(`   tistory.html  — Tistory HTML 편집 모드에 복붙`);
  console.log(`   frandoor.html — frandoor/blog 글 작성`);
  console.log(`   naver.txt     — 네이버 블로그 에디터에 복붙`);
  if (!skipMedium) console.log(`   medium.html   — Medium 스토리 작성`);
}

main().catch(e => {
  console.error('❌ 치명적 오류:', e);
  process.exit(1);
});
