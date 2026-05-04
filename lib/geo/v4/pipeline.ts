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
// v4-10: LLM1 → Sonnet (callLLM1) + 코드 후처리 (buildAFactsFromMetrics).
//        Haiku 큰 JSON output 만성 parse 실패 (position 6764) 회피.
import { callLLM1, callSonnet, extractJson } from "./claude";
import { buildLlm1Sysprompt, buildLlm1User } from "./sysprompts/llm1_facts_a";
import { buildAFactsFromMetrics } from "./build_a_facts";
// v4-09: LLM2 (haiku c_facts 정제) 폐기 → matchAndDiff 코드 매칭
import { matchAndDiff } from "./match_and_diff";
import { buildWriterSysprompt, buildWriterUserPrompt } from "./sysprompts/writer";
// v4-13: writer 본문만 출력 → frontmatter + FAQ 코드 결정론 합치기.
import { buildFrontmatter } from "./build_frontmatter";
import { buildFaq } from "./build_faq";
// v4-14: FAQ 중복 해소 — frontmatter YAML 의 faq: 만 사용, 본문 끝 markdown 섹션 제거.
import { renderFrontmatterYaml } from "./render_frontmatter";
import { postProcess } from "./post_process";
import { collectAllowedNumbers, crosscheckV4 } from "./crosscheck";
import { lintV4, lintV4Faq } from "./lint";
// v4-16~17: A only 분석 모드 — 별도 3-step chain (v4-17 업종 단위 재설계).
import {
  buildLlm1AnalyzeAOnlySysprompt,
  buildLlm1AnalyzeAOnlyUser,
} from "./sysprompts/llm1_analyze_a_only";
import {
  buildIndustryAnalysisFacts,
  DEFAULT_RANKING_METRIC,
} from "./build_industry_analysis";
import {
  buildWriterAOnlySysprompt,
  buildWriterAOnlyUserPrompt,
} from "./sysprompts/writer_a_only";
import {
  buildIndustryFrontmatter,
  buildIndustryFaq,
} from "./build_industry_frontmatter";
import type {
  AFactsResult,
  CFactsResult,
  DocxFact,
  IndustryAnalysisFacts,
  RawInputBundle,
  V4AOnlyInput,
  V4AOnlyStep1Response,
  V4AOnlyStep2Response,
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
    // v4-14: 세부 카테고리 (induty_mlsfc — "분식"/"한식"/"치킨" 등) 우선.
    // induty_lclas ("외식") 는 너무 광범위 → 본문 분포 / FAQ 가 부정확.
    industry: industrySub ?? industryMain ?? "?",
    industry_sub: industrySub,
    ftc_brand_id: ftcBrandId,
    ftc_row: ftcRow as Record<string, unknown>,
    docx_facts: docxFacts,
    industry_facts: industryFacts,
  };
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

  // v4-10 LLM1 — Sonnet 으로 selected_metrics + key_angle 만 받음.
  const sys = buildLlm1Sysprompt();
  const user = buildLlm1User({
    brand_label: bundle.brand_label,
    industry: bundle.industry,
    industry_sub: bundle.industry_sub ?? null,
    topic: input.topic,
    ftc_brand_id: bundle.ftc_brand_id,
  });

  console.log(`[v4-10.1] sonnet (LLM1) 호출 (sys=${sys.length}자, user=${user.length}자)...`);
  const tStart = Date.now();
  const raw = await callLLM1({
    system: sys,
    user,
    maxTokens: 1500, // selected_metrics + key_angle ~500 token + 안전 margin
  });
  console.log(`[v4-10.1] sonnet (LLM1) done: ${Date.now() - tStart}ms, len=${raw.length}`);

  let llm1Parsed: { selected_metrics?: unknown; key_angle?: unknown };
  try {
    llm1Parsed = extractJson(raw) as { selected_metrics?: unknown; key_angle?: unknown };
  } catch (e) {
    throw new Error(`Step 1 LLM1 JSON parse 실패: ${e instanceof Error ? e.message : e}`);
  }
  const selectedMetrics = Array.isArray(llm1Parsed.selected_metrics)
    ? llm1Parsed.selected_metrics.filter((x): x is string => typeof x === "string" && x.length > 0)
    : [];
  const keyAngle = typeof llm1Parsed.key_angle === "string" ? llm1Parsed.key_angle : input.topic;

  // v4-10 코드 후처리 — display / distribution / brand_position / population_info 모두 결정론.
  const tBuild = Date.now();
  const aFacts: AFactsResult = buildAFactsFromMetrics({
    brand_label: bundle.brand_label,
    industry: bundle.industry,
    industry_sub: bundle.industry_sub ?? null,
    topic: input.topic,
    ftc_brand_id: bundle.ftc_brand_id,
    selected_metrics: selectedMetrics,
    key_angle: keyAngle,
    ftc_row: bundle.ftc_row,
    industry_facts: bundle.industry_facts,
  });
  console.log(
    `[v4-10.1] buildAFacts done: ${Date.now() - tBuild}ms (LLM 호출 X), fact_groups=${
      Object.keys(aFacts.fact_groups).length
    }`,
  );

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
      pipeline_version: "v4-10",
      stage: "facts_a_done",
    })
    .select("id")
    .single();
  if (dErr || !ins) {
    throw new Error(`Step 1 INSERT failed: ${dErr?.message ?? "no row"}`);
  }

  console.log(
    `[v4-10.1] ✓ ${Date.now() - t0}ms, draftId=${ins.id} stage=facts_a_done fact_groups=${
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

  // v4-09: LLM2 (haiku) 폐기 → matchAndDiff 코드 매칭
  // mapFactLabelToMetricId 재사용 + formatToDisplay + computeAcDiff (모두 결정론).
  // JSON parse 실패 0 / 비용 0 / 응답 ~5s.
  let cFacts: CFactsResult;
  if (docxFactsRaw.length === 0) {
    cFacts = {
      fact_groups: {},
      c_only_facts: [],
      ac_diff_summary: "C급 데이터 없음 (본사 docx 미업로드 또는 추출된 fact 0건).",
    };
  } else {
    const tMatch = Date.now();
    cFacts = matchAndDiff({
      a_facts: aFacts,
      docx_facts_raw: docxFactsRaw,
    });
    console.log(`[v4-09.2] matchAndDiff done: ${Date.now() - tMatch}ms (LLM 호출 X)`);
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

  console.log(`[v4-13.3] sonnet 호출 (sys=${sys.length}자, user=${user.length}자)...`);
  const tStart = Date.now();
  const draftBody = await callSonnet({
    system: sys,
    user,
    // v4-13: 블럭 D 폐기 + frontmatter/FAQ 코드 분리 → 본문 3블럭 4,000자만.
    // Sonnet 50 tok/s × 3000 ≈ 50s, write route 60s 안 안전.
    maxTokens: 3000,
  });
  console.log(`[v4-13.3] sonnet done: ${Date.now() - tStart}ms, len=${draftBody.length}`);

  // post_process — Sonnet 본문 자릿수/표 정리.
  const processed = postProcess(draftBody);
  console.log(`[v4-13.3] post_process: ${processed.log.join(" | ")}`);

  // v4-13: frontmatter / FAQ 코드 결정론 생성 후 본문 앞뒤 합치기.
  const frontmatter = buildFrontmatter({
    topic: aFacts.topic,
    brand_label: aFacts.brand_label,
    industry: aFacts.industry,
    brand_id: draft.brand_id ?? "",
    today,
    a_facts: aFacts,
    c_facts: cFacts,
  });
  const faqItems = buildFaq({
    brand_label: aFacts.brand_label,
    industry: aFacts.industry,
    a_facts: aFacts,
    c_facts: cFacts,
  });
  const yaml = renderFrontmatterYaml(frontmatter, faqItems);
  // v4-14: FAQ 는 frontmatter YAML 의 faq: 만 — 본문 끝 markdown 섹션 추가 X (editor UI 가 별도 렌더).
  const finalContent = `${yaml}\n\n${processed.body.trim()}\n`;

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
    `[v4-13.3] cc: matched=${cc.matched} unmatched=${cc.unmatched.length} | lint errors=${lint.errors.length} warnings=${lint.warnings.length}`,
  );

  const faqLint = lintV4Faq(faqItems);
  const lintWarnings = [
    ...lint.warnings,
    ...faqLint.warnings,
    ...lint.errors.map((e) => `[lint error] ${e}`),
    ...cc.unmatched.slice(0, 5).map((u) => `[crosscheck unmatched] ${u}`),
    ...faqLint.errors.map((e) => `[faq lint error] ${e}`),
  ];

  const finalTitle = frontmatter.title;
  const faq = faqItems;

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

  console.log(`[v4-13.3] ✓ ${Date.now() - t0}ms, stage=write_done`);

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

// =============================================================================
// v4-17 — A only 업종 분석 모드 (3-step chain, gen_mode='a_only', industry 단위)
// =============================================================================

/**
 * v4-17 — 업종 단위 raw 데이터 fetch (ftc_brands_2024 induty_mlsfc/lclas + industry_facts).
 */
async function fetchAOnlyBundle(industry: string): Promise<{
  brands: Array<Record<string, unknown>>;
  industry_facts: Array<Record<string, unknown>>;
}> {
  const fra = createFrandoorClient();
  // induty_mlsfc 우선 (분식/한식/치킨), induty_lclas (외식) fallback OR
  const { data: brandsData, error: bErr } = await fra
    .from("ftc_brands_2024")
    .select("*")
    .or(`induty_mlsfc.eq.${industry},induty_lclas.eq.${industry}`);
  if (bErr) throw new Error(`ftc_brands_2024 industry fetch (${industry}): ${bErr.message}`);

  const { data: ifData, error: ifErr } = await fra
    .from("industry_facts")
    .select("*")
    .eq("industry", industry);
  if (ifErr) console.warn(`[v4-17] industry_facts fetch: ${ifErr.message}`);

  return {
    brands: (brandsData ?? []) as Array<Record<string, unknown>>,
    industry_facts: (ifData ?? []) as Array<Record<string, unknown>>,
  };
}

/**
 * v4-17 Step 1 — LLM1 (Sonnet) 업종 분석 각도 결정 + 코드 후처리 (buildIndustryAnalysisFacts).
 * input: V4AOnlyInput { industry, topic }
 * output: { draftId } — meta.a_only_facts 에 IndustryAnalysisFacts 저장.
 */
export async function runStep1AnalyzeAOnly(input: V4AOnlyInput): Promise<V4AOnlyStep1Response> {
  const today = new Date().toISOString().slice(0, 10);
  const t0 = Date.now();

  const bundle = await fetchAOnlyBundle(input.industry);
  console.log(
    `[v4-17.1] industry=${input.industry} brands=${bundle.brands.length} industry_facts=${bundle.industry_facts.length}`,
  );

  const sys = buildLlm1AnalyzeAOnlySysprompt();
  const user = buildLlm1AnalyzeAOnlyUser({
    industry: input.industry,
    topic: input.topic,
    n_brands: bundle.brands.length,
  });

  console.log(`[v4-17.1] sonnet (LLM1 analyze) 호출 (sys=${sys.length}자, user=${user.length}자)...`);
  const tStart = Date.now();
  const raw = await callLLM1({
    system: sys,
    user,
    maxTokens: 1500,
  });
  console.log(`[v4-17.1] sonnet done: ${Date.now() - tStart}ms, len=${raw.length}`);

  let parsed: {
    selected_metrics?: unknown;
    key_angle?: unknown;
    analysis_axes?: unknown;
    ranking_metric?: unknown;
  };
  try {
    parsed = extractJson(raw) as typeof parsed;
  } catch (e) {
    throw new Error(`Step 1 (a_only) JSON parse 실패: ${e instanceof Error ? e.message : e}`);
  }
  const selectedMetrics = Array.isArray(parsed.selected_metrics)
    ? parsed.selected_metrics.filter((x): x is string => typeof x === "string" && x.length > 0)
    : [];
  const keyAngle = typeof parsed.key_angle === "string" ? parsed.key_angle : input.topic;
  const analysisAxes = Array.isArray(parsed.analysis_axes)
    ? parsed.analysis_axes.filter((x): x is string => typeof x === "string" && x.length > 0)
    : [];
  const rankingMetric =
    typeof parsed.ranking_metric === "string" && parsed.ranking_metric.length > 0
      ? parsed.ranking_metric
      : DEFAULT_RANKING_METRIC;

  const tBuild = Date.now();
  const facts: IndustryAnalysisFacts = buildIndustryAnalysisFacts({
    industry: input.industry,
    topic: input.topic,
    selected_metrics: selectedMetrics,
    key_angle: keyAngle,
    analysis_axes: analysisAxes,
    ranking_metric: rankingMetric,
    brands: bundle.brands,
    industry_facts: bundle.industry_facts,
  });
  console.log(
    `[v4-17.1] buildIndustryAnalysisFacts done: ${Date.now() - tBuild}ms — distributions=${
      Object.keys(facts.distributions).length
    } top10=${facts.ranking.top10.length} outliers=${facts.outliers.length}`,
  );

  const tns = createAdminClient();
  const placeholderTitle = `[1/3 a-only analyze] ${input.industry} — ${input.topic}`;
  const { data: ins, error: dErr } = await tns
    .from("frandoor_blog_drafts")
    .insert({
      brand_id: null, // ★ industry 모드 — brand 없음
      ftc_brand_id: null,
      industry: input.industry,
      channel: "frandoor",
      title: placeholderTitle,
      content: null,
      faq: [],
      meta: {
        mode: "industry",
        topic: input.topic,
        a_only_facts: facts,
        n_brands: bundle.brands.length,
      },
      content_type: "industry",
      status: "draft",
      target_date: today,
      pipeline_version: "v4-17",
      gen_mode: "a_only",
      stage: "a_only_analyzed",
    })
    .select("id")
    .single();
  if (dErr || !ins) {
    throw new Error(`Step 1 (a_only) INSERT failed: ${dErr?.message ?? "no row"}`);
  }

  console.log(
    `[v4-17.1] ✓ ${Date.now() - t0}ms, draftId=${ins.id} stage=a_only_analyzed industry=${input.industry}`,
  );
  return { draftId: ins.id as string };
}

/**
 * v4-17 Step 2 — 코드 결정론 구조화 (현재는 pass-through).
 * input: draftId (stage='a_only_analyzed')
 * output: { draftId } — stage='a_only_structured'.
 */
export async function runStep2StructureAOnly(draftId: string): Promise<V4AOnlyStep2Response> {
  const t0 = Date.now();
  const draft = await loadDraft(draftId);
  if (draft.stage !== "a_only_analyzed") {
    throw new InvalidStageError(draftId, "a_only_analyzed", draft.stage);
  }
  const meta = (draft.meta ?? {}) as Record<string, unknown>;
  const facts = meta.a_only_facts as IndustryAnalysisFacts | undefined;
  if (!facts) throw new Error(`draft ${draftId}: meta.a_only_facts 누락`);

  const tns = createAdminClient();
  const { error: uErr } = await tns
    .from("frandoor_blog_drafts")
    .update({
      meta: { ...meta, a_only_facts: facts },
      stage: "a_only_structured",
    })
    .eq("id", draftId);
  if (uErr) throw new Error(`Step 2 (a_only) UPDATE failed: ${uErr.message}`);

  console.log(`[v4-17.2] ✓ ${Date.now() - t0}ms, stage=a_only_structured`);
  return { draftId };
}

/**
 * v4-17 Step 3 — Sonnet writer (업종 분석 톤) + frontmatter/FAQ 코드 합치기.
 * input: draftId (stage='a_only_structured')
 * output: V4Result.
 */
export async function runStep3WriteAOnly(draftId: string): Promise<V4Result> {
  const t0 = Date.now();
  const draft = await loadDraft(draftId);
  if (draft.stage !== "a_only_structured") {
    throw new InvalidStageError(draftId, "a_only_structured", draft.stage);
  }
  const meta = (draft.meta ?? {}) as Record<string, unknown>;
  const facts = meta.a_only_facts as IndustryAnalysisFacts | undefined;
  if (!facts) throw new Error(`draft ${draftId}: meta.a_only_facts 누락`);

  const today = new Date().toISOString().slice(0, 10);
  const sys = buildWriterAOnlySysprompt({
    industry: facts.industry,
    topic: facts.topic,
    n_brands: facts.n_brands,
    today,
  });
  const user = buildWriterAOnlyUserPrompt({
    topic: facts.topic,
    industry: facts.industry,
    a_only_facts: facts,
  });

  console.log(`[v4-18.3] sonnet (A only industry) 호출 (sys=${sys.length}자, user=${user.length}자)...`);
  const tStart = Date.now();
  const draftBody = await callSonnet({
    system: sys,
    user,
    // v4-18: ranking 표 + outlier narrative 분량 큼 → 3000 → 3500. 50 tok/s × 3500 = ~70s, write route 60s 빠듯.
    maxTokens: 3500,
  });
  console.log(`[v4-18.3] sonnet done: ${Date.now() - tStart}ms, len=${draftBody.length}`);

  const processed = postProcess(draftBody);
  console.log(`[v4-17.3] post_process: ${processed.log.join(" | ")}`);

  const frontmatter = buildIndustryFrontmatter({
    topic: facts.topic,
    industry: facts.industry,
    draft_id: draftId,
    today,
    facts,
  });
  const faqItems = buildIndustryFaq({
    industry: facts.industry,
    facts,
  });
  const yaml = renderFrontmatterYaml(frontmatter, faqItems);
  const finalContent = `${yaml}\n\n${processed.body.trim()}\n`;

  const allowedFromIndustry = collectAllowedNumbersFromIndustryFacts(facts);
  const cc = crosscheckV4(processed.body, allowedFromIndustry);
  const lint = lintV4(processed.body, { hasC: false, topic: facts.topic });
  console.log(
    `[v4-17.3] cc: matched=${cc.matched} unmatched=${cc.unmatched.length} | lint errors=${lint.errors.length} warnings=${lint.warnings.length}`,
  );

  const faqLint = lintV4Faq(faqItems);
  const lintWarnings = [
    ...lint.warnings,
    ...faqLint.warnings,
    ...lint.errors.map((e) => `[lint error] ${e}`),
    ...cc.unmatched.slice(0, 5).map((u) => `[crosscheck unmatched] ${u}`),
    ...faqLint.errors.map((e) => `[faq lint error] ${e}`),
  ];

  const finalTitle = frontmatter.title;
  const tns = createAdminClient();
  let saveError: string | null = null;
  try {
    const { error: uErr } = await tns
      .from("frandoor_blog_drafts")
      .update({
        title: finalTitle,
        content: finalContent,
        faq: faqItems,
        meta: {
          ...meta,
          lintWarnings,
          ccUnmatched: cc.unmatched,
          ccMatched: cc.matched,
        },
        polish_log: processed.log,
        stage: "a_only_written",
      })
      .eq("id", draftId);
    if (uErr) saveError = uErr.message;
  } catch (e) {
    saveError = e instanceof Error ? e.message : String(e);
  }

  console.log(`[v4-17.3] ✓ ${Date.now() - t0}ms, stage=a_only_written`);

  return {
    draftId,
    saveError,
    title: finalTitle,
    content: finalContent,
    lintWarnings,
    ccUnmatched: cc.unmatched,
  };
}

/** v4-17 — 업종 분석 facts 의 모든 raw_value (distributions + ranking + outliers) → allowedNumbers. */
function collectAllowedNumbersFromIndustryFacts(facts: IndustryAnalysisFacts): Set<string> {
  const allowed = new Set<string>();
  function add(n: number | null | undefined) {
    if (typeof n !== "number" || !Number.isFinite(n) || n <= 1) return;
    allowed.add(String(n));
    allowed.add(n.toLocaleString("en-US"));
    allowed.add(n.toLocaleString("ko-KR"));
    allowed.add(String(Math.trunc(n)));
  }
  for (const dist of Object.values(facts.distributions ?? {})) {
    for (const k of ["p25", "p50", "p75", "p90", "p95", "mean"] as const) {
      const p = dist[k];
      if (p && typeof p.raw === "number") add(p.raw);
    }
    add(dist.n_population);
  }
  for (const r of facts.ranking?.top10 ?? []) add(r.value.raw);
  for (const r of facts.ranking?.bottom10 ?? []) add(r.value.raw);
  for (const o of facts.outliers ?? []) add(o.value.raw);
  add(facts.n_brands);
  return allowed;
}

