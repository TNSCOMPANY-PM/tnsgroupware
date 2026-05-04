/**
 * v4-07 pipeline — 3 로빈 구조.
 *
 * Phase 1 (LLM1, haiku): /api/geo/facts-a
 *   ftc_row 152 컬럼 + industry_facts + topic → a_facts (정제 fact_groups + display + distribution + brand_position)
 *   DB INSERT (stage='facts_a_done')
 *
 * Phase 2 (LLM2, haiku): /api/geo/facts-c/[draft_id]
 *   brand_fact_data raw + a_facts (컨텍스트) → c_facts (정제 + ac_diff_analysis + c_only_facts)
 *   DB UPDATE (stage='facts_c_done')
 *
 * Phase 3 (LLM3, sonnet): /api/geo/write/[draft_id]
 *   a_facts + c_facts → body markdown
 *   post_process + crosscheck + lint
 *   DB UPDATE (stage='write_done')
 */

import "server-only";
import { createAdminClient } from "@/utils/supabase/admin";
import { createFrandoorClient } from "@/utils/supabase/frandoor";
import { callHaiku, callSonnet, extractJson } from "./claude";
import { buildLlm1Sysprompt, buildLlm1User } from "./sysprompts/llm1_facts_a";
import { buildLlm2Sysprompt, buildLlm2User } from "./sysprompts/llm2_facts_c";
import { buildWriterSysprompt, buildWriterUserPrompt } from "./sysprompts/writer";
import { postProcess } from "./post_process";
import { collectAllowedNumbers, crosscheckV4 } from "./crosscheck";
import { lintV4, lintV4Faq } from "./lint";
import type {
  AFactsResult,
  CFactsResult,
  DocxFact,
  RawInputBundle,
  V4Input,
  V4Result,
  V4Step1Response,
  V4Step2Response,
} from "./types";

// v4-02: markdown 통째 폐기 → fetchDocxFacts 사용. truncateDocxIfLarge 함수 제거.

export class FtcBrandIdMissingError extends Error {
  code = "FTC_BRAND_ID_MISSING";
  brandLabel: string | null;
  constructor(public brandId: string, brandLabel?: string | null) {
    super(`geo_brands.ftc_brand_id 미매핑 (brand_id=${brandId}, name=${brandLabel ?? "?"}). 매핑 후 재시도.`);
    this.name = "FtcBrandIdMissingError";
    this.brandLabel = brandLabel ?? null;
  }
}

export class FtcRowNotFoundError extends Error {
  code = "FTC_ROW_NOT_FOUND";
  constructor(public ftcBrandId: string) {
    super(`ftc_brands_2024 row not found: id=${ftcBrandId}`);
    this.name = "FtcRowNotFoundError";
  }
}

