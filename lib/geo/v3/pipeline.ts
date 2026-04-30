/**
 * v3-03 — 2단계 분할 파이프라인.
 *  Phase A (콘텐츠 생성): Step 1 Plan (haiku) + Step 2 Structure (haiku) → DB INSERT (stage='plan_done')
 *  Phase B (블로그 글 발행): Step 3 Write (sonnet) + Step 4 Polish (haiku + post) → DB UPDATE (stage='write_done')
 *
 * 각 phase 60s 안 안전 (Phase A ~20s / Phase B ~40s).
 */

import "server-only";
import { createAdminClient } from "@/utils/supabase/admin";
import { createFrandoorClient } from "@/utils/supabase/frandoor";
import { runPlan } from "./steps/plan";
import { runStructure } from "./steps/structure";
import { runWrite } from "./steps/write";
import { runPolish } from "./steps/polish";
import { crosscheckV3 } from "./crosscheck";
import { lintV3, lintV3Faq } from "./lint";
import type { Fact, GenerateInput, OutlineResult, PlanResult } from "./types";

const MIN_FACTS_REQUIRED = 5;

// =============================================================================
// Errors
// =============================================================================

export class InsufficientDataError extends Error {
  code = "INSUFFICIENT_DATA";
  constructor(public stats: { factsCount: number; required: number }) {
    super(`facts ${stats.factsCount} < ${stats.required} 필요`);
    this.name = "InsufficientDataError";
  }
}

export class HallucinationDetectedError extends Error {
  code = "HALLUCINATION_DETECTED";
  constructor(public unmatched: string[]) {
    super(`hallucination 검출: unmatched ${unmatched.length}건`);
    this.name = "HallucinationDetectedError";
  }
}

