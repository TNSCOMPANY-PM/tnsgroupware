/**
 * v4 pipeline — generateV4. 1 sonnet call + post_process + crosscheck + lint + DB UPDATE.
 *
 * 흐름:
 *  1. brand row (TNS geo_brands) 조회 — ftc_brand_id 필수
 *  2. ftc_brands_2024 row 통째 (152 컬럼) — frandoor
 *  3. brand_source_doc.markdown_text — TNS (있으면)
 *  4. industry_facts (해당 industry) — frandoor
 *  5. sonnet 1회 호출 (input ~8000 + max_tokens 4000 → ~40s)
 *  6. post_process (5룰)
 *  7. crosscheck (raw 매칭) + lint (L1~L10)
 *  8. DB INSERT (frandoor_blog_drafts, stage='write_done')
 */

import "server-only";
import { createAdminClient } from "@/utils/supabase/admin";
import { createFrandoorClient } from "@/utils/supabase/frandoor";
import { callSonnet } from "./claude";
import {
  buildSysprompt,
  buildSyspromptPart1,
  buildSyspromptPart2,
  buildUserPrompt,
  buildPart2UserPrompt,
} from "./sysprompt";
import { postProcess } from "./post_process";
import { collectAllowedNumbers, crosscheckV4 } from "./crosscheck";
import { lintV4, lintV4Faq } from "./lint";
import { selectColumns } from "./steps/select_columns";
import type {
  DocxFact,
  RawInputBundle,
  V4Input,
  V4Result,
  V4PhaseAResult,
  V4PartResult,
  V4PlanJson,
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
// v4-07 — Phase 분할 (Phase A / Part1 / Part2)
// =============================================================================

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
 * v4-07 Phase A — Step 0 + fetch + plan storage. ~25s.
 */
export async function runPhaseA(input: V4Input): Promise<V4PhaseAResult> {
  const today = new Date().toISOString().slice(0, 10);
  const t0 = Date.now();

  const bundle = await fetchBundle(input);
  console.log(
    `[v4-07.A] brand=${bundle.brand_label} ftc_id=${bundle.ftc_brand_id} industry=${bundle.industry} ftc_cols=${
      Object.keys(bundle.ftc_row).length
    } docx_facts=${bundle.docx_facts.length} industry_facts=${bundle.industry_facts.length}`,
  );

  const tCol = Date.now();
  const colSelection = await selectColumns({
    topic: input.topic,
    brand_label: bundle.brand_label,
    industry: bundle.industry,
  });
  console.log(
    `[v4-07.A] selectColumns ${Date.now() - tCol}ms: ${colSelection.columns.length}개`,
  );

  const filteredFtcRow: Record<string, unknown> = {};
  for (const col of colSelection.columns) {
    if (col in bundle.ftc_row) filteredFtcRow[col] = bundle.ftc_row[col];
  }

  const hasDocx = bundle.docx_facts.length > 0;
  const plan: V4PlanJson = {
    brand_label: bundle.brand_label,
    industry: bundle.industry,
    industry_sub: bundle.industry_sub ?? null,
    ftc_brand_id: bundle.ftc_brand_id,
    filtered_ftc_row: filteredFtcRow,
    docx_facts: bundle.docx_facts,
    industry_facts: bundle.industry_facts,
    selected_columns: colSelection.columns,
    topic: input.topic,
    today,
    hasDocx,
  };

  const tns = createAdminClient();
  const placeholderTitle = `[1/3 Plan] ${bundle.brand_label} — ${input.topic}`;
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
        plan_json: plan,
      },
      content_type: "brand",
      status: "draft",
      target_date: today,
      pipeline_version: "v4-07",
      stage: "plan_done",
    })
    .select("id")
    .single();
  if (dErr || !ins) {
    throw new Error(`Phase A INSERT failed: ${dErr?.message ?? "no row"}`);
  }

  console.log(`[v4-07.A] ✓ ${Date.now() - t0}ms, draftId=${ins.id} stage=plan_done`);
  return { draftId: ins.id as string, plan };
}

/**
 * v4-07 Phase B-Part1 — Sonnet frontmatter + [블럭 A]+[B]+[C]. max_tokens 1500.
 */