async function fetchBundle(input: V4Input): Promise<RawInputBundle> {
  const tns = createAdminClient();
  const fra = createFrandoorClient();

  // 1. geo_brands row
  const { data: brandRow, error: bErr } = await tns
    .from("geo_brands")
    .select("id, name, ftc_brand_id")
    .eq("id", input.brand_id)
    .maybeSingle();
  if (bErr) throw new Error(`geo_brands fetch: ${bErr.message}`);
  if (!brandRow) throw new Error(`geo_brand not found: ${input.brand_id}`);
  if (!brandRow.ftc_brand_id) {
    throw new FtcBrandIdMissingError(brandRow.id as string, brandRow.name as string | null);
  }
  const ftcBrandId = String(brandRow.ftc_brand_id);

  // 2. ftc_brands_2024 row 통째 (152 컬럼)
  const { data: ftcRow, error: fErr } = await fra
    .from("ftc_brands_2024")
    .select("*")
    .eq("id", ftcBrandId)
    .maybeSingle();
  if (fErr) throw new Error(`ftc_brands_2024 fetch: ${fErr.message}`);
  if (!ftcRow) throw new FtcRowNotFoundError(ftcBrandId);

  // 3. v4-02 (v4-05 fix): docx 정제 facts (brand_fact_data WHERE provenance='docx')
  // ★ 컬럼명 BUG fix — TNS brand_fact_data 의 실제 컬럼은
  //   value (원문) / value_normalized (숫자) / source_note 이지
  //   value_text / value_num / source_label 이 아님 (frandoor.brand_facts 와 혼동했음).
  let docxFacts: DocxFact[] = [];
  try {
    const { data: rows, error: dErr } = await tns
      .from("brand_fact_data")
      .select("label, value, value_normalized, unit, source_note, source_type")
      .eq("brand_id", input.brand_id)
      .eq("provenance", "docx");
    if (dErr) {
      console.warn(`[v4.gen] docx_facts SELECT 에러: ${dErr.message}`);
      docxFacts = [];
    } else {
      docxFacts = (rows ?? []).map((r) => ({
        label: String(r.label ?? ""),
        // brand_fact_data.value_normalized → DocxFact.value_num
        value_num:
          typeof r.value_normalized === "number" && Number.isFinite(r.value_normalized)
            ? r.value_normalized
            : null,
        // brand_fact_data.value (원문 문자열) → DocxFact.value_text
        value_text: (r.value as string | null) ?? null,
        unit: (r.unit as string | null) ?? null,
        // brand_fact_data.source_note → DocxFact.source_label
        source_label: (r.source_note as string | null) ?? null,
        source_type: (r.source_type as string | null) ?? null,
      }));
    }
  } catch (e) {
    console.warn(`[v4.gen] docx_facts fetch 실패: ${e instanceof Error ? e.message : e}`);
    docxFacts = [];
  }

  // 4. industry_facts (해당 industry — 한식/분식 등)
  const industryMain = (ftcRow as Record<string, unknown>).induty_lclas as string | null;
  const industrySub = (ftcRow as Record<string, unknown>).induty_mlsfc as string | null;
  const industries = [industrySub, industryMain].filter((x): x is string => !!x && x.length > 0);
  let industryFacts: Array<Record<string, unknown>> = [];
  if (industries.length > 0) {
    const { data, error } = await fra
      .from("industry_facts")
      .select("*")
      .in("industry", industries);
    if (error) console.warn(`[v4.gen] industry_facts: ${error.message}`);
    industryFacts = (data ?? []) as Array<Record<string, unknown>>;
  }

  return {
    brand_label: (brandRow.name as string) ?? "?",
    industry: industryMain ?? industrySub ?? "?",
    industry_sub: industrySub,
    ftc_brand_id: ftcBrandId,
    ftc_row: ftcRow as Record<string, unknown>,
    docx_facts: docxFacts,
    industry_facts: industryFacts,
  };
}

function parseTitle(body: string): string {
  // frontmatter 의 title: "..." 추출
  const m = body.match(/^---\s*\n([\s\S]*?)\n---/);
  if (!m) return "";
  const titleM = m[1].match(/title:\s*"?([^"\n]+)"?/);
  return titleM ? titleM[1].trim() : "";
}

function parseFaq(body: string): Array<{ q: string; a: string }> {
  // frontmatter 의 faq 배열 휴리스틱 파싱
  const m = body.match(/^---\s*\n([\s\S]*?)\n---/);
  if (!m) return [];
  const yaml = m[1];
  const lines = yaml.split(/\r?\n/);
  const faq: Array<{ q: string; a: string }> = [];
  let inFaq = false;
  let cur: { q?: string; a?: string } = {};
  for (const l of lines) {
    if (/^faq:\s*$/.test(l)) {
      inFaq = true;
      continue;
    }
    if (inFaq && /^[a-zA-Z_]+:\s*\S/.test(l)) {
      // 다음 top-level key — faq 종료
      inFaq = false;
    }
    if (!inFaq) continue;
    const qm = l.match(/^\s*-\s*q:\s*"?(.+?)"?\s*$/);
    const am = l.match(/^\s*a:\s*"?(.+?)"?\s*$/);
    if (qm) {
      if (cur.q && cur.a) faq.push({ q: cur.q, a: cur.a });
      cur = { q: qm[1] };
    } else if (am) {
      cur.a = am[1];
    }
  }
  if (cur.q && cur.a) faq.push({ q: cur.q, a: cur.a });
  return faq;
}

