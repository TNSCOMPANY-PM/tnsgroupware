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

// "약" 은 "계약/약관/약정/약속" 같은 복합어를 오탐하지 않도록, 앞이 Hangul 이 아니고 뒤에 공백+숫자 또는 바로 숫자가 오는 "근사치" 용례만 포착.
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
const C_TIER_FOOTER_RE = /(본사\s*집계|POS\s*집계|본사\s*공지)/u;
// L38 — 시스템 누출 문구 차단 (Sonnet 이 facts 부재를 그대로 본문에 누출하는 패턴)
const SYSTEM_LEAK_RE = /(데이터\s*부재|산출\s*불가|현재\s*입력\s*JSON|제공되지\s*않|포함되어\s*있지\s*않)/u;
// L39 — 섹션 끝 stake 문구
const STAKE_MARK_RE = /→\s*즉[,\s]/u;
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
  tier?: "T1" | "T2" | "T3";
  stance?: string;
  availableStoreNames?: string[];
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
      title: payload.sections[0]?.heading ?? "",
      description: payload.sections[0]?.body?.slice(0, 120) ?? "",
      thumbnail: "",
      author: "프랜도어 편집팀",
      dateModified: new Date().toISOString().slice(0, 10),
      tags: [],
    };
    body = payload.sections.map((s) => `## ${s.heading}\n\n${s.body}`).join("\n\n");
  }

  const base = geoLint({ frontmatter: fm, body, facts, depth, canonicalUrl: opts.canonicalUrl, jsonLd: opts.jsonLd });
  const errors = [...base.errors];
  const warns = [...base.warns];

  // L25 금지어 V2
  const v2Match = body.match(FORBIDDEN_V2);
  if (v2Match) errors.push({ code: "L25", level: "ERROR", msg: `V2 금지어 발견: ${v2Match[0]}`, where: "body" });

  // L26 최소 분량 — D3 는 tier 에 따라 가변 (T1=3000, T2=1800, T3=600)
  const minLen = (() => {
    if (depth === "D2") return 2000;
    if (depth === "D3") {
      const t = opts.d3?.tier;
      if (t === "T1") return 3000;
      if (t === "T2") return 1800;
      if (t === "T3") return 600;
    }
    return 1500;
  })();
  if (body.length < minLen) {
    errors.push({ code: "L26", level: "ERROR", msg: `본문 ${body.length}자 < 최소 ${minLen}자 (depth=${depth}${opts.d3?.tier ? `/${opts.d3.tier}` : ""})` });
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
      errors.push({ code: "L35", level: "ERROR", msg: "C급 수치 인용 시 '본사 집계/POS/공지' 꼬리표 누락" });
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

    // L39 섹션당 stake 마커 ("→ 즉,") 최소 1회 — D3 만
    if (payload.kind === "franchiseDoc") {
      const stakeMisses = payload.sections.filter((s) => !STAKE_MARK_RE.test(s.body));
      if (stakeMisses.length > 0) {
        errors.push({
          code: "L39",
          level: "ERROR",
          msg: `섹션 ${stakeMisses.length}개에 "→ 즉," stake 마커 누락 (예: "${stakeMisses[0].heading}")`,
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

    // L41 stance 필드 필수 — payload.meta.stance 또는 opts.d3.stance
    const metaStance = opts.d3?.stance;
    if (!metaStance || !["진입 가능", "조건부 가능", "판단 유보", "비권장"].includes(metaStance)) {
      errors.push({ code: "L41", level: "ERROR", msg: `stance 누락 또는 비허용값: "${metaStance ?? "(없음)"}"` });
    }

    // L42 실점포명 최소 3개 — T1/T2 만 (T3 면제), availableStoreNames 공급된 경우만
    const names = opts.d3?.availableStoreNames ?? [];
    const tierForL42 = opts.d3?.tier;
    if (names.length > 0 && (tierForL42 === "T1" || tierForL42 === "T2")) {
      const cited = names.filter((n) => body.includes(n));
      if (cited.length < 3) {
        errors.push({
          code: "L42",
          level: "ERROR",
          msg: `실점포명 ${cited.length}개 인용 (T1/T2 최소 3개). 후보: ${names.slice(0, 6).join(", ")}`,
        });
      }
    }
  }

  if (depth !== "D3") {
    const cCited = (facts.facts as Fact[]).some((f) => f.source_tier === "C" && citesValue(f.value));
    if (cCited) {
      errors.push({ code: "L33", level: "ERROR", msg: `C급 수치는 D3 전용 (현재 depth=${depth})` });
    }
  }

  const filteredErrors = errors.filter((e) => {
    if (depth === "D0" || depth === "D1") {
      if (e.code === "L27") return false;
    }
    if (depth === "D2") {
      if (e.code === "L27") return false;
    }
    return true;
  });

  return { ok: filteredErrors.length === 0, errors: filteredErrors, warns };
}

// Back-compat alias (runA 등이 기대하는 반환명)
export type LintResult = LintEntry;
