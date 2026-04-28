import type { GptFacts } from "@/lib/geo/schema";
import type { Depth, Fact, GeoPayload } from "@/lib/geo/types";

function normalizeKoreanNumbers(text: string): string {
  return text
    .replace(
      /(\d{1,3}(?:,\d{3})*|\d+)\s*억\s*(\d{1,3}(?:,\d{3})*|\d+)\s*만/gu,
      (_, eok: string, man: string) => {
        const eokN = parseInt(eok.replace(/,/g, ""), 10);
        const manN = parseInt(man.replace(/,/g, ""), 10);
        return `${eokN * 10000 + manN}만`;
      },
    )
    .replace(
      /(\d{1,3}(?:,\d{3})*|\d+)\s*억(?!\s*\d)/gu,
      (_, eok: string) => `${parseInt(eok.replace(/,/g, ""), 10) * 10000}만`,
    );
}

export type LintLevel = "ERROR" | "WARN";
export interface LintEntry {
  code: string;
  level: LintLevel;
  msg: string;
  where?: string;
}

export interface GeoLintInput {
  frontmatter: Record<string, unknown>;
  body: string;
  facts: GptFacts;
  depth?: Depth;
  canonicalUrl?: string;
  jsonLd?: Record<string, unknown>[];
}

export interface GeoLintOutput {
  ok: boolean;
  errors: LintEntry[];
  warns: LintEntry[];
}

// "약" 근사치 감지 — "계약/약관/약정/약속" 같은 복합어 오탐 회피.
// PR031: 프롬프트에서 "약·대략·정도·쯤" 전부 금지시켰으므로 린터는 여전히 "약 {숫자}" 패턴만 잡지만,
// "약 2년", "약 10개월" 같은 자연스러운 기간 표현도 근사치에 해당하므로 ERROR 유지. 프롬프트가 1차 방어, 린터가 2차 재시도 트리거.
const FORBIDDEN_YAK = /(?:^|[^가-힣])약\s*\d/u;
const FORBIDDEN = /(대략|정도|쯤|아마도|업계\s*관계자|많은\s*전문가들?)/u;
const FORBIDDEN_V2 = /(수령확인서|1\s*위|최고|추천|업계\s*1위)/u;
const DATE_RE = /(\d{4}-\d{2}|\d{4}년\s*\d{1,2}월)/u;
const AGENCY_RE = /(공정거래위원회|공정위|네이버\s*검색광고|공공데이터포털|식품의약품안전처|통계청)/u;
const URL_RE = /https?:\/\/[^\s)"']+/u;
const INTERNAL_LINK_RE = /\[([^\]]+)\]\((\/[^)]+)\)/gu;
const H1_RE = /^#\s/mu;
const H2_RE = /^##\s[^#]/gmu;
const INDICATORS_RE = /(실투자금|투자회수|순마진|업종\s*내\s*포지션|실질\s*폐점률)/gu;
const DERIVED_LABEL_RE = /\(frandoor\s*산출\)|frandoor\s*계산식\s*기반/u;
const FACT_KEY_TIMESERIES_DERIVED = new Set<string>([
  "frcs_growth",
  "frcs_multiplier",
  "annualized_pos_sales",
  "avg_sales_dilution",
]);
const C_TIER_FOOTER_RE = /(본사\s*집계|POS\s*집계|본사\s*공지|본사\s*홈페이지|본사\s*공개\s*자료|본사\s*자료|홈페이지에\s*발표|홈페이지에는)/u;
// L38 — 시스템 누출 문구 차단 (Sonnet 이 facts 부재를 그대로 본문에 누출하는 패턴)
const SYSTEM_LEAK_RE = /(데이터\s*부재|산출\s*불가|현재\s*입력\s*JSON|제공되지\s*않|포함되어\s*있지\s*않)/u;
// L39 — 섹션 끝 stake 문구. PR036: 리드젤랩 톤 도입 이후 존대체 연결어도 허용.
const STAKE_MARK_RE = /→\s*즉[,\s]|이는\s*곧\s*.+를?\s*의미합니다|한편\s.+도\s*함께\s*봐야|하지만\s*그\s*전에|이\s*점은\s*곧/u;
// L42 — 실점포명은 pos_monthly_summary.top3_stores / bottom3_stores 에서 lintForDepth opts 로 공급받음.

function str(v: unknown): string { return v == null ? "" : String(v); }
function arr(v: unknown): unknown[] { return Array.isArray(v) ? v : []; }

