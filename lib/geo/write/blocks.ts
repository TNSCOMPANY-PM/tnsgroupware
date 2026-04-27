/**
 * PR047 — HTML 박스 인프라 폐기.
 *
 * 회사 발행 가이드(가이드 문서)는 frontmatter + 순수 마크다운 본문 표준이며,
 * og-wrap/answer-box/stat-row/info-box/warn/conclusion-box/formula-box 등 HTML 박스는
 * 자동 발행 파이프라인 표준이 아니므로 전면 제거.
 *
 * 마크다운 본문 빌더는 lib/geo/write/lede.ts (buildLedeMarkdown / buildConclusionMarkdown / buildFormulaMarkdown) 에 있음.
 */

export {};