// =============================================================================
// v4-07 — 3-step pipeline
// =============================================================================

export class DraftNotFoundError extends Error {
  code = "DRAFT_NOT_FOUND";
  constructor(public draftId: string) {
    super(`draft not found: ${draftId}`);
    this.name = "DraftNotFoundError";
  }
}

export class InvalidStageError extends Error {
  code = "INVALID_STAGE";
  constructor(public draftId: string, public expected: string, public actual: string | null) {
    super(`stage mismatch: expected '${expected}', actual '${actual ?? "null"}' (draftId=${draftId})`);
    this.name = "InvalidStageError";
  }
}

type DraftRowMin = {
  id: string;
  brand_id: string | null;
  ftc_brand_id: string | null;
  meta: Record<string, unknown> | null;
  stage: string | null;
};

async function loadDraft(draftId: string): Promise<DraftRowMin> {
  const tns = createAdminClient();
  const { data, error } = await tns
    .from("frandoor_blog_drafts")
    .select("id, brand_id, ftc_brand_id, meta, stage")
    .eq("id", draftId)
    .maybeSingle();
  if (error) throw new Error(`draft load: ${error.message}`);
  if (!data) throw new DraftNotFoundError(draftId);
  return data as DraftRowMin;
}

/**
 * v4-07 Step 1 — LLM1 (haiku) A급 정제 facts.
 * input: V4Input { brand_id, topic }
 * output: { draftId, a_facts }
 * 응답 ~25s + fetch + DB ~5s = ~30s.
 */
export async function runStep1FactsA(input: V4Input): Promise<V4Step1Response> {
  const today = new Date().toISOString().slice(0, 10);
  const t0 = Date.now();

  const bundle = await fetchBundle(input);
  console.log(
    `[v4-07.1] brand=${bundle.brand_label} ftc_id=${bundle.ftc_brand_id} industry=${bundle.industry} ftc_cols=${
      Object.keys(bundle.ftc_row).length
    } industry_facts=${bundle.industry_facts.length}`,
  );

  // LLM1 — A급 정제
  const sys = buildLlm1Sysprompt();
  const user = buildLlm1User({
    brand_label: bundle.brand_label,
    industry: bundle.industry,
    industry_sub: bundle.industry_sub ?? null,
    topic: input.topic,
    ftc_brand_id: bundle.ftc_brand_id,
    ftc_row: bundle.ftc_row,
    industry_facts: bundle.industry_facts,
  });

  console.log(`[v4-07.1] haiku 호출 (sys=${sys.length}자, user=${user.length}자)...`);
  const tStart = Date.now();
  const raw = await callHaiku({
    system: sys,
    user,
    maxTokens: 4000, // a_facts JSON ~3000 token + 안전 margin
  });
  console.log(`[v4-07.1] haiku done: ${Date.now() - tStart}ms, len=${raw.length}`);

  let aFacts: AFactsResult;
  try {
    aFacts = extractJson(raw) as AFactsResult;
  } catch (e) {
    throw new Error(`Step 1 LLM1 JSON parse 실패: ${e instanceof Error ? e.message : e}`);
  }
  // 안전 fallback
  if (!aFacts.fact_groups || typeof aFacts.fact_groups !== "object") {
    aFacts.fact_groups = {};
  }
  if (typeof aFacts.brand_label !== "string") aFacts.brand_label = bundle.brand_label;
  if (typeof aFacts.industry !== "string") aFacts.industry = bundle.industry;
  if (typeof aFacts.industry_sub !== "string" && aFacts.industry_sub !== null) {
    aFacts.industry_sub = bundle.industry_sub ?? null;
  }
  if (typeof aFacts.topic !== "string") aFacts.topic = input.topic;
  if (typeof aFacts.ftc_brand_id !== "string") aFacts.ftc_brand_id = bundle.ftc_brand_id;
  if (!Array.isArray(aFacts.selected_metrics)) aFacts.selected_metrics = [];
  if (typeof aFacts.key_angle !== "string") aFacts.key_angle = input.topic;
  if (!aFacts.population_info || typeof aFacts.population_info !== "object") {
    aFacts.population_info = {};
  }

  // INSERT draft
  const tns = createAdminClient();
  const placeholderTitle = `[1/3 facts-a] ${bundle.brand_label} — ${input.topic}`;
  const { data: ins, error: dErr } = await tns
    .from("frandoor_blog_drafts")
    .insert({
      brand_id: input.brand_id,
      ftc_brand_id: bundle.ftc_brand_id,
      industry: bundle.industry,
      channel: "frandoor",
      title: placeholderTitle,
      content: null,
      faq: [],
      meta: {
        mode: "brand",
        topic: input.topic,
        a_facts: aFacts,
      },
      content_type: "brand",
      status: "draft",
      target_date: today,
      pipeline_version: "v4-07",
      stage: "facts_a_done",
    })
    .select("id")
    .single();
  if (dErr || !ins) {
    throw new Error(`Step 1 INSERT failed: ${dErr?.message ?? "no row"}`);
  }

  console.log(
    `[v4-07.1] ✓ ${Date.now() - t0}ms, draftId=${ins.id} stage=facts_a_done fact_groups=${
      Object.keys(aFacts.fact_groups).length
    }`,
  );
  return { draftId: ins.id as string, a_facts: aFacts };
}