export function geoLint(input: GeoLintInput): GeoLintOutput {
  const { frontmatter: fm, body, facts } = input;
  const errors: LintEntry[] = [];
  const warns: LintEntry[] = [];

  // L01 금지어 (V1)
  const fMatch = body.match(FORBIDDEN);
  if (fMatch) errors.push({ code: "L01", level: "ERROR", msg: `금지어 발견: ${fMatch[0]}`, where: "body" });
  const yakMatch = body.match(FORBIDDEN_YAK);
  if (yakMatch) errors.push({ code: "L01", level: "ERROR", msg: `금지어 발견: 약(근사치)`, where: "body" });

  // L02 기준월
  if (!DATE_RE.test(body)) errors.push({ code: "L02", level: "ERROR", msg: "기준월(YYYY-MM) 미기재" });

  // L03 첫 H2 리드 숫자
  const firstH2Idx = body.search(H2_RE);
  const leadSlice = firstH2Idx >= 0 ? body.slice(firstH2Idx, firstH2Idx + 500) : body.slice(0, 500);
  const leadNums = (leadSlice.match(/\d[\d,]*(?:\.\d+)?/gu) ?? []).length;
  if (leadNums < 2) errors.push({ code: "L03", level: "ERROR", msg: `첫 H2 리드 숫자 ${leadNums}/2`, where: "body lead" });

  // L04 엔티티 정의 패턴
  if (!/(프랜차이즈|브랜드|업종)[\s\S]{0,80}(기준|출처|네이버|공정위)/u.test(leadSlice)) {
    errors.push({ code: "L04", level: "ERROR", msg: "첫 H2 리드에 엔티티 정의 패턴 없음", where: "body lead" });
  }

  // L05 기관명
  if (!AGENCY_RE.test(body)) errors.push({ code: "L05", level: "ERROR", msg: "본문에 기관명 없음" });

  // L06 URL
  const urlInBody = URL_RE.test(body);
  const urlInSources = arr(fm.sources).some((s) => URL_RE.test(str(s)));
  if (!urlInBody && !urlInSources) errors.push({ code: "L06", level: "ERROR", msg: "URL 출처 없음 (body + sources)" });

  // L07 H1 금지
  if (H1_RE.test(body)) errors.push({ code: "L07", level: "ERROR", msg: "H1 등장 (블로그 엔진이 title을 H1로 처리)" });

  // L08 H2 3~6
  const h2Count = (body.match(H2_RE) ?? []).length;
  if (h2Count < 3 || h2Count > 6) {
    (h2Count < 3 ? errors : warns).push({
      code: "L08",
      level: h2Count < 3 ? "ERROR" : "WARN",
      msg: `H2 개수 ${h2Count}개 (3~6)`,
    });
  }

  // L09 H3 orphan
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

  // L10 FAQ ≥ 2
  const faqList = arr(fm.faq);
  if (faqList.length < 2) errors.push({ code: "L10", level: "ERROR", msg: `FAQ ${faqList.length}개 (≥2)` });

  // L11 FAQ 숫자
  for (const [i, item] of faqList.entries()) {
    const a = str((item as { a?: string }).a);
    if (!/\d/.test(a)) errors.push({ code: "L11", level: "ERROR", msg: `FAQ #${i + 1} 답변에 숫자 없음` });
  }

  // L12 category
  if (!str(fm.category)) errors.push({ code: "L12", level: "ERROR", msg: "frontmatter.category 누락" });

  // L13 창업불가 뱃지
  if (/직영|외자\s*직영|❌/u.test(body)) {
    if (!/(직영|가맹\s*불가|❌)/u.test(body)) {
      errors.push({ code: "L13", level: "ERROR", msg: "창업불가 뱃지/사유 누락" });
    }
  }

  // L14 해석 가이드
  if (!/(의미하는|의미하지\s*않는|참고|유의)/u.test(body)) {
    warns.push({ code: "L14", level: "WARN", msg: "해석 가이드 블록 권장" });
  }

  // L15 마지막 H2 출처·집계
  const lastH2 = body.match(/^##\s+([^\n]+)$/gmu)?.slice(-1)[0] ?? "";
  if (!/(출처|집계)/u.test(lastH2)) warns.push({ code: "L15", level: "WARN", msg: "마지막 H2 '출처·집계 방식' 권장" });

  // L16 title 길이
  const title = str(fm.title);
  const titleLen = [...title].length;
  if (titleLen < 20 || titleLen > 60) warns.push({ code: "L16", level: "WARN", msg: `title 길이 ${titleLen}자 (20~60)` });

  // L17 description 길이
  const desc = str(fm.description);
  const descLen = [...desc].length;
  if (descLen < 60 || descLen > 150) warns.push({ code: "L17", level: "WARN", msg: `description 길이 ${descLen}자 (60~150)` });

  // L18 tags 3~5
  const tags = arr(fm.tags);
  if (tags.length < 3 || tags.length > 5) warns.push({ code: "L18", level: "WARN", msg: `tags 개수 ${tags.length}개 (3~5)` });

  // L19 thumbnail 상대경로
  const thumb = str(fm.thumbnail);
  if (thumb && !/^\/images\/[a-z0-9][a-z0-9-]*\.(jpg|jpeg|png|webp)$/i.test(thumb)) {
    errors.push({ code: "L19", level: "ERROR", msg: `thumbnail은 /images/*.jpg 상대경로만 허용: ${thumb.slice(0, 60)}` });
  }

  // L20 author
  if (!str(fm.author)) warns.push({ code: "L20", level: "WARN", msg: "author 메타 누락" });

  // L21 dateModified
  if (!str(fm.dateModified)) warns.push({ code: "L21", level: "WARN", msg: "dateModified 누락" });

  // L22 measurement_floor
  if (facts.measurement_floor) {
    if (!/(<\s*10|최소값|floor)/u.test(body)) {
      warns.push({ code: "L22", level: "WARN", msg: "measurement_floor true인데 본문에 표기 없음" });
    }
  }

  // L23 내부 링크
  const internalLinks = [...body.matchAll(INTERNAL_LINK_RE)].length;
  if (internalLinks < 3) warns.push({ code: "L23", level: "WARN", msg: `내부 링크 ${internalLinks}/3` });

  // L24 이중 소스
  const domains = new Set<string>();
  for (const f of facts.facts) {
    try { domains.add(new URL(f.source_url).hostname); } catch { /* noop */ }
  }
  if (domains.size < 2) errors.push({ code: "L24", level: "ERROR", msg: `facts 고유 도메인 ${domains.size}/2` });

  return { ok: errors.length === 0, errors, warns };
}

// V2 ─ depth별 lint 확장 (L25~L30, D3: L33~L42)
export type D3LintContext = {
  availableStoreNames?: string[];
  /** PR053 — primary 영역 수 (영역 매칭·누락 검증). */
  primaryAreaCount?: number;
  /** PR053 — area_sections_md 조립 개수 (실제 본문에 들어간 영역 H2 수). */
  areaSectionAssembled?: number;
  /** PR057 — 사용자 입력 topic (L73 검증용). */
  topic?: string | null;
  /** PR057 — ftc 매칭 시도 결과 (L74 검증용). null 미시도, false 미매칭, true 매칭. */
  ftcBrandMatched?: boolean | null;
  /** PR058 — docx 비교표 metric_id 매핑률 (L75 검증용). */
  mappingStats?: {
    total: number;
    high: number;
    medium: number;
    low: number;
    unmapped: number;
    high_pct: number;
    unmapped_pct: number;
  } | null;
  /** PR058 — docx vs ftc cross-check conflicts (L72 강화). */
  crossCheckConflicts?: Array<{
    metric_id: string;
    metric_label: string;
    docx_value: number;
    ftc_value: number;
    diff_pct: number;
  }>;
};

export function lintForDepth(
  depth: Depth,
  payload: GeoPayload,
  facts: GptFacts,
  opts: { canonicalUrl: string; jsonLd: Record<string, unknown>[]; d3?: D3LintContext },
): GeoLintOutput {
  // depth별 "frontmatter + body" 매핑
  let fm: Record<string, unknown> = {};
  let body = "";
  if (payload.kind === "markdown") {
    fm = payload.frontmatter;
    body = payload.body;
  } else if (payload.kind === "industryDoc") {
    fm = { category: "업종", faq: [], sources: [] };
    body = payload.sections.map((s) => `## ${s.heading}\n\n${s.body}`).join("\n\n");
  } else {
    fm = {
      category: "브랜드 상세",
      faq: payload.faq25,
      sources: [],
      title: payload.meta?.title ?? payload.sections[0]?.heading ?? "",
      description: payload.meta?.description ?? payload.sections[0]?.body?.slice(0, 120) ?? "",
      thumbnail: "",
      author: "프랜도어 편집팀",
      dateModified: new Date().toISOString().slice(0, 10),
      tags: payload.meta?.tags ?? [],
    };
    body = payload.sections.map((s) => `## ${s.heading}\n\n${s.body}`).join("\n\n");
  }

  const base = geoLint({ frontmatter: fm, body, facts, depth, canonicalUrl: opts.canonicalUrl, jsonLd: opts.jsonLd });
  const errors = [...base.errors];
  const warns = [...base.warns];

  // L25 금지어 V2
  const v2Match = body.match(FORBIDDEN_V2);
  if (v2Match) errors.push({ code: "L25", level: "ERROR", msg: `V2 금지어 발견: ${v2Match[0]}`, where: "body" });

  // L26 분량 — D3 는 1,500~3,000 WARN (ERROR 없음, PR036). 타 depth 는 최소 1,500.
  if (depth === "D3") {
    if (body.length < 1500) {
      warns.push({ code: "L26", level: "WARN", msg: `본문 ${body.length}자 < 권장 하한 1,500자` });
    } else if (body.length > 3000) {
      warns.push({ code: "L26", level: "WARN", msg: `본문 ${body.length}자 > 권장 상한 3,000자` });
    }
  } else {
    const minLen = depth === "D2" ? 2000 : 1500;
    if (body.length < minLen) {
      errors.push({ code: "L26", level: "ERROR", msg: `본문 ${body.length}자 < 최소 ${minLen}자 (depth=${depth})` });
    }
  }

  // L27 5대 지표 (D3만)
  if (depth === "D3") {
    const matched = new Set<string>();
    for (const m of body.matchAll(INDICATORS_RE)) matched.add(m[0]);
    if (matched.size < 3) {
      errors.push({ code: "L27", level: "ERROR", msg: `5대 지표 ${matched.size}/3 (D3 필수)` });
    }
  }

  // L28 Tier D 수치 출처 표기
  const hasDeriveds = (facts.deriveds?.length ?? 0) > 0;
  if (hasDeriveds && !DERIVED_LABEL_RE.test(body)) {
    errors.push({ code: "L28", level: "ERROR", msg: "Tier D 수치 있는데 '(frandoor 산출)' 라벨 누락" });
  }

  // L29 canonical self-ref
  const canonicalField = (fm.canonicalUrl ?? fm.canonical ?? opts.canonicalUrl) as string | undefined;
  if (!canonicalField || !canonicalField.startsWith("/")) {
    errors.push({ code: "L29", level: "ERROR", msg: `canonicalUrl 필드 누락 또는 잘못된 경로: ${canonicalField ?? "(없음)"}` });
  }

  // L30 JSON-LD 3종
  const types = new Set<string>();
  for (const ld of opts.jsonLd ?? []) {
    const t = (ld as { ["@type"]?: string })["@type"];
    if (t) types.add(t);
  }
  const needs = ["FAQPage", "BreadcrumbList"];
  const missing = needs.filter((t) => !types.has(t));
  if (missing.length > 0) {
    errors.push({ code: "L30", level: "ERROR", msg: `JSON-LD 누락: ${missing.join(", ")}` });
  }
  if (depth === "D3" && !types.has("FoodEstablishment") && !types.has("LocalBusiness")) {
    errors.push({ code: "L30", level: "ERROR", msg: "D3 전용 JSON-LD 누락: FoodEstablishment 또는 LocalBusiness" });
  }

  if (depth === "D3") {
    const h2Count = (body.match(H2_RE) ?? []).length;
    const l08w = warns.findIndex((w) => w.code === "L08");
    if (l08w >= 0 && h2Count >= 3 && h2Count <= 9) warns.splice(l08w, 1);
    const l08e = errors.findIndex((e) => e.code === "L08");
    if (l08e >= 0 && h2Count >= 3 && h2Count <= 9) errors.splice(l08e, 1);
  }

  const normalizedBody = normalizeKoreanNumbers(body);
  const citesValue = (raw: string | number): boolean => {
    const s = String(raw);
    if (body.includes(s)) return true;
    const normalized = normalizeKoreanNumbers(s);
    if (normalizedBody.includes(normalized)) return true;
    const digits = normalized.replace(/[^\d.]/g, "");
    if (digits && normalizedBody.replace(/,/g, "").includes(digits)) return true;
    return false;
  };

  if (depth === "D3") {
    const factsByKey = new Map<string, { tierA: Fact[]; tierC: Fact[] }>();
    for (const f of facts.facts as Fact[]) {
      if (!f.fact_key || !f.source_tier) continue;
      if (f.source_tier !== "A" && f.source_tier !== "C") continue;
      const bucket = factsByKey.get(f.fact_key) ?? { tierA: [], tierC: [] };
      if (f.source_tier === "A") bucket.tierA.push(f);
      else bucket.tierC.push(f);
      factsByKey.set(f.fact_key, bucket);
    }

    const hasA = (facts.facts as Fact[]).some((f) => f.source_tier === "A");
    if (hasA) {
      const aCited = (facts.facts as Fact[]).some((f) => f.source_tier === "A" && citesValue(f.value));
      if (!aCited) errors.push({ code: "L33", level: "ERROR", msg: "A급 팩트 존재하나 본문 인용 없음" });
    }

    for (const [key, { tierA, tierC }] of factsByKey) {
      if (tierA.length && tierC.length) {
        const aCited = tierA.some((f) => citesValue(f.value));
        const cCited = tierC.some((f) => citesValue(f.value));
        if (!(aCited && cCited)) {
          errors.push({ code: "L34", level: "ERROR", msg: `fact_key "${key}": A×C 페어 시계열 비교 누락` });
        }
      }
    }

    const hasCOnly = (facts.facts as Fact[]).some((f) => f.source_tier === "C");
    if (hasCOnly && !C_TIER_FOOTER_RE.test(body)) {
      errors.push({ code: "L35", level: "ERROR", msg: "C급 수치 인용 시 '본사 홈페이지/공개 자료/집계' 꼬리표 누락" });
    }

    const pickMonth = (f: Fact): string | undefined => f.period_month ?? f.year_month;
    const tierAMonths = new Set<string>();
    const tierCMonths = new Set<string>();
    for (const f of facts.facts as Fact[]) {
      const m = pickMonth(f);
      if (!m) continue;
      if (f.source_tier === "A") tierAMonths.add(m);
      else if (f.source_tier === "C") tierCMonths.add(m);
    }
    if (tierAMonths.size > 0) {
      const anyA = [...tierAMonths].some((m) => body.includes(m));
      if (!anyA) {
        errors.push({ code: "L36", level: "ERROR", msg: `A급 기준월 본문 미등장 (${[...tierAMonths].join(", ")})` });
      }
    }
    if (tierCMonths.size > 0) {
      const anyC = [...tierCMonths].some((m) => body.includes(m));
      if (!anyC) {
        errors.push({ code: "L36", level: "ERROR", msg: `C급 기준월 본문 미등장 (${[...tierCMonths].join(", ")})` });
      }
    }

    const tsDeriveds = (facts.deriveds ?? []).filter((d) => FACT_KEY_TIMESERIES_DERIVED.has(d.key));
    for (const d of tsDeriveds) {
      if (!citesValue(d.value)) {
        errors.push({ code: "L37", level: "ERROR", msg: `시계열 파생지표 ${d.key}(${d.value}) 본문 미인용` });
      }
    }

    // L38 시스템 누출 문구 차단
    const leak = body.match(SYSTEM_LEAK_RE);
    if (leak) {
      errors.push({ code: "L38", level: "ERROR", msg: `시스템 누출 문구: "${leak[0]}"` });
    }

    // L39 섹션당 stake 마커 ("→ 즉,") 최소 1회 — D3 만.
    // 체크리스트 / 출처·집계 섹션은 면제 (체크박스 nature 상 stake 마커 어색).
    if (payload.kind === "franchiseDoc") {
      const EXEMPT_RE = /(체크리스트|출처|집계\s*방식|레퍼런스)/u;
      const stakeMisses = payload.sections
        .filter((s) => !EXEMPT_RE.test(s.heading))
        .filter((s) => !STAKE_MARK_RE.test(s.body));
      if (stakeMisses.length > 0) {
        warns.push({
          code: "L39",
          level: "WARN",
          msg: `섹션 ${stakeMisses.length}개에 stake 마커 누락 ("→ 즉," 또는 리드젤랩 톤 연결어, 예: "${stakeMisses[0].heading}")`,
        });
      }
    }

    // L40 FAQ 3~5개 (D3 전용 상한)
    if (payload.kind === "franchiseDoc") {
      const n = payload.faq25.length;
      if (n < 3 || n > 5) {
        errors.push({ code: "L40", level: "ERROR", msg: `D3 FAQ ${n}개 (3~5 필수)` });
      }
    }

    // L47 메타 투명성 문장 반복 차단 (PR044): 포스트당 1회 한정.
    const META_RE = /(원본\s*수치와[^.\n]{0,40}공개|가리지\s*않[^.\n]{0,40}공개|(?:모두|나란히|양쪽\s*수치(?:를)?)\s*(?:함께\s*)?공개|투명[^.\n]{0,20}공개|공개[^.\n]{0,20}투명)/gu;
    const metaMatches = Array.from(body.matchAll(META_RE));
    if (metaMatches.length >= 2) {
      errors.push({
        code: "L47",
        level: "ERROR",
        msg: `메타 투명성 문장은 포스트당 1회 한정. ${metaMatches.length}회 등장: "${metaMatches.slice(0, 2).map((m) => m[0]).join(" | ")}"`,
        where: "body",
      });
    }

    // L48 A·C 갭 주변 원인 추측 단어 차단 (PR044).
    const CAUSE_GUESS = /(경기\s*(?:악화|침체|불황)|가격\s*인상\s*때문|브랜드\s*노후화|코로나|팬데믹\s*영향|업황\s*악화)/gu;
    const causeHits = Array.from(body.matchAll(CAUSE_GUESS));
    if (causeHits.length > 0) {
      errors.push({
        code: "L48",
        level: "ERROR",
        msg: `A·C 갭 원인 추측 금지: "${causeHits.slice(0, 3).map((m) => m[0]).join(", ")}" — 대체: "원인은 공개 수치로 특정 불가"`,
        where: "body",
      });
    }

    // L49 polarity 반전 (PR047): HTML 박스 클래스 본문 등장 금지.
    const HTML_BOX_RE = /class\s*=\s*"[^"]*(?:og-wrap|answer-box|stat-row|stat-box|info-box|warn|conclusion-box|formula-box)[^"]*"/u;
    const htmlBoxMatch = body.match(HTML_BOX_RE);
    if (htmlBoxMatch) {
      errors.push({
        code: "L49",
        level: "ERROR",
        msg: `HTML 박스 클래스 본문 등장 금지 (마크다운 평문/표/인용으로 대체): "${htmlBoxMatch[0]}"`,
        where: "body",
      });
    }

    // L50 섹션 헤더 질문/일상어 (PR045): 명사구 단독·격식 보고서 헤더 차단.
    if (payload.kind === "franchiseDoc") {
      const NOUN_HEADER_RE = /^(데이터\s*브리프|핵심\s*수치\s*요약|확장\s*추세\s*분석|재무\s*분석|관찰된\s*구조적\s*특징|수치\s*너머에서\s*읽히는\s*것들?|추가\s*확인\s*가능\s*항목|분석|브리프|정리|체크|리뷰)$/u;
      const NATURAL_TAIL_RE = /[?!?]|이유$|수준$|가능$|되나요$|어떨까$|만한가요?$|보면$|볼까요?$|읽힐까요?$|봐야|살펴|짚어/u;
      const headers = payload.sections.map((s) => s.heading.trim());
      const nounHeaders = headers.filter((h) => NOUN_HEADER_RE.test(h) || h.length < 5);
      const formalHeaders = headers.filter((h) => !NATURAL_TAIL_RE.test(h));
      if (nounHeaders.length > 0) {
        warns.push({
          code: "L50",
          level: "WARN",
          msg: `명사구·격식 헤더 ${nounHeaders.length}개: ${nounHeaders.slice(0, 3).join(" | ")}`,
        });
      }
      if (formalHeaders.length >= Math.ceil(headers.length / 2)) {
        warns.push({
          code: "L50",
          level: "WARN",
          msg: `H2 헤더 절반 이상 자연어 종결 누락 (질문형·관찰형 권장): ${formalHeaders.slice(0, 2).join(" | ")}`,
        });
      }
      // 섹션 끝 화살표 — 마지막 섹션 제외, 각 섹션 마지막 줄에 → 시작 라인.
      const sectionsExceptLast = payload.sections.slice(0, -1);
      const missingArrow = sectionsExceptLast.filter((s) => {
        const last = s.body.trim().split(/\n+/).pop()?.trim() ?? "";
        return !/^→\s/.test(last);
      });
      if (missingArrow.length > 0) {
        warns.push({
          code: "L50",
          level: "WARN",
          msg: `섹션 끝 화살표(→ ) 누락 ${missingArrow.length}개`,
        });
      }
    }

    // L51 결론 박스 단어·CTA 외부 링크 차단 (PR045 + PR046).
    const CONCLUSION_RE = /<div\s+(?:[^>]*?(?:class\s*=\s*"[^"]*conclusion-box[^"]*"|style\s*=\s*"[^"]*background\s*:\s*#1a3a5c)[^>]*?)>[\s\S]*?(?=<div\s+(?:[^>]*?class\s*=\s*"(?!cta)|[^>]*?style\s*=)|$)/u;
    const concMatch = body.match(/<div[^>]*?(?:conclusion-box|background\s*:\s*#1a3a5c)[\s\S]*?(?=\n\n|<\/article>|<h2|$)/u);
    if (concMatch) {
      const concText = concMatch[0];
      const SELF_PRAISE_IN_BOX = /(저희\s*프랜도어|프랜도어\s*데이터\s*기반|업계\s*최고\s*수준|독점\s*제공|본사\s*직접\s*연락)/u;
      const FORBIDDEN_WORDS_IN_BOX = /(추천|유리|매력적|최저)/u;
      if (SELF_PRAISE_IN_BOX.test(concText)) {
        warns.push({ code: "L51", level: "WARN", msg: "결론 박스에 자기과시·CTA 표현 등장" });
      }
      if (FORBIDDEN_WORDS_IN_BOX.test(concText)) {
        errors.push({ code: "L51", level: "ERROR", msg: "결론 박스에 우열·권유 단어 등장 (추천/유리/매력적/최저)" });
      }
      // 외부 링크 검사 (PR046 T6.4)
      const linkRe = /<a\s+[^>]*href\s*=\s*"([^"]+)"[^>]*>/gu;
      for (const m of concText.matchAll(linkRe)) {
        const href = m[1];
        const tag = m[0];
        try {
          const u = new URL(href);
          const hn = u.hostname.replace(/^www\./, "");
          const allowed = hn === "frandoor.co.kr" || hn.endsWith(".frandoor.co.kr") || hn.length > 0;
          if (!allowed) {
            errors.push({ code: "L51", level: "ERROR", msg: `결론 박스 외부 링크 도메인 부적절: ${hn}` });
          }
          if (!/rel\s*=\s*"[^"]*nofollow/.test(tag) || !/rel\s*=\s*"[^"]*noopener/.test(tag)) {
            warns.push({ code: "L51", level: "WARN", msg: `결론 박스 외부 링크 rel="nofollow noopener" 누락` });
          }
        } catch {
          warns.push({ code: "L51", level: "WARN", msg: `결론 박스 외부 링크 URL 파싱 실패: ${href}` });
        }
      }
    }
    void CONCLUSION_RE;

    // L52a → L59 로 통합 (PR047).

    // L56 시점 미스매치 차단 (PR046).
    // 한 문장 안에서 "공정위/정보공개서/{A_year}년/공시" 와 "본사/홈페이지/{C_year}년/발표" 그룹이 동시에 등장 + 비례·비율·합산 어휘 동반 시 WARN.
    // 단 "공개 자료로/특정 불가/기인할 가능성" 종결 어휘가 ±60자 안 동반되면 WARN 면제.
    if (payload.kind === "franchiseDoc") {
      const sentences = body.split(/(?<=[.?!])\s+|\n\n/);
      const A_GROUP = /(공정위|정보공개서|2023년|2024년|공시)/u;
      const C_GROUP = /(본사|홈페이지|2025년|2026년|발표)/u;
      const COMPOSE_OPS = /(비례|비율|배수|합산|차감|기준으로|\/\s*\d|\d개\s*\/|당\s*담당)/u;
      const ESCAPE_HATCH = /(공개\s*자료로|특정\s*불가|기인할\s*가능성|시점\s*차이를\s*감안)/u;
      const mismatchHits: string[] = [];
      for (const s of sentences) {
        if (!A_GROUP.test(s) || !C_GROUP.test(s)) continue;
        if (!COMPOSE_OPS.test(s)) continue;
        if (ESCAPE_HATCH.test(s)) continue;
        mismatchHits.push(s.trim().slice(0, 80));
      }
      if (mismatchHits.length > 0) {
        warns.push({
          code: "L56",
          level: "WARN",
          msg: `시점 다른 A·C 데이터 비례·합성 가능성 ${mismatchHits.length}건: "${mismatchHits[0]}..." — '공개 자료로 특정 불가' 종결 추가 권장`,
        });
      }
    }

    // L57 frandoor 산출 라벨 반복 차단 (PR047 강화: 산식 H2 섹션 후 본문 0회 강제).
    const FRANDOOR_LABEL = /\(\s*frandoor\s*산출\s*\)|frandoor\s*산출/giu;
    const FORMULA_H2 = /^##\s*이\s*글에서\s*계산한\s*값들/mu;
    const hasFormulaSection = FORMULA_H2.test(body);
    // 산식 H2 섹션 본문(블록 인용 다음 줄까지) 제거 후 라벨 카운트.
    let bodyExFormula = body;
    if (hasFormulaSection) {
      bodyExFormula = body.replace(/##\s*이\s*글에서\s*계산한\s*값들[\s\S]*?(?=\n##\s|$)/u, "");
    }
    const labelCount = Array.from(bodyExFormula.matchAll(FRANDOOR_LABEL)).length;
    if (hasFormulaSection && labelCount >= 1) {
      errors.push({
        code: "L57",
        level: "ERROR",
        msg: `산식 H2 섹션 도입 후 본문에 "frandoor 산출" 라벨 ${labelCount}회 등장 (PR047: 0회 강제)`,
      });
    } else if (!hasFormulaSection && labelCount > 5) {
      warns.push({
        code: "L57",
        level: "WARN",
        msg: `본문 "frandoor 산출" 라벨 ${labelCount}회 (5회 초과) — "## 이 글에서 계산한 값들" H2 섹션으로 정의 권장`,
      });
    }

    // L58 frontmatter 누락·필드 검증 (PR047).
    if (payload.kind === "franchiseDoc") {
      const fmRaw = payload.meta?.frontmatterYaml ?? "";
      if (!fmRaw || !fmRaw.startsWith("---")) {
        errors.push({ code: "L58", level: "ERROR", msg: "frontmatter YAML 블록 누락 (--- 시작 안 함)" });
      } else {
        const need = ["title", "description", "slug", "category", "date", "faq"];
        for (const k of need) {
          const re = new RegExp(`^${k}:`, "m");
          if (!re.test(fmRaw)) {
            errors.push({ code: "L58", level: "ERROR", msg: `frontmatter 필수 필드 "${k}" 누락` });
          }
        }
        const descMatch = fmRaw.match(/^description:\s*"?([^"\n]+)"?/m);
        if (descMatch && descMatch[1].length > 100) {
          warns.push({ code: "L58", level: "WARN", msg: `description ${descMatch[1].length}자 (100자 초과)` });
        }
        const slugMatch = fmRaw.match(/^slug:\s*"?([^"\n]+)"?/m);
        if (slugMatch && !/^[a-z0-9-]+$/.test(slugMatch[1])) {
          errors.push({ code: "L58", level: "ERROR", msg: `slug url-safe 아님: "${slugMatch[1]}"` });
        }
        const tags = (fmRaw.match(/^tags:\s*\n((?:\s+-\s+.*\n)+)/m)?.[1] ?? "")
          .split("\n")
          .filter((l) => l.trim().startsWith("- "));
        if (tags.length === 0) {
          warns.push({ code: "L58", level: "WARN", msg: "tags 0개" });
        }
        const faqCount = payload.faq25.length;
        if (faqCount === 0) errors.push({ code: "L58", level: "ERROR", msg: "faq 0개" });
        else if (faqCount < 3) warns.push({ code: "L58", level: "WARN", msg: `faq ${faqCount}개 (3~5 권장)` });
        else if (faqCount > 5) warns.push({ code: "L58", level: "WARN", msg: `faq ${faqCount}개 (5 초과)` });
      }
    }

    // L59 본문 진입 메타 안내·H2·화살표 (PR047).
    const lead800 = body.replace(/^---[\s\S]*?\n---\n?/, "").slice(0, 800);
    const META_LEAD_RE = /(여기서\s*끝내도\s*됩니다|시차가\s*있습니다|두\s*자료를\s*어떻게\s*읽어야)/u;
    if (!META_LEAD_RE.test(lead800)) {
      errors.push({
        code: "L59",
        level: "ERROR",
        msg: "본문 진입 메타 안내 문장 누락 ('여기서 끝내도 됩니다' / '시차가 있습니다' 패턴 중 1개 필수)",
      });
    }
    if (!/^##\s/.test(lead800.split("\n")[0] ?? "") && !/\n##\s/.test(lead800)) {
      errors.push({ code: "L59", level: "ERROR", msg: "본문 진입 첫 200자 안 H2 헤더 누락" });
    }
    if (!/→\s/.test(lead800)) {
      warns.push({ code: "L59", level: "WARN", msg: "본문 진입 화살표 진입 (→ ) 누락" });
    }

    // L72 PR056 — docx (__official_data__) vs xlsx (ftc_brands_2024) 핵심 수치 cross-check.
    // PR058 — metric_id 기반 conflicts 우선 (정확도 향상). fallback: legacy fact_key pair 검사.
    if (payload.kind === "franchiseDoc") {
      const stdConflicts = opts.d3?.crossCheckConflicts ?? [];
      if (stdConflicts.length > 0) {
        const head = stdConflicts[0];
        warns.push({
          code: "L72",
          level: "WARN",
          msg: `docx vs ftc 표준 metric cross-check 충돌 ${stdConflicts.length}건: ${head.metric_label} (id=${head.metric_id}) docx ${head.docx_value} vs ftc ${head.ftc_value}, 차이 ${head.diff_pct}%`,
        });
      } else {
        // legacy fact_key pair fallback (PR056 패턴 유지)
        const factList = facts.facts as Array<Record<string, unknown>>;
        const findValue = (key: string): number | null => {
          const f = factList.find((x) => x.fact_key === key);
          if (!f) return null;
          const raw = f.value;
          if (typeof raw === "number" && Number.isFinite(raw)) return raw;
          if (typeof raw === "string") {
            const cleaned = raw.replace(/[,\s만원%개건배호점]/g, "");
            const n = Number(cleaned);
            if (Number.isFinite(n)) return n;
          }
          return null;
        };
        const pairs = [
          { docxKey: "docx_stores_total", xlsxKey: "ftc2024_brand_stores", label: "가맹점 수" },
          { docxKey: "docx_avg_monthly_revenue", xlsxKey: "ftc2024_brand_revenue", label: "월평균매출" },
          { docxKey: "docx_cost_total", xlsxKey: "ftc2024_brand_cost", label: "창업비용" },
        ];
        const conflicts: string[] = [];
        for (const p of pairs) {
          const a = findValue(p.docxKey);
          const b = findValue(p.xlsxKey);
          if (a == null || b == null || a === 0) continue;
          const diffPct = Math.abs(((a - b) / a) * 100);
          if (diffPct >= 30) {
            conflicts.push(`${p.label} docx ${a} vs ftc ${b} (${Math.round(diffPct * 10) / 10}% 차이)`);
          }
        }
        if (conflicts.length > 0) {
          warns.push({
            code: "L72",
            level: "WARN",
            msg: `docx vs ftc2024 cross-check 충돌 (legacy) ${conflicts.length}건: ${conflicts[0]}`,
          });
        }
      }
    }

    // L75 PR058 — docx 비교표 metric_id 매핑률 검증.
    // unmapped 비율 ≥ 30% 또는 high 비율 < 50% 시 WARN.
    {
      const ms = opts.d3?.mappingStats;
      if (ms && ms.total >= 5) {
        if (ms.unmapped_pct >= 30) {
          warns.push({
            code: "L75",
            level: "WARN",
            msg: `표준 metric 매핑 부족 — unmapped ${ms.unmapped}/${ms.total} (${ms.unmapped_pct}%) ≥ 30% — alias 추가 또는 LLM fallback 활성 검토`,
          });
        } else if (ms.high_pct < 50) {
          warns.push({
            code: "L75",
            level: "WARN",
            msg: `표준 metric 매핑 정확도 낮음 — high ${ms.high}/${ms.total} (${ms.high_pct}%) < 50% — alias 정정 검토`,
          });
        }
      }
    }

    // L76 PR059 — ftc 가용한데 docx __official_data__ A급 facts 사용 검출.
    // ftcBrandMatched=true + facts 풀에 docx_* fact_key 의 source_title 에 "공정위 정보공개서" + "(frandoor 적재" 미포함 시 ERROR.
    {
      const matched = opts.d3?.ftcBrandMatched ?? null;
      if (matched === true) {
        const factList = facts.facts as Array<Record<string, unknown>>;
        // PR059 정책: ftc 매칭 시 A급 fact 의 source_title 은 모두 "공정위 정보공개서 2024 (frandoor 적재본)" 이어야 함.
        // docx __official_data__ 기반 fact 는 source_title 에 "frandoor 적재본" 미포함.
        const violations = factList.filter((f) => {
          if (f.source_tier !== "A") return false;
          const title = typeof f.source_title === "string" ? f.source_title : "";
          if (!title.includes("정보공개서")) return false;
          // ftc 적재본은 통과
          if (title.includes("frandoor 적재")) return false;
          // docx __official_data__ 기반 → 위반
          return true;
        });
        if (violations.length > 0) {
          const sample = violations[0];
          errors.push({
            code: "L76",
            level: "ERROR",
            msg: `ftc 가용한데 docx __official_data__ A급 사용 ${violations.length}건 (PR059 정책 위반): ${typeof sample.source_title === "string" ? sample.source_title : "?"} / ${typeof sample.fact_key === "string" ? sample.fact_key : "?"}`,
          });
        }
      }
    }

    // L73 PR057 — topic 무력화 검출.
    // topic 비어있지 않은데 제목·lede(첫 800자) 어디에도 topic 핵심 키워드 0건 매칭 시 WARN.
    {
      const topic = opts.d3?.topic ?? null;
      if (topic && topic.trim().length >= 2) {
        const topicNorm = topic.replace(/\s+/g, "");
        const keywords = topicNorm
          .split(/[^\p{Script=Hangul}A-Za-z0-9]+/u)
          .filter((k) => k.length >= 2);
        const title = String(((fm as { title?: unknown }).title) ?? "");
        const head = (body ?? "").slice(0, 1500);
        const haystack = `${title}\n${head}`.toLowerCase();
        const hasAny = keywords.some((k) => haystack.includes(k.toLowerCase())) ||
          /\bvs\b|비교|평균|대비|차이|창업비용|확장|폐점|매출/i.test(`${title}\n${head}`);
        if (!hasAny) {
          warns.push({
            code: "L73",
            level: "WARN",
            msg: `topic 무력화 — topic="${topic.slice(0, 30)}" 키워드가 제목·lede 어디에도 등장 안함`,
          });
        }
      }
    }

    // L74 PR057 — ftc 미가동 검출.
    // ftc 매칭 가능 brand 인데 facts 풀에 ftc2024_* fact 0건 시 WARN.
    {
      const matched = opts.d3?.ftcBrandMatched ?? null;
      if (matched === true) {
        const factList = facts.facts as Array<Record<string, unknown>>;
        const ftcFacts = factList.filter((f) => {
          const k = typeof f.fact_key === "string" ? f.fact_key : "";
          return k.startsWith("ftc2024_");
        });
        if (ftcFacts.length === 0) {
          warns.push({
            code: "L74",
            level: "WARN",
            msg: `ftc 미가동 — brand 매칭 ✓ but facts 풀에 ftc2024_* fact 0건 (industry/percentile/hq 모두 누락)`,
          });
        }
      }
    }

    // L71 PR055 — 본문 markdown 표 헤더/row 길이 mismatch 검사.
    if (payload.kind === "franchiseDoc") {
      const fullBody = payload.sections.map((s) => s.body).join("\n\n");
      // markdown 표 블럭 찾기 (헤더 + separator + data rows).
      const tableBlockRe = /(\|.+\|)\n\|\s*[-:| ]+\|\n((?:\|.+\|\n?)+)/g;
      let tm: RegExpExecArray | null;
      const mismatchCases: string[] = [];
      while ((tm = tableBlockRe.exec(fullBody)) !== null) {
        const headerCells = (tm[1].match(/\|/g) ?? []).length - 1;
        const rowLines = tm[2].trim().split(/\n/);
        for (const rl of rowLines) {
          const cellCount = (rl.match(/\|/g) ?? []).length - 1;
          if (cellCount !== headerCells) {
            mismatchCases.push(`헤더 ${headerCells} vs row ${cellCount}: ${rl.slice(0, 50)}`);
            break;
          }
        }
      }
      if (mismatchCases.length > 0) {
        errors.push({
          code: "L71",
          level: "ERROR",
          msg: `본문 표 헤더/row 길이 mismatch ${mismatchCases.length}건 (misalign 의심): ${mismatchCases[0]}`,
          where: "body",
        });
      }

      // L71b — 산문 단언 vs 표 셀 모순 휴리스틱 (단순 패턴, WARN 레벨).
      const ZERO_ASSERT = /(계약종료|계약해지|법위반|시정조치)\s*(?:은|는|이|가)?\s*(?:모두\s*)?0\s*건/gu;
      const zeroAssertions = new Set<string>();
      for (const am of fullBody.matchAll(ZERO_ASSERT)) zeroAssertions.add(am[1]);
      // 표 행에서 같은 metric 대응 셀이 0 이 아닌 양수면 모순 의심.
      const tableRowRe = /^\|([^|]+)\|([^|]+)\|/gm;
      const conflicts: string[] = [];
      for (const tm2 of fullBody.matchAll(tableRowRe)) {
        const metric = tm2[1].trim();
        const value = tm2[2].trim();
        if (!zeroAssertions.has(metric)) continue;
        const num = parseInt(value.replace(/[^\d]/g, ""), 10);
        if (Number.isFinite(num) && num > 0) {
          conflicts.push(`산문 "${metric} 0건" vs 표 "${metric}=${value}"`);
        }
      }
      if (conflicts.length > 0) {
        warns.push({
          code: "L71b",
          level: "WARN",
          msg: `산문-표 모순 의심 ${conflicts.length}건: ${conflicts.slice(0, 2).join(" | ")}`,
          where: "body",
        });
      }
    }

    // L70 PR054 — 영역 매핑 휴리스틱 부족 신호.
    // areaSectionAssembled === 0 && primaryAreaCount > 0 → docx 비교표가 모두 영역 매핑 실패했다는 신호.
    if (payload.kind === "franchiseDoc") {
      const assembled = opts.d3?.areaSectionAssembled ?? null;
      const primaryCount = opts.d3?.primaryAreaCount ?? null;
      if (primaryCount !== null && assembled !== null && primaryCount > 0 && assembled === 0) {
        warns.push({
          code: "L70",
          level: "WARN",
          msg: "primary 영역 ≥ 1개인데 area_sections 0개 조립 — docx 비교표·영역 매핑 휴리스틱 부족 신호 (확장 패턴 추가 권장)",
        });
      }
    }

    // L67/L69 PR053 — primary 영역 매칭·누락 검증.
    if (payload.kind === "franchiseDoc") {
      const primaryCount = opts.d3?.primaryAreaCount ?? null;
      const assembled = opts.d3?.areaSectionAssembled ?? null;
      if (primaryCount !== null && assembled !== null) {
        // 본문 H2 (lede·결론·산식·참고 자료 제외) 개수.
        const headers = payload.sections.map((s) => s.heading);
        const sectionCount = headers.length;
        const reservedH2 = 4; // lede + 결론 + 산식 + 참고자료 (대략 sections[0]~[4] 안에 분배되므로 비교 기준 느슨)
        if (primaryCount === 0 && assembled > 0) {
          errors.push({
            code: "L67",
            level: "ERROR",
            msg: `primary 영역 0개인데 area_sections ${assembled}개 조립됨 (모순)`,
          });
        }
        if (assembled > 0 && sectionCount < assembled) {
          warns.push({
            code: "L67",
            level: "WARN",
            msg: `area_sections ${assembled}개 조립됐으나 sections ${sectionCount}개 (영역 H2 부족 가능)`,
          });
        }
        if (assembled < primaryCount) {
          warns.push({
            code: "L69",
            level: "WARN",
            msg: `primary ${primaryCount}개 영역 중 ${assembled}개만 H2 조립 (비교표 보유분 한정 — ${primaryCount - assembled}개 영역 누락)`,
          });
        }
        void reservedH2;
      }
    }

    // L67/L68 PR052 — 비교표 비고 자연어 풀이 검증.
    if (payload.kind === "franchiseDoc") {
      // 본문 안 markdown 비교표 ("| 항목 | ... | 비고 |" 행 포함) 검출.
      const sectionsBody = payload.sections.map((s) => s.body).join("\n\n");
      const tableHeaderRe = /^\|\s*항목\s*\|[^\n]*비고\s*\|/gmu;
      let hasTable = false;
      let m: RegExpExecArray | null;
      while ((m = tableHeaderRe.exec(sectionsBody)) !== null) {
        hasTable = true;
        const tail = sectionsBody.slice(m.index + m[0].length, m.index + m[0].length + 400);
        if (!/(차이|일치|기준)/u.test(tail)) {
          warns.push({
            code: "L68",
            level: "WARN",
            msg: "비교표 직후 ±400자 안 비고 컬럼 자연어 풀이 (차이/일치/기준) 누락",
          });
          break;
        }
      }
      void hasTable;
    }

    // L66 PR051 — 공유 CTA 자기과시·광고 톤 차단 + 1회 한정.
    const SHARE_CTA_BAD = /(도움이?\s*되었?다면|도움이?\s*됐다면|공유\s*부탁|구독\s*부탁|저희?\s*글이?|저희?\s*프랜도어|프랜도어\s*데이터)/g;
    const ctaBadHits = Array.from(body.matchAll(SHARE_CTA_BAD)).map((m) => m[0]);
    if (ctaBadHits.length > 0) {
      errors.push({
        code: "L66",
        level: "ERROR",
        msg: `공유 CTA 자기과시·광고 톤 금지: "${ctaBadHits.slice(0, 3).join(", ")}" — '독자 → 다른 독자' 이타적 프레이밍 사용`,
        where: "body",
      });
    }
    // share-line 1회 한정.
    const SHARE_LINE_RE = /(이\s*글을\s*함께\s*보세요|이\s*정리를\s*전해주세요|함께\s*살펴봐도\s*좋습니다)/g;
    const shareCount = (body.match(SHARE_LINE_RE) ?? []).length;
    if (shareCount === 0 && payload.kind === "franchiseDoc") {
      warns.push({ code: "L66", level: "WARN", msg: "결론 박스 share-line 누락" });
    } else if (shareCount >= 2) {
      errors.push({
        code: "L66",
        level: "ERROR",
        msg: `share-line ${shareCount}회 등장 (1회 한정 — 2회+ 자기과시)`,
      });
    }

    // L65 PR050 — 실질폐점률·잘못된 산식·양도양수율 차단.
    // 명의변경은 폐점 아님. 산식 박스 안에서도 등장 시 ERROR (예외 없음).
    const FALSE_CLOSURE_TERMS = /실질\s*폐점률|계약종료\s*\+\s*(?:계약\s*)?해지\s*\+\s*명의변경|양도양수율/g;
    const closureHits = Array.from(body.matchAll(FALSE_CLOSURE_TERMS)).map((m) => m[0]);
    if (closureHits.length > 0) {
      errors.push({
        code: "L65",
        level: "ERROR",
        msg: `"실질폐점률" / "(계약종료 + 해지 + 명의변경)" / "양도양수율" 본문 사용 금지. 명의변경 ≠ 폐점 (PR050). 등장 ${closureHits.length}건: ${closureHits.slice(0, 3).join(", ")}`,
        where: "body",
      });
    }

    // L64/L64a PR049 — 산식 박스 코드 표현 차단 + 결과값 누락.
    if (payload.kind === "franchiseDoc") {
      const formulaSection = body.match(/##\s*이\s*글에서\s*계산한\s*값들[\s\S]*?(?=\n##\s|$)/m);
      if (formulaSection) {
        const sec = formulaSection[0];
        const FORMULA_CODE_LIKE = /(?:[ABC]급\s*\[|fact_key|frcs_cnt|source_tier|monthly_avg_sales|avg_annual_sales)/giu;
        const codeHits = Array.from(sec.matchAll(FORMULA_CODE_LIKE)).map((m) => m[0]);
        if (codeHits.length > 0) {
          errors.push({
            code: "L64",
            level: "ERROR",
            msg: `산식 박스에 코드 변수명 노출 ${codeHits.length}건: ${codeHits.slice(0, 3).join(", ")} — 사람 친화 라벨로 풀어쓸 것.`,
          });
        }
        // L64a 결과값 누락 — 표 행마다 ** ** 굵게 결과값 1개 + "=" 또는 인라인 리스트 형태에서 동일.
        const tableRows = sec
          .split("\n")
          .filter((l) => l.startsWith("| ") && !l.startsWith("| 지표") && !l.startsWith("|---"));
        const missingResult = tableRows.filter((r) => !/\*\*[^*]+\*\*/.test(r));
        if (tableRows.length > 0 && missingResult.length > 0) {
          warns.push({
            code: "L64a",
            level: "WARN",
            msg: `산식 박스 ${missingResult.length}행 결과값 누락 ('**결과** = 산식' 형태 권장)`,
          });
        }
      }
    }

    // L60/L61/L62/L63 PR048 가독성·정확도.
    if (payload.kind === "franchiseDoc") {
      // 인용 블록·표·코드 블록·리스트 행 제거 후 평문만 분석.
      const stripBlocks = (s: string): string => {
        let t = s;
        t = t.replace(/^```[\s\S]*?```$/gm, ""); // code fence
        t = t.replace(/^>.*$/gm, ""); // blockquote 행
        t = t.replace(/^\|.*\|$/gm, ""); // table 행
        t = t.replace(/^\s*[-*]\s+.*$/gm, ""); // markdown list 행 (- / *)
        t = t.replace(/^\s*\d+\.\s+.*$/gm, ""); // numbered list 행
        return t;
      };

      const sentenceSplit = (s: string): string[] => {
        // 숫자 안 마침표 (1.5배) 보존 — 마침표 다음에 공백/개행이어야 분리.
        return s
          .split(/(?<=[.!?])\s+|\n\n+/)
          .map((x) => x.trim())
          .filter((x) => x.length > 0 && /[가-힣A-Za-z]/.test(x));
      };

      // L60 한 문장 길이.
      const allLong: string[] = [];
      const allHuge: string[] = [];
      for (const s of payload.sections) {
        const text = stripBlocks(s.body);
        for (const sent of sentenceSplit(text)) {
          if (sent.length > 120) allHuge.push(sent.slice(0, 60));
          else if (sent.length > 80) allLong.push(sent.slice(0, 60));
        }
      }
      if (allHuge.length > 0) {
        errors.push({
          code: "L60",
          level: "ERROR",
          msg: `한 문장 120자 초과 ${allHuge.length}건: "${allHuge[0]}..."`,
        });
      } else if (allLong.length > 0) {
        warns.push({
          code: "L60",
          level: "WARN",
          msg: `한 문장 80자 초과 ${allLong.length}건: "${allLong[0]}..."`,
        });
      }

      // L61 두괄식 — 첫 H2 (lede) 외 각 섹션 첫 문장에 수치 1개+.
      const sections = payload.sections;
      for (let i = 1; i < sections.length; i++) {
        const text = stripBlocks(sections[i].body);
        const sentences = sentenceSplit(text);
        if (sentences.length === 0) continue;
        const first = sentences[0];
        const hasNumber = /\d/.test(first);
        if (!hasNumber) {
          warns.push({
            code: "L61",
            level: "WARN",
            msg: `섹션 "${sections[i].heading}" 첫 문장에 수치 없음 (두괄식 권장): "${first.slice(0, 50)}..."`,
          });
        }
        if (first.length > 80) {
          warns.push({
            code: "L61",
            level: "WARN",
            msg: `섹션 "${sections[i].heading}" 첫 문장 ${first.length}자 (두괄식 80자 이내 권장)`,
          });
        }
      }

      // L62 접속사 반복.
      const CONJUNCTIONS = ["또한", "한편", "그러나", "다만", "또", "그리고"];
      for (const s of sections) {
        const text = stripBlocks(s.body);
        for (const conj of CONJUNCTIONS) {
          const re = new RegExp(`(?:^|[\\s.,])${conj}(?=[\\s,])`, "gu");
          const count = (text.match(re) ?? []).length;
          if (conj === "한편" && count >= 4) {
            errors.push({
              code: "L62",
              level: "ERROR",
              msg: `섹션 "${s.heading}" 안 "한편" ${count}회 등장 (4회 이상 ERROR)`,
            });
          } else if (count >= 3) {
            warns.push({
              code: "L62",
              level: "WARN",
              msg: `섹션 "${s.heading}" 안 "${conj}" ${count}회 등장 (3회 이상 WARN)`,
            });
          }
        }
      }

      // L63 정량 수치 첫 등장 출처 검사 (lede 섹션 외).
      const SOURCE_KW = /(공정위|본사|KOSIS|식약처|frandoor)/u;
      const NUM_PAT = /\d+(?:,\d{3})*(?:\.\d+)?\s*(?:%|만원|억원|개월|호점|점포|배|건|개|평)/u;
      for (let i = 1; i < sections.length; i++) {
        const text = stripBlocks(sections[i].body);
        const sentences = sentenceSplit(text);
        // 첫 정량 수치 발견 시 해당 문장 또는 직전 1문장 안에 출처 키워드 검사.
        for (let j = 0; j < sentences.length; j++) {
          if (NUM_PAT.test(sentences[j])) {
            const ctx = sentences.slice(Math.max(0, j - 1), j + 1).join(" ");
            if (!SOURCE_KW.test(ctx)) {
              warns.push({
                code: "L63",
                level: "WARN",
                msg: `섹션 "${sections[i].heading}" 첫 정량 수치 등장 시 출처 키워드 누락: "${sentences[j].slice(0, 50)}..."`,
              });
            }
            break;
          }
        }
      }
    }

    // L52 제목 패턴 (PR045).
    const title = (payload.kind === "franchiseDoc" ? payload.meta?.title : undefined) ?? "";
    if (title) {
      if (/(데이터\s*브리프|한눈에\s*정리|총정리|가맹점\s*리뷰)/u.test(title)) {
        errors.push({ code: "L52", level: "ERROR", msg: `제목 금지 키워드 등장: "${title}"` });
      }
      if (title.length > 50) warns.push({ code: "L52", level: "WARN", msg: `제목 ${title.length}자 (50자 초과)` });
      if (title.length < 22) warns.push({ code: "L52", level: "WARN", msg: `제목 ${title.length}자 (22자 미만)` });
      if (!/\d/.test(title)) warns.push({ code: "L52", level: "WARN", msg: "제목에 수치 없음" });
      if (!/[—|]/.test(title)) warns.push({ code: "L52", level: "WARN", msg: "제목 구분자(— 또는 |) 없음" });
    }

    // L53 본문 5자리 만원 단독 차단 (PR045) — 박스/FAQ/표/참고자료 외 본문에서만.
    if (payload.kind === "franchiseDoc") {
      const FIVE_DIGIT_MANWON = /\b\d{1,3}(?:,\d{3}){2,}\s*만원\b/g;
      let bodyExBoxes = "";
      for (const s of payload.sections) {
        if (/참고\s*자료|데이터\s*출처/.test(s.heading)) continue;
        // 박스(<div ...>...</div>) 와 표(| ... |) 를 제거.
        let cleaned = s.body.replace(/<div[\s\S]*?<\/div>/g, "");
        cleaned = cleaned.replace(/^\|.*\|$/gm, "");
        bodyExBoxes += "\n" + cleaned;
      }
      const fiveDigitHits = Array.from(bodyExBoxes.matchAll(FIVE_DIGIT_MANWON)).map((m) => m[0]);
      if (fiveDigitHits.length > 0) {
        errors.push({
          code: "L53",
          level: "ERROR",
          msg: `본문 5자리 만원 단독 표기 ${fiveDigitHits.length}건 (1억 이상은 억원 표기): ${fiveDigitHits.slice(0, 3).join(", ")}`,
        });
      }
    }

    // L54 자기과시 어조 본문 차단 (PR045).
    const SELF_PRAISE_BODY = /(저희\s*프랜도어|프랜도어\s*데이터\s*기반|업계\s*최고\s*수준|독점\s*제공)/u;
    if (SELF_PRAISE_BODY.test(body)) {
      const m = body.match(SELF_PRAISE_BODY)?.[0] ?? "";
      errors.push({ code: "L54", level: "ERROR", msg: `자기과시 표현 본문 등장: "${m}"` });
    }

    // L55 1인칭 본사 톤 본문 차단 (PR045).
    const FIRST_PERSON_FRANCHISE = /(저희\s*매장|우리\s*매장|저희\s*가맹점)/u;
    if (FIRST_PERSON_FRANCHISE.test(body)) {
      const m = body.match(FIRST_PERSON_FRANCHISE)?.[0] ?? "";
      errors.push({ code: "L55", level: "ERROR", msg: `1인칭 본사 톤 본문 등장: "${m}"` });
    }

    // L44 판단·평가·지시 어구 본문 등장 금지 (PR038 팩트·비교 콘텐츠 전환).
    const BANNED_JUDGMENT = [
      "진입 가능", "조건부 가능", "판단 유보", "비권장",
      "권장합니다", "권장드립니다", "권장하지 않습니다",
      "추천합니다", "추천드립니다",
      "위험합니다", "안전합니다", "안정적입니다", "불안정합니다",
      "유의해야", "조심하셔야",
      "해야 합니다", "하셔야 합니다", "필수입니다", "선행되어야",
      "구간입니다", "판정입니다", "분류됩니다",
      "손실이 예상", "수익이 기대",
    ];
    const judgmentHits = BANNED_JUDGMENT.filter((w) => body.includes(w));
    if (judgmentHits.length > 0) {
      errors.push({
        code: "L44",
        level: "ERROR",
        msg: `판단·평가·지시 어구 ${judgmentHits.length}건 본문 등장: ${judgmentHits.slice(0, 5).join(", ")}`,
        where: "body",
      });
    }

    // L46 내부 ABC 등급 라벨 본문 등장 금지 (PR042).
    const BANNED_INTERNAL_LABELS: Array<{ re: RegExp; desc: string }> = [
      { re: /\*\*A급\*\*\s*=/, desc: "**A급** = ..." },
      { re: /\*\*B급\*\*\s*=/, desc: "**B급** = ..." },
      { re: /\*\*C급\*\*\s*=/, desc: "**C급** = ..." },
      { re: /^\s*-\s*A급\s*[=:]/m, desc: "- A급 = ..." },
      { re: /^\s*-\s*B급\s*[=:]/m, desc: "- B급 = ..." },
      { re: /^\s*-\s*C급\s*[=:]/m, desc: "- C급 = ..." },
      { re: /^\s*-\s*frandoor\s*산출\s*=/m, desc: "- frandoor 산출 = ..." },
      { re: /^\s*-\s*파생\s*지표\s*[=:]/m, desc: "- 파생 지표 = ..." },
      { re: /출처\s*등급\s*안내/, desc: "출처 등급 안내" },
      { re: /source_tier/, desc: "source_tier" },
      { re: /coverage\s*=/, desc: "coverage = ..." },
    ];
    const labelHits = BANNED_INTERNAL_LABELS.filter(({ re }) => re.test(body));
    if (labelHits.length > 0) {
      errors.push({
        code: "L46",
        level: "ERROR",
        msg: `내부 ABC 등급 라벨 본문 등장: ${labelHits.map((h) => h.desc).slice(0, 3).join(" | ")}`,
        where: "body",
      });
    }

    // L45 가상 출처 라벨 차단 (PR039): facts 풀에 없는 출처 라벨 본문 금지.
    // facts 풀의 source_title 에서 출처 루트("KOSIS", "식약처 ...") 를 추출해 허용 집합을 만든다.
    // 본문에서 "KOSIS ..." 또는 "식약처 ..." 로 시작하는 짧은 라벨을 감지하고,
    // 허용 집합에 속하지 않으면 가상 출처로 간주. "공정위 정보공개서" 는 본문 전반에 많이 등장하므로 검사 대상 제외.
    const allowKosis = facts.facts.some((f) => (f.source_title ?? "").includes("KOSIS"));
    const allowFoodsafety = facts.facts.some((f) => (f.source_title ?? "").includes("식약처"));
    const orphanTokens: string[] = [];
    if (!allowKosis && /KOSIS/.test(body)) orphanTokens.push("KOSIS (facts 풀에 미등장)");
    if (!allowFoodsafety && /식약처/.test(body)) orphanTokens.push("식약처 (facts 풀에 미등장)");
    // 임의 "{기관명} 통계" 조작 탐지.
    const fabrRe = /([가-힣A-Z]{2,8})\s*통계(?:에|을|를|가|는|\s)/gu;
    const seen = new Set<string>();
    for (const m of body.matchAll(fabrRe)) {
      const label = m[1];
      if (seen.has(label)) continue;
      seen.add(label);
      const matched = facts.facts.some((f) => (f.source_title ?? "").includes(label));
      if (!matched && !["공정위", "본사", "프랜도어"].includes(label)) {
        orphanTokens.push(`${label} 통계 (facts 풀에 미등장)`);
      }
    }
    if (orphanTokens.length > 0) {
      errors.push({
        code: "L45",
        level: "ERROR",
        msg: `facts 풀에 없는 출처 라벨 본문 등장 ${orphanTokens.length}건: ${orphanTokens.slice(0, 3).join(" | ")}`,
        where: "body",
      });
    }

    // L42 실점포명 본문 등장 금지 (PR031 hotfix). opts.d3.availableStoreNames 는 원본 점포명 세트.
    // 1회라도 본문에 매칭되면 ERROR. 2음절 미만은 오탐 많음 → 스킵.
    const storeNames = opts.d3?.availableStoreNames ?? [];
    for (const name of storeNames) {
      if (!name || name.length < 2) continue;
      const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const re = new RegExp(`(?<![가-힣])${escaped}(?![가-힣])`, "u");
      if (re.test(body)) {
        errors.push({ code: "L42", level: "ERROR", msg: `실점포명 본문 등장 금지: "${name}"`, where: "body" });
      }
    }

    // L43 body number pool check (PR033) — 본문 숫자가 facts pool 또는 허용 상수에 있어야 함.
    // 허용 예외: 0~10, 12, 24, 100 (시간·일반 상수), 연도(4자리 1900~2099), YYYY-MM 조각.
    const ALLOW_TRIVIAL = new Set([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 12, 24, 100]);
    const poolNums = new Set<number>();
    const addToPool = (v: unknown) => {
      const n = typeof v === "number" ? v : parseFloat(String(v).replace(/[,\s]/g, ""));
      if (Number.isFinite(n)) poolNums.add(n);
    };
    for (const f of facts.facts as Fact[]) addToPool(f.value);
    for (const d of facts.deriveds ?? []) addToPool(d.value);
    // facts.value 의 입력 숫자 (inputs) 도 허용
    for (const d of facts.deriveds ?? []) {
      for (const v of Object.values(d.inputs ?? {})) addToPool(v);
    }
    const isDerivable = (n: number): boolean => {
      const arr = Array.from(poolNums);
      for (let i = 0; i < arr.length; i++) {
        for (let j = 0; j < arr.length; j++) {
          if (i === j) continue;
          const a = arr[i], b = arr[j];
          if (b !== 0) {
            if (Math.abs(a / b - n) < 0.05) return true;
            if (Math.abs((a / b) * 100 - n) < 0.5) return true;
            if (Math.abs(((a - b) / b) * 100 - n) < 0.5) return true;
          }
          if (Math.abs(a - b - n) < 0.5) return true;
          if (Math.abs(a + b - n) < 0.5) return true;
        }
      }
      return false;
    };
    const numMatches = [...body.matchAll(/\b\d{1,3}(?:,\d{3})+(?:\.\d+)?|\b\d+(?:\.\d+)?\b/g)];
    const bodyNumsRaw = numMatches.map((m) => parseFloat(m[0].replace(/,/g, ""))).filter((n) => Number.isFinite(n));
    const unmatched: number[] = [];
    for (const n of bodyNumsRaw) {
      if (ALLOW_TRIVIAL.has(n)) continue;
      if (n >= 1900 && n <= 2099 && Number.isInteger(n)) continue; // 연도
      if (poolNums.has(n)) continue;
      if (isDerivable(n)) continue;
      unmatched.push(n);
    }
    if (unmatched.length > 5) {
      errors.push({
        code: "L43",
        level: "ERROR",
        msg: `facts 풀 외 수치 ${unmatched.length}건 (상위 5: ${[...new Set(unmatched)].slice(0, 5).join(", ")})`,
        where: "body",
      });
    } else if (unmatched.length > 0) {
      warns.push({
        code: "L43",
        level: "WARN",
        msg: `facts 풀 외 수치 ${unmatched.length}건 (${[...new Set(unmatched)].slice(0, 3).join(", ")})`,
        where: "body",
      });
    }
  }

  if (depth !== "D3") {
    const cCited = (facts.facts as Fact[]).some((f) => f.source_tier === "C" && citesValue(f.value));
    if (cCited) {
      errors.push({ code: "L33", level: "ERROR", msg: `C급 수치는 D3 전용 (현재 depth=${depth})` });
    }
  }

  // PR030: D3 새 프롬프트는 보이스 중심이라 L06(raw URL)/L27(5대 지표 3+)/L37(ts derived 본문 인용 강제) 가
  // 의도와 충돌. D3 에서는 ERROR → WARN 으로 강등.
  const D3_DEMOTE = new Set(["L06", "L27", "L37"]);
  const demotedWarns: LintEntry[] = [];
  const filteredErrors = errors.filter((e) => {
    if (depth === "D0" || depth === "D1") {
      if (e.code === "L27") return false;
    }
    if (depth === "D2") {
      if (e.code === "L27") return false;
    }
    if (depth === "D3" && D3_DEMOTE.has(e.code)) {
      demotedWarns.push({ ...e, level: "WARN" });
      return false;
    }
    return true;
  });
  warns.push(...demotedWarns);

  return { ok: filteredErrors.length === 0, errors: filteredErrors, warns };
}

// Back-compat alias (runA 등이 기대하는 반환명)
export type LintResult = LintEntry;