export class LintErrorV3 extends Error {
  code = "LINT_V3_FAILED";
  constructor(public lintErrors: string[]) {
    super(`lint v3 errors: ${lintErrors.join(" | ")}`);
    this.name = "LintErrorV3";
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
  constructor(public draftId: string, public currentStage: string | null) {
    super(`Phase B 호출 가능 stage='plan_done' 필요. 현재: ${currentStage}`);
    this.name = "InvalidStageError";
  }
}

// =============================================================================
// Types
// =============================================================================

export type PhaseAResult = {
  draftId: string;
  plan: PlanResult;
  outline: OutlineResult;
  factsCount: number;
};

export type PhaseBResult = {
  draftId: string;
  title: string;
  content: string;
  frontmatter: Record<string, unknown>;
  polishLog: string[];
  lintWarnings: string[];
};

// =============================================================================
// Frontmatter helpers
// =============================================================================

function parseFrontmatter(raw: string): {
  title: string;
  frontmatter: Record<string, unknown>;
  bodyMd: string;
} {
  let trimmed = raw.replace(/^﻿/, "").replace(/^\s+/, "");
  const fence = trimmed.match(/^```[a-zA-Z]*\s*\n([\s\S]*?)\n```\s*$/);
  if (fence) trimmed = fence[1].trim();

  const m = trimmed.match(/^---\s*\n([\s\S]*?)\n---\s*\n([\s\S]*)$/);
  if (!m) {
    return { title: "", frontmatter: {}, bodyMd: trimmed };
  }
  const yaml = m[1];
  const bodyMd = m[2].trim();
  const fm: Record<string, unknown> = {};

  const lines = yaml.split(/\r?\n/);
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    const kv = line.match(/^([a-zA-Z_]+):\s*(.*)$/);
    if (!kv) {
      i++;
      continue;
    }
    const key = kv[1];
    const rest = kv[2].trim();

    if (rest === "" && key === "faq") {
      const faq: Array<{ q: string; a: string }> = [];
      let cur: { q?: string; a?: string } = {};
      i++;
      while (i < lines.length) {
        const l = lines[i];
        const qm = l.match(/^\s*-\s*q:\s*"?(.+?)"?\s*$/);
        const am = l.match(/^\s*a:\s*"?(.+?)"?\s*$/);
        if (qm) {
          if (cur.q && cur.a) faq.push({ q: cur.q, a: cur.a });
          cur = { q: qm[1] };
        } else if (am) {
          cur.a = am[1];
        } else if (/^[a-zA-Z_]+:/.test(l)) {
          break;
        }
        i++;
      }
      if (cur.q && cur.a) faq.push({ q: cur.q, a: cur.a });
      fm.faq = faq;
      continue;
    }

    if (rest === "") {
      i++;
      continue;
    }

    if (rest.startsWith("[") && rest.endsWith("]")) {
      const inner = rest.slice(1, -1);
      const items = inner
        .split(",")
        .map((s) => s.trim().replace(/^["']|["']$/g, ""))
        .filter(Boolean);
      fm[key] = items;
    } else {
      fm[key] = rest.replace(/^["']|["']$/g, "");
    }
    i++;
  }

  const title = typeof fm.title === "string" ? fm.title : "";
  return { title, frontmatter: fm, bodyMd };
}

function normalizeFrontmatter(
  fm: Record<string, unknown>,
  today: string,
): Record<string, unknown> {
  return { ...fm, date: today, dateModified: today };
}

// =============================================================================
// Facts pool fetch (brand + industry)
// =============================================================================

type BrandContext = {
  factsPool: Fact[];
  brandName: string;
  industryMain: string | null;
  industrySub: string | null;
  geoBrandId: string | null;
  isCustomer: boolean;
};

async function fetchBrandFacts(input: {
  brandId: string;
  tiers: ("A" | "B" | "C")[];
}): Promise<BrandContext> {
  const fra = createFrandoorClient();
  const { data: ftcBrand, error: bErr } = await fra
    .from("ftc_brands_2024")
    .select("id, brand_nm, corp_nm, induty_lclas, induty_mlsfc")
    .eq("id", input.brandId)
    .maybeSingle();
  if (bErr || !ftcBrand) {
    throw new Error(`ftc brand not found: ${input.brandId} (${bErr?.message ?? "no row"})`);
  }

  const tns = createAdminClient();
  const { data: geoMapping } = await tns
    .from("geo_brands")
    .select("id, name")
    .eq("ftc_brand_id", input.brandId)
    .maybeSingle();
  const isCustomer = !!geoMapping;
  const brandName = (ftcBrand.brand_nm as string) ?? "?";

  const { data: brandFacts, error: fErr } = await fra
    .from("brand_facts")
    .select(
      "metric_id, metric_label, value_num, value_text, unit, period, source_tier, source_label, formula",
    )
    .eq("brand_id", input.brandId)
    .in("source_tier", input.tiers);
  if (fErr) throw new Error(`brand_facts fetch: ${fErr.message}`);

  const industries = [ftcBrand.induty_mlsfc, ftcBrand.induty_lclas].filter(
    (x): x is string => typeof x === "string" && x.length > 0,
  );
  let industryFacts: Record<string, unknown>[] = [];
  if (industries.length > 0) {
    const { data: ifData, error: ifErr } = await fra
      .from("industry_facts")
      .select(
        "metric_id, metric_label, value_num, unit, period, n, agg_method, source_label, industry",
      )
      .in("industry", industries);
    if (ifErr) console.warn(`[v3] industry_facts: ${ifErr.message}`);
    industryFacts = (ifData ?? []) as Record<string, unknown>[];
  }

  const factsPool: Fact[] = [
    ...(brandFacts ?? []).map((f) => ({
      metric_id: String(f.metric_id),
      metric_label: String(f.metric_label),
      value_num: f.value_num as number | null,
      value_text: f.value_text as string | null,
      unit: f.unit as string | null,
      period: f.period as string | null,
      source_tier: f.source_tier as "A" | "B" | "C",
      source_label: f.source_label as string | null,
      formula: f.formula as string | null,
    })),
    ...industryFacts.map((f) => ({
      metric_id: String(f.metric_id),
      metric_label: String(f.metric_label),
      value_num: f.value_num as number | null,
      value_text: null,
      unit: f.unit as string | null,
      period: f.period as string | null,
      source_tier: "A" as const,
      source_label: f.source_label as string | null,
      formula: null,
      industry: f.industry as string | null,
      n: f.n as number | null,
      agg_method: f.agg_method as string | null,
    })),
  ];

  return {
    factsPool,
    brandName,
    industryMain: (ftcBrand.induty_lclas as string | null) ?? null,
    industrySub: (ftcBrand.induty_mlsfc as string | null) ?? null,
    geoBrandId: (geoMapping?.id as string | undefined) ?? null,
    isCustomer,
  };
}

async function fetchIndustryFacts(input: { industry: string }): Promise<Fact[]> {
  const fra = createFrandoorClient();
  const { data, error } = await fra
    .from("industry_facts")
    .select(
      "metric_id, metric_label, value_num, unit, period, n, agg_method, source_label, industry",
    )
    .eq("industry", input.industry);
  if (error) throw new Error(`industry_facts fetch: ${error.message}`);

  return (data ?? []).map((f) => ({
    metric_id: String(f.metric_id),
    metric_label: String(f.metric_label),
    value_num: f.value_num as number | null,
    value_text: null,
    unit: f.unit as string | null,
    period: f.period as string | null,
    source_tier: "A" as const,
    source_label: f.source_label as string | null,
    formula: null,
    industry: f.industry as string | null,
    n: f.n as number | null,
    agg_method: f.agg_method as string | null,
  }));
}

// =============================================================================
// Step 1/2 retry wrappers (v3-02)
// =============================================================================

async function runPlanWithRetry(args: Parameters<typeof runPlan>[0]): Promise<PlanResult> {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      return await runPlan(args);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (attempt === 0 && /json|parse|expected/i.test(msg)) {
        console.warn(`[v3] Step 1 Plan JSON parse 실패 — 1회 재시도: ${msg}`);
        continue;
      }
      throw new Error(`Step 1 Plan failed: ${msg}`);
    }
  }
  throw new Error("Step 1 Plan: unreachable");
}

async function runStructureWithRetry(
  args: Parameters<typeof runStructure>[0],
): Promise<OutlineResult> {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      return await runStructure(args);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (attempt === 0 && /json|parse|expected/i.test(msg)) {
        console.warn(`[v3] Step 2 Structure JSON parse 실패 — 1회 재시도: ${msg}`);
        continue;
      }
      throw new Error(`Step 2 Structure failed: ${msg}`);
    }
  }
  throw new Error("Step 2 Structure: unreachable");
}

// =============================================================================
// Phase A — Plan + Structure → DB INSERT (stage='plan_done')
// =============================================================================

export async function runPhaseA(input: GenerateInput): Promise<PhaseAResult> {
  const today = new Date().toISOString().slice(0, 10);
  const t0 = Date.now();

  // (1) facts pool fetch
  let factsPool: Fact[];
  let brandName: string | undefined;
  let industryMain: string | null = null;
  let industrySub: string | null = null;
  let geoBrandId: string | null = null;
  let isCustomer = false;

  if (input.mode === "industry") {
    factsPool = await fetchIndustryFacts({ industry: input.industry });
  } else {
    const r = await fetchBrandFacts({ brandId: input.brandId, tiers: input.tiers });
    factsPool = r.factsPool;
    brandName = r.brandName;
    industryMain = r.industryMain;
    industrySub = r.industrySub;
    geoBrandId = r.geoBrandId;
    isCustomer = r.isCustomer;
  }

  console.log(
    `[v3.A] mode=${input.mode} facts=${factsPool.length} subject=${
      input.mode === "brand" ? brandName : input.industry
    }`,
  );

  if (factsPool.length < MIN_FACTS_REQUIRED) {
    throw new InsufficientDataError({
      factsCount: factsPool.length,
      required: MIN_FACTS_REQUIRED,
    });
  }

  // (2) Step 1 — Plan
  console.log(`[v3.A] step 1 — plan (haiku)...`);
  const tStep1 = Date.now();
  const plan = await runPlanWithRetry({
    mode: input.mode,
    brandName,
    industry: input.mode === "industry" ? input.industry : industrySub ?? industryMain ?? undefined,
    topic: input.topic,
    factsPool,
  });
  console.log(
    `[v3.A] step 1 done: ${Date.now() - tStep1}ms, selected_facts=${plan.selected_facts.length} outliers=${plan.outliers.length}`,
  );

  // (3) Step 2 — Structure
  console.log(`[v3.A] step 2 — structure (haiku)...`);
  const tStep2 = Date.now();
  const outline = await runStructureWithRetry({
    mode: input.mode,
    topic: input.topic,
    plan,
  });
  console.log(`[v3.A] step 2 done: ${Date.now() - tStep2}ms, blocks=${outline.blocks.length}`);

  // (4) DB INSERT — stage='plan_done', content=null
  const tns = createAdminClient();
  const placeholderTitle =
    input.mode === "brand"
      ? `[1단계 완료] ${brandName ?? "?"} — ${input.topic}`
      : `[1단계 완료] ${input.industry} 업종 — ${input.topic}`;

  const insertObj: Record<string, unknown> = {
    brand_id: geoBrandId,
    ftc_brand_id: input.mode === "brand" ? input.brandId : null,
    industry: input.mode === "industry" ? input.industry : null,
    channel: "frandoor",
    title: placeholderTitle,
    content: null,
    faq: [],
    meta: {
      mode: input.mode,
      topic: input.topic,
      tiers: input.tiers,
      isCustomer,
      brandName: brandName ?? null,
      industryMain,
      industrySub,
    },
    content_type: input.mode,
    status: "draft",
    target_date: today,
    pipeline_version: "v3",
    debug_plan_json: plan,
    debug_outline_json: outline,
    polish_log: null,
    stage: "plan_done",
  };

  const { data: ins, error: dErr } = await tns
    .from("frandoor_blog_drafts")
    .insert(insertObj)
    .select("id")
    .single();

  if (dErr || !ins) {
    throw new Error(`Phase A INSERT failed: ${dErr?.message ?? "no row"}`);
  }

  console.log(
    `[v3.A] ✓ TOTAL ${Date.now() - t0}ms, draftId=${ins.id} stage=plan_done`,
  );

  return {
    draftId: ins.id as string,
    plan,
    outline,
    factsCount: factsPool.length,
  };
}

// =============================================================================
// Phase B — Write + Polish + Validate → DB UPDATE (stage='write_done')
// =============================================================================

type DraftRow = {
  id: string;
  brand_id: string | null;
  ftc_brand_id: string | null;
  industry: string | null;
  content_type: string | null;
  meta: Record<string, unknown> | null;
  debug_plan_json: PlanResult | null;
  debug_outline_json: OutlineResult | null;
  stage: string | null;
};

async function loadDraft(draftId: string): Promise<DraftRow> {
  const tns = createAdminClient();
  const { data, error } = await tns
    .from("frandoor_blog_drafts")
    .select(
      "id, brand_id, ftc_brand_id, industry, content_type, meta, debug_plan_json, debug_outline_json, stage",
    )
    .eq("id", draftId)
    .maybeSingle();
  if (error) throw new Error(`draft load: ${error.message}`);
  if (!data) throw new DraftNotFoundError(draftId);
  return data as DraftRow;
}

function reconstructInput(draft: DraftRow): GenerateInput {
  const meta = (draft.meta ?? {}) as Record<string, unknown>;
  const topic = typeof meta.topic === "string" ? meta.topic : "";
  const tiersRaw = Array.isArray(meta.tiers) ? meta.tiers : [];
  const tiers = tiersRaw.filter(
    (t): t is "A" | "B" | "C" => t === "A" || t === "B" || t === "C",
  );
  const mode = draft.content_type === "industry" ? "industry" : "brand";

  if (mode === "industry") {
    if (!draft.industry) throw new Error("draft.industry 누락");
    return { mode: "industry", industry: draft.industry, topic, tiers };
  }
  if (!draft.ftc_brand_id) throw new Error("draft.ftc_brand_id 누락");
  return { mode: "brand", brandId: draft.ftc_brand_id, topic, tiers };
}

export async function runPhaseB(draftId: string): Promise<PhaseBResult> {
  const today = new Date().toISOString().slice(0, 10);
  const t0 = Date.now();

  // (1) draft load + stage 검증
  const draft = await loadDraft(draftId);
  if (draft.stage !== "plan_done") {
    throw new InvalidStageError(draftId, draft.stage);
  }
  if (!draft.debug_plan_json || !draft.debug_outline_json) {
    throw new Error(`draft ${draftId}: plan/outline JSON 누락`);
  }

  // (2) input 재구성
  const input = reconstructInput(draft);
  const plan = draft.debug_plan_json as PlanResult;
  const outline = draft.debug_outline_json as OutlineResult;

  // (3) facts pool 재 fetch (crosscheck 용)
  let factsPool: Fact[];
  let brandName: string | undefined;
  let industryMain: string | null = null;
  let industrySub: string | null = null;
  let isCustomer = false;

  if (input.mode === "industry") {
    factsPool = await fetchIndustryFacts({ industry: input.industry });
  } else {
    const r = await fetchBrandFacts({ brandId: input.brandId, tiers: input.tiers });
    factsPool = r.factsPool;
    brandName = r.brandName;
    industryMain = r.industryMain;
    industrySub = r.industrySub;
    isCustomer = r.isCustomer;
  }

  console.log(
    `[v3.B] draft=${draftId} mode=${input.mode} facts=${factsPool.length} subject=${
      input.mode === "brand" ? brandName : input.industry
    }`,
  );

  // (4) Step 3 — Write
  console.log(`[v3.B] step 3 — write (sonnet)...`);
  const tStep3 = Date.now();
  const draftBody = await runWrite({
    mode: input.mode,
    brandName,
    industry: input.mode === "industry" ? input.industry : industrySub ?? industryMain ?? undefined,
    industrySub: industrySub ?? undefined,
    isCustomer,
    topic: input.topic,
    today,
    plan,
    outline,
  });
  console.log(`[v3.B] step 3 done: ${Date.now() - tStep3}ms, len=${draftBody.body.length}`);

  // (5) Step 4 — Polish (post-process + haiku)
  console.log(`[v3.B] step 4 — polish (post + haiku)...`);
  const tStep4 = Date.now();
  const polished = await runPolish({ body: draftBody.body });
  console.log(
    `[v3.B] step 4 done: ${Date.now() - tStep4}ms, log: ${polished.log.join(" | ")}`,
  );

  // (6) crosscheck + lint (v3-03 단순화: Phase B retry 없음 — timeout 위험)
  const cc = crosscheckV3(polished.body, factsPool);
  const lintRes = lintV3(polished.body);
  console.log(
    `[v3.B] validate: matched=${cc.matched} unmatched=${cc.unmatched.length} lintErrors=${lintRes.errors.length}`,
  );
  if (!cc.ok) throw new HallucinationDetectedError(cc.unmatched);
  if (lintRes.errors.length > 0) throw new LintErrorV3(lintRes.errors);

  // (7) frontmatter 파싱 + date 강제 + FAQ lint
  const { title, frontmatter: rawFm } = parseFrontmatter(polished.body);
  const frontmatter = normalizeFrontmatter(rawFm, today);
  const faqLint = lintV3Faq(frontmatter.faq);
  const allWarnings = [...lintRes.warnings, ...faqLint.warnings];
  if (faqLint.errors.length > 0) throw new LintErrorV3(faqLint.errors);

  const finalContent = polished.body.replace(
    /^(---\s*\n[\s\S]*?\n---)/,
    (block) =>
      block
        .replace(/^date:\s*"?[^"\n]+"?$/m, `date: "${today}"`)
        .replace(/^dateModified:\s*"?[^"\n]+"?$/m, `dateModified: "${today}"`),
  );

  // (8) DB UPDATE — stage='write_done', content + faq + polish_log + meta 갱신
  const tns = createAdminClient();
  const finalTitle =
    title ||
    (input.mode === "brand"
      ? `${brandName} ${input.topic}`
      : `${input.industry} 업종 — ${input.topic}`);

  const existingMeta = (draft.meta ?? {}) as Record<string, unknown>;
  const updateObj: Record<string, unknown> = {
    title: finalTitle,
    content: finalContent,
    faq: frontmatter.faq ?? [],
    meta: {
      ...existingMeta,
      tags: frontmatter.tags ?? [],
      description: frontmatter.description ?? null,
      frontmatter,
    },
    polish_log: polished.log,
    stage: "write_done",
  };

  const { error: uErr } = await tns
    .from("frandoor_blog_drafts")
    .update(updateObj)
    .eq("id", draftId);

  if (uErr) {
    throw new Error(`Phase B UPDATE failed: ${uErr.message}`);
  }

  console.log(`[v3.B] ✓ TOTAL ${Date.now() - t0}ms, draftId=${draftId} stage=write_done`);

  return {
    draftId,
    title: finalTitle,
    content: finalContent,
    frontmatter,
    polishLog: polished.log,
    lintWarnings: allWarnings,
  };
}
