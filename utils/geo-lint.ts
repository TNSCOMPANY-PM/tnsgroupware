import type { GptFacts } from "@/lib/generators/A/schema";

export type LintLevel = "ERROR" | "WARN";
export interface LintResult {
  code: string;
  level: LintLevel;
  msg: string;
  where?: string;
}

export interface GeoLintInput {
  frontmatter: Record<string, unknown>;
  body: string;
  facts: GptFacts;
}

export interface GeoLintOutput {
  ok: boolean;
  errors: LintResult[];
  warns: LintResult[];
}

const FORBIDDEN = /(약|대략|정도|쯤|아마도|업계\s*관계자|많은\s*전문가들?)/u;
const DATE_RE = /(\d{4}-\d{2}|\d{4}년\s*\d{1,2}월)/u;
const AGENCY_RE = /(공정거래위원회|공정위|네이버\s*검색광고|공공데이터포털|식품의약품안전처|통계청)/u;
const URL_RE = /https?:\/\/[^\s)\"']+/u;
const INTERNAL_LINK_RE = /\[([^\]]+)\]\((\/[^)]+)\)/gu;
const H1_RE = /^#\s/mu;
const H2_RE = /^##\s[^#]/gmu;

function str(v: unknown): string { return v == null ? "" : String(v); }
function arr(v: unknown): unknown[] { return Array.isArray(v) ? v : []; }