/**
 * v4-07 Step 2 — LLM2 (haiku) C급 정제 + A vs C 차이.
 * input: draftId (stage='facts_a_done')
 * output: { draftId, c_facts }
 */
export async function runStep2FactsC(draftId: string): Promise<V4Step2Response> {
  const t0 = Date.now();
  const draft = await loadDraft(draftId);
  if (draft.stage !== "facts_a_done") {
    throw new InvalidStageError(draftId, "facts_a_done", draft.stage);
  }
  const meta = (draft.meta ?? {}) as Record<string, unknown>;
  const aFacts = meta.a_facts as AFactsResult | undefined;
  if (!aFacts) throw new Error(`draft ${draftId}: meta.a_facts 누락`);

  // brand_fact_data raw fetch (provenance='docx')
  const tns = createAdminClient();
  let docxFactsRaw: Array<Record<string, unknown>> = [];
  try {
    const { data: rows, error: dErr } = await tns
      .from("brand_fact_data")
      .select("label, value, value_normalized, unit, source_note, source_type")
      .eq("brand_id", draft.brand_id ?? "")
      .eq("provenance", "docx");
    if (dErr) {
      console.warn(`[v4-07.2] brand_fact_data SELECT 에러: ${dErr.message}`);
    } else {
      docxFactsRaw = (rows ?? []) as Array<Record<string, unknown>>;
    }
  } catch (e) {
    console.warn(`[v4-07.2] brand_fact_data fetch 실패: ${e instanceof Error ? e.message : e}`);
  }

  console.log(`[v4-07.2] docx_facts raw ${docxFactsRaw.length}건`);

  let cFacts: CFactsResult;
  if (docxFactsRaw.length === 0) {
    // C급 데이터 없음 — 빈 c_facts
    cFacts = {
      fact_groups: {},
      c_only_facts: [],
      ac_diff_summary: "C급 데이터 없음 (본사 docx 미업로드 또는 추출된 fact 0건).",
    };
  } else {
    const sys = buildLlm2Sysprompt();
    const user = buildLlm2User({
      topic: aFacts.topic,
      brand_label: aFacts.brand_label,
      a_facts: aFacts,
      docx_facts_raw: docxFactsRaw,
    });
    console.log(`[v4-07.2] haiku 호출 (sys=${sys.length}자, user=${user.length}자)...`);
    const tStart = Date.now();
    const raw = await callHaiku({
      system: sys,
      user,
      maxTokens: 3000,
    });
    console.log(`[v4-07.2] haiku done: ${Date.now() - tStart}ms, len=${raw.length}`);
    try {
      cFacts = extractJson(raw) as CFactsResult;
    } catch (e) {
      throw new Error(`Step 2 LLM2 JSON parse 실패: ${e instanceof Error ? e.message : e}`);
    }
    if (!cFacts.fact_groups || typeof cFacts.fact_groups !== "object") cFacts.fact_groups = {};
    if (!Array.isArray(cFacts.c_only_facts)) cFacts.c_only_facts = [];
    if (typeof cFacts.ac_diff_summary !== "string") cFacts.ac_diff_summary = "";
  }

  // UPDATE draft
  const { error: uErr } = await tns
    .from("frandoor_blog_drafts")
    .update({
      meta: { ...meta, c_facts: cFacts },
      stage: "facts_c_done",
    })
    .eq("id", draftId);
  if (uErr) throw new Error(`Step 2 UPDATE failed: ${uErr.message}`);

  console.log(
    `[v4-07.2] ✓ ${Date.now() - t0}ms, stage=facts_c_done c_groups=${
      Object.keys(cFacts.fact_groups).length
    } c_only=${cFacts.c_only_facts.length}`,
  );
  return { draftId, c_facts: cFacts };
}