export async function runPhaseBPart1(draftId: string): Promise<V4PartResult> {
  const t0 = Date.now();
  const draft = await loadDraft(draftId);
  if (draft.stage !== "plan_done") {
    throw new InvalidStageError(draftId, "plan_done", draft.stage);
  }
  const meta = (draft.meta ?? {}) as Record<string, unknown>;
  const plan = meta.plan_json as V4PlanJson | undefined;
  if (!plan) throw new Error(`draft ${draftId}: meta.plan_json 누락`);

  const sysprompt = buildSyspromptPart1({
    brand_label: plan.brand_label,
    industry: plan.industry,
    industry_sub: plan.industry_sub,
    topic: plan.topic,
    today: plan.today,
    hasDocx: plan.hasDocx,
  });
  const userPrompt = buildUserPrompt({
    topic: plan.topic,
    ftc_row: plan.filtered_ftc_row,
    docx_facts: plan.docx_facts,
    industry_facts: plan.industry_facts,
  });

  console.log(
    `[v4-07.B1] sonnet 호출 (sys=${sysprompt.length}자, user=${userPrompt.length}자)...`,
  );
  const tStart = Date.now();
  const part1 = await callSonnet({
    system: sysprompt,
    user: userPrompt,
    maxTokens: 1500,
  });
  console.log(`[v4-07.B1] sonnet done: ${Date.now() - tStart}ms, len=${part1.length}`);

  const tns = createAdminClient();
  const { error: uErr } = await tns
    .from("frandoor_blog_drafts")
    .update({
      meta: { ...meta, content_part1: part1 },
      stage: "part1_done",
    })
    .eq("id", draftId);
  if (uErr) throw new Error(`Part1 UPDATE failed: ${uErr.message}`);

  console.log(`[v4-07.B1] ✓ ${Date.now() - t0}ms, stage=part1_done`);
  return { draftId, content_part: part1 };
}

/**
 * v4-07 Phase B-Part2 — Sonnet 이어쓰기 [블럭 D]+[E]. post_process+cc+lint+UPDATE.
 */
export async function runPhaseBPart2(draftId: string): Promise<V4Result> {
  const t0 = Date.now();
  const draft = await loadDraft(draftId);
  if (draft.stage !== "part1_done") {
    throw new InvalidStageError(draftId, "part1_done", draft.stage);
  }
  const meta = (draft.meta ?? {}) as Record<string, unknown>;
  const plan = meta.plan_json as V4PlanJson | undefined;
  const content_part1 = meta.content_part1 as string | undefined;
  if (!plan) throw new Error(`draft ${draftId}: meta.plan_json 누락`);
  if (!content_part1) throw new Error(`draft ${draftId}: meta.content_part1 누락`);

  const sysprompt = buildSyspromptPart2({
    brand_label: plan.brand_label,
    industry: plan.industry,
    industry_sub: plan.industry_sub,
    topic: plan.topic,
    today: plan.today,
    hasDocx: plan.hasDocx,
  });
  const userPrompt = buildPart2UserPrompt({
    topic: plan.topic,
    ftc_row: plan.filtered_ftc_row,
    docx_facts: plan.docx_facts,
    industry_facts: plan.industry_facts,
    content_part1,
  });

  console.log(
    `[v4-07.B2] sonnet 호출 (sys=${sysprompt.length}자, user=${userPrompt.length}자)...`,
  );
  const tStart = Date.now();
  const part2 = await callSonnet({
    system: sysprompt,
    user: userPrompt,
    maxTokens: 1100,
  });
  console.log(`[v4-07.B2] sonnet done: ${Date.now() - tStart}ms, len=${part2.length}`);

  const combined = content_part1.trimEnd() + "\n\n" + part2.trimStart();
  const processed = postProcess(combined);
  console.log(`[v4-07.B2] post_process: ${processed.log.join(" | ")}`);

  const allowedNumbers = collectAllowedNumbers({
    ftc_row: plan.filtered_ftc_row,
    docx_facts: plan.docx_facts,
    industry_facts: plan.industry_facts,
  });
  const cc = crosscheckV4(processed.body, allowedNumbers);
  const lint = lintV4(processed.body, {
    hasC: plan.hasDocx,
    topic: plan.topic,
  });
  console.log(
    `[v4-07.B2] cc: matched=${cc.matched} unmatched=${cc.unmatched.length} | lint errors=${lint.errors.length} warnings=${lint.warnings.length}`,
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
        .replace(/^date:\s*"?[^"\n]+"?$/m, `date: "${plan.today}"`)
        .replace(/^dateModified:\s*"?[^"\n]+"?$/m, `dateModified: "${plan.today}"`),
  );
  const finalTitle = title || `${plan.brand_label} ${plan.topic}`;

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

  console.log(`[v4-07.B2] ✓ ${Date.now() - t0}ms, stage=write_done`);

  return {
    draftId,
    saveError,
    title: finalTitle,
    content: finalContent,
    lintWarnings,
    ccUnmatched: cc.unmatched,
  };
}