export function geoLint(input: GeoLintInput): GeoLintOutput {
  const { frontmatter: fm, body, facts } = input;
  const errors: LintResult[] = [];
  const warns: LintResult[] = [];

  // L01
  const fMatch = body.match(FORBIDDEN);
  if (fMatch) errors.push({ code: "L01", level: "ERROR", msg: `금지어 발견: ${fMatch[0]}`, where: "body" });

  // L02
  if (!DATE_RE.test(body)) errors.push({ code: "L02", level: "ERROR", msg: "기준월(YYYY-MM) 미기재" });

  // L03
  const firstH2Idx = body.search(H2_RE);
  const leadSlice = firstH2Idx >= 0 ? body.slice(firstH2Idx, firstH2Idx + 500) : body.slice(0, 500);
  const leadNums = (leadSlice.match(/\d[\d,]*(?:\.\d+)?/gu) ?? []).length;
  if (leadNums < 2) errors.push({ code: "L03", level: "ERROR", msg: `첫 H2 리드 숫자 ${leadNums}/2`, where: "body lead" });

  // L04 - 엔티티 정의 패턴
  if (!/(프랜차이즈|브랜드|업종)[\s\S]{0,80}(기준|출처|네이버|공정위)/u.test(leadSlice)) {
    errors.push({ code: "L04", level: "ERROR", msg: "첫 H2 리드에 엔티티 정의 패턴 없음", where: "body lead" });
  }

  // L05
  if (!AGENCY_RE.test(body)) errors.push({ code: "L05", level: "ERROR", msg: "본문에 기관명 없음" });

  // L06
  const urlInBody = URL_RE.test(body);
  const urlInSources = arr(fm.sources).some((s) => URL_RE.test(str(s)));
  if (!urlInBody && !urlInSources) errors.push({ code: "L06", level: "ERROR", msg: "URL 출처 없음 (body + sources)" });

  // L07
  if (H1_RE.test(body)) errors.push({ code: "L07", level: "ERROR", msg: "H1 등장 (블로그 엔진이 title을 H1로 처리)" });

  // L08
  const h2Count = (body.match(H2_RE) ?? []).length;
  if (h2Count < 3 || h2Count > 6) {
    (h2Count < 3 ? errors : warns).push({
      code: "L08",
      level: h2Count < 3 ? "ERROR" : "WARN",
      msg: `H2 개수 ${h2Count}개 (3~6)`,
    });
  }

  // L09 - orphan H3
  const lines = body.split(/\r?\n/);
  let underH2 = false;
  for (const line of lines) {
    if (/^##\s[^#]/u.test(line)) underH2 = true;
    else if (/^#{1}\s/.test(line)) underH2 = false;
    if (/^###\s/.test(line) && !underH2) {
      errors.push({ code: "L09", level: "ERROR", msg: "H3 orphan (상위 H2 없음)" });
      break;
    }
  }

  // L10
  const faqList = arr(fm.faq);
  if (faqList.length < 2) errors.push({ code: "L10", level: "ERROR", msg: `FAQ ${faqList.length}개 (≥2)` });

  // L11
  for (const [i, item] of faqList.entries()) {
    const a = str((item as { a?: string }).a);
    if (!/\d/.test(a)) errors.push({ code: "L11", level: "ERROR", msg: `FAQ #${i + 1} 답변에 숫자 없음` });
  }

  // L12 - 매트릭스 준수는 호출자(pipeline)에서 matrix-guard로 선검증 필수. 여기선 category 존재 확인만.
  if (!str(fm.category)) errors.push({ code: "L12", level: "ERROR", msg: "frontmatter.category 누락" });

  // L13 - 창업불가 브랜드 뱃지 (발견 시 체크)
  if (/직영|외자\s*직영|❌/u.test(body)) {
    if (!/(직영|가맹\s*불가|❌)/u.test(body)) {
      errors.push({ code: "L13", level: "ERROR", msg: "창업불가 뱃지/사유 누락" });
    }
  }

  // L14
  if (!/(의미하는|의미하지\s*않는|참고|유의)/u.test(body)) {
    warns.push({ code: "L14", level: "WARN", msg: "해석 가이드 블록 권장" });
  }

  // L15
  const lastH2 = body.match(/^##\s+([^\n]+)$/gmu)?.slice(-1)[0] ?? "";
  if (!/(출처|집계)/u.test(lastH2)) warns.push({ code: "L15", level: "WARN", msg: "마지막 H2 '출처·집계 방식' 권장" });

  // L16
  const title = str(fm.title);
  const titleLen = [...title].length;
  if (titleLen < 20 || titleLen > 60) warns.push({ code: "L16", level: "WARN", msg: `title 길이 ${titleLen}자 (20~60)` });

  // L17
  const desc = str(fm.description);
  const descLen = [...desc].length;
  if (descLen < 60 || descLen > 150) warns.push({ code: "L17", level: "WARN", msg: `description 길이 ${descLen}자 (60~150)` });

  // L18
  const tags = arr(fm.tags);
  if (tags.length < 3 || tags.length > 5) warns.push({ code: "L18", level: "WARN", msg: `tags 개수 ${tags.length}개 (3~5)` });

  // L19
  const thumb = str(fm.thumbnail);
  if (thumb && !/^https:\/\/(images\.unsplash\.com|cdn\.|[\w-]+\.frandoor\.)/.test(thumb)) {
    warns.push({ code: "L19", level: "WARN", msg: `thumbnail 도메인 확인: ${thumb.slice(0, 40)}` });
  }

  // L20
  if (!str(fm.author)) warns.push({ code: "L20", level: "WARN", msg: "author 메타 누락" });

  // L21
  if (!str(fm.dateModified)) warns.push({ code: "L21", level: "WARN", msg: "dateModified 누락" });

  // L22
  if (facts.measurement_floor) {
    if (!/(<\s*10|최소값|floor)/u.test(body)) {
      warns.push({ code: "L22", level: "WARN", msg: "measurement_floor true인데 본문에 표기 없음" });
    }
  }

  // L23
  const internalLinks = [...body.matchAll(INTERNAL_LINK_RE)].length;
  if (internalLinks < 3) warns.push({ code: "L23", level: "WARN", msg: `내부 링크 ${internalLinks}/3` });

  // L24 - 이중 소스 (고유 도메인 ≥ 2)
  const domains = new Set<string>();
  for (const f of facts.facts) {
    try { domains.add(new URL(f.source_url).hostname); } catch { /* noop */ }
  }
  if (domains.size < 2) errors.push({ code: "L24", level: "ERROR", msg: `facts 고유 도메인 ${domains.size}/2` });

  return { ok: errors.length === 0, errors, warns };
}