/**
 * v4-07 Step 3 — LLM3 (sonnet) 본문 작성.
 * input: draftId (stage='facts_c_done')
 * output: V4Result
 */
export async function runStep3Write(draftId: string): Promise<V4Result> {
  const t0 = Date.now();
  const draft = await loadDraft(draftId);
  if (draft.stage !== "facts_c_done") {
    throw new InvalidStageError(draftId, "facts_c_done", draft.stage);
  }
  const meta = (draft.meta ?? {}) as Record<string, unknown>;
  const aFacts = meta.a_facts as AFactsResult | undefined;
  const cFacts = meta.c_facts as CFactsResult | undefined;
  if (!aFacts) throw new Error(`draft ${draftId}: meta.a_facts 누락`);
  if (!cFacts) throw new Error(`draft ${draftId}: meta.c_facts 누락`);

  const today = new Date().toISOString().slice(0, 10);
  const hasDocx =
    Object.keys(cFacts.fact_groups).length > 0 || cFacts.c_only_facts.length > 0;

  const sys = buildWriterSysprompt({
    brand_label: aFacts.brand_label,
    industry: aFacts.industry,
    industry_sub: aFacts.industry_sub,
    topic: aFacts.topic,
    today,
    hasDocx,
  });
  const user = buildWriterUserPrompt({
    topic: aFacts.topic,
    brand_label: aFacts.brand_label,
    a_facts: aFacts,
    c_facts: cFacts,
  });

  console.log(`[v4-07.3] sonnet 호출 (sys=${sys.length}자, user=${user.length}자)...`);
  const tStart = Date.now();
  const draftBody = await callSonnet({
    system: sys,
    user,
    // v4-07: ~4,400자 본문 (max_tokens 2200)
    maxTokens: 2200,
  });
  console.log(`[v4-07.3] sonnet done: ${Date.now() - tStart}ms, len=${draftBody.length}`);

  // post_process
  const processed = postProcess(draftBody);
  console.log(`[v4-07.3] post_process: ${processed.log.join(" | ")}`);

  // crosscheck — a_facts/c_facts 의 raw_value + value_text + distribution.raw 모두 allowed
  const allowedFromA = collectAllowedNumbersFromAFacts(aFacts);
  const allowedFromC = collectAllowedNumbersFromCFacts(cFacts);
  const allowedNumbers = new Set<string>([...allowedFromA, ...allowedFromC]);

  const cc = crosscheckV4(processed.body, allowedNumbers);
  const lint = lintV4(processed.body, {
    hasC: hasDocx,
    topic: aFacts.topic,
  });
  console.log(
    `[v4-07.3] cc: matched=${cc.matched} unmatched=${cc.unmatched.length} | lint errors=${lint.errors.length} warnings=${lint.warnings.length}`,
  );

  const title = parseTitle(processed.body);
  const faq = parseFaq(processed.body);
  const faqLint = lintV4Faq(faq);
  const lintWarnings = [
    ...lint.warnings,
    ...faqLint.warnings,
    ...lint.errors.map((e) => `[lint error] ${e}`),
    ...cc.unmatched.slice(0, 5).map((u) => `[crosscheck unmatched] ${u}`),
    ...faqLint.errors.map((e) => `[faq lint error] ${e}`),
  ];

  const finalContent = processed.body.replace(
    /^(---\s*\n[\s\S]*?\n---)/,
    (block) =>
      block
        .replace(/^date:\s*"?[^"\n]+"?$/m, `date: "${today}"`)
        .replace(/^dateModified:\s*"?[^"\n]+"?$/m, `dateModified: "${today}"`),
  );
  const finalTitle = title || `${aFacts.brand_label} ${aFacts.topic}`;

  // UPDATE draft (final)
  const tns = createAdminClient();
  let saveError: string | null = null;
  try {
    const { error: uErr } = await tns
      .from("frandoor_blog_drafts")
      .update({
        title: finalTitle,
        content: finalContent,
        faq,
        meta: {
          ...meta,
          lintWarnings,
          ccUnmatched: cc.unmatched,
          ccMatched: cc.matched,
        },
        polish_log: processed.log,
        stage: "write_done",
      })
      .eq("id", draftId);
    if (uErr) saveError = uErr.message;
  } catch (e) {
    saveError = e instanceof Error ? e.message : String(e);
  }

  console.log(`[v4-07.3] ✓ ${Date.now() - t0}ms, stage=write_done`);

  return {
    draftId,
    saveError,
    title: finalTitle,
    content: finalContent,
    lintWarnings,
    ccUnmatched: cc.unmatched,
  };
}

/** v4-07 a_facts 의 모든 raw_value (A.raw_value + distribution.p*.raw) → allowedNumbers. */
function collectAllowedNumbersFromAFacts(aFacts: AFactsResult): Set<string> {
  const allowed = new Set<string>();
  function add(n: number | null | undefined) {
    if (typeof n !== "number" || !Number.isFinite(n) || n <= 1) return;
    allowed.add(String(n));
    allowed.add(n.toLocaleString("en-US"));
    allowed.add(n.toLocaleString("ko-KR"));
    allowed.add(String(Math.trunc(n)));
  }
  for (const g of Object.values(aFacts.fact_groups ?? {})) {
    if (g.A?.raw_value != null) add(g.A.raw_value);
    if (g.distribution) {
      for (const k of ["p25", "p50", "p75", "p90", "p95"] as const) {
        const p = g.distribution[k];
        if (p && typeof p.raw === "number") add(p.raw);
      }
      add(g.distribution.n_population);
    }
  }
  for (const v of Object.values(aFacts.population_info ?? {})) add(v);
  return allowed;
}

/** v4-07 c_facts 의 모든 수치 → allowedNumbers. */
function collectAllowedNumbersFromCFacts(cFacts: CFactsResult): Set<string> {
  const allowed = new Set<string>();
  const NUMBER_RE = /[\d]{1,3}(?:,\d{3})+(?:\.\d+)?|\d+(?:\.\d+)?/g;
  function add(n: number | null | undefined) {
    if (typeof n !== "number" || !Number.isFinite(n) || n <= 1) return;
    allowed.add(String(n));
    allowed.add(n.toLocaleString("en-US"));
    allowed.add(n.toLocaleString("ko-KR"));
    allowed.add(String(Math.trunc(n)));
  }
  function addFromText(text: string | null | undefined) {
    if (!text) return;
    const matches = text.match(NUMBER_RE) ?? [];
    for (const m of matches) {
      const num = Number(m.replace(/,/g, ""));
      if (Number.isFinite(num) && num > 1) add(num);
    }
  }
  for (const g of Object.values(cFacts.fact_groups ?? {})) {
    if (g.C?.raw_value != null) add(g.C.raw_value);
    if (g.C?.value_text) addFromText(g.C.value_text);
  }
  for (const f of cFacts.c_only_facts ?? []) {
    if (f.value_num != null) add(f.value_num);
    addFromText(f.value_text);
  }
  return allowed;
}

