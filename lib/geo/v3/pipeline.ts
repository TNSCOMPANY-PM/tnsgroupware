/**
 * v3-01 pipeline — 4 step orchestrator.
 *  Step 1 (Plan, haiku) → Step 2 (Structure, haiku) → Step 3 (Write, sonnet) → Step 4 (Polish, post + haiku)
 *  → crosscheck + lint → unmatched/errors > 0 시 Step 3 재시도 (max 2회).
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
import type { Fact, GenerateInput, GenerateResult, OutlineResult, PlanResult } from "./types";

const MIN_FACTS_REQUIRED = 5;
const MAX_WRITE_RETRIES = 2;

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

export type V3GenerateOutput = {
  draftId: string | null;
  saveError: string | null;
  title: string;
  content: string;
  frontmatter: Record<string, unknown>;
  factsUsed: number;
  retryCount: number;
  polishLog: string[];
  lintWarnings: string[];
  plan: GenerateResult["plan"];
  outline: GenerateResult["outline"];
};

function parseFrontmatter(raw: string): {
  title: string;
  frontmatter: Record<string, unknown>;
  bodyMd: string;
} {
  // 외부 ``` 코드펜스 strip
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

async function fetchBrandFacts(input: {
  brandId: string;
  tiers: ("A" | "B" | "C")[];
}): Promise<{
  factsPool: Fact[];
  brandName: string;
  industryMain: string | null;
  industrySub: string | null;
  geoBrandId: string | null;
  isCustomer: boolean;
}> {
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
    if (ifErr) console.warn(`[v3.gen] industry_facts: ${ifErr.message}`);
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

/**
 * v3-02 — Step 1/2 JSON parse 실패 시 1회 재시도.
 * haiku 가 max_tokens 초과로 잘리거나 일시적 출력 깨짐 대응.
 */
async function runPlanWithRetry(args: Parameters<typeof runPlan>[0]): Promise<PlanResult> {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      return await runPlan(args);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (attempt === 0 && /json|parse|expected/i.test(msg)) {
        console.warn(`[v3.gen] Step 1 Plan JSON parse 실패 — 1회 재시도: ${msg}`);
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
        console.warn(`[v3.gen] Step 2 Structure JSON parse 실패 — 1회 재시도: ${msg}`);
        continue;
      }
      throw new Error(`Step 2 Structure failed: ${msg}`);
    }
  }
  throw new Error("Step 2 Structure: unreachable");
}

export async function generateV3(input: GenerateInput): Promise<V3GenerateOutput> {
  const today = new Date().toISOString().slice(0, 10);

  // (A) facts pool fetch
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
    `[v3.gen] mode=${input.mode} facts=${factsPool.length} subject=${
      input.mode === "brand" ? brandName : input.industry
    }`,
  );

  if (factsPool.length < MIN_FACTS_REQUIRED) {
    throw new InsufficientDataError({
      factsCount: factsPool.length,
      required: MIN_FACTS_REQUIRED,
    });
  }

  // (1) Step 1 — Plan (v3-02: JSON parse 실패 시 1회 재시도)
  console.log(`[v3.gen] step 1 — plan (haiku)...`);
  const plan = await runPlanWithRetry({
    mode: input.mode,
    brandName,
    industry: input.mode === "industry" ? input.industry : industrySub ?? industryMain ?? undefined,
    topic: input.topic,
    factsPool,
  });
  console.log(
    `[v3.gen] plan: selected_facts=${plan.selected_facts.length} outliers=${plan.outliers.length}`,
  );

  // (2) Step 2 — Structure (v3-02: JSON parse 실패 시 1회 재시도)
  console.log(`[v3.gen] step 2 — structure (haiku)...`);
  const outline = await runStructureWithRetry({
    mode: input.mode,
    topic: input.topic,
    plan,
  });
  console.log(`[v3.gen] outline: blocks=${outline.blocks.length}`);

  // (3) Step 3 — Write (with retry on cc/lint failure)
  let draftBody = "";
  let polishedBody = "";
  let polishLog: string[] = [];
  let retryCount = 0;
  let lastUnmatched: string[] = [];
  let lastLintErrors: string[] = [];
  let retryNote: string | undefined = undefined;

  while (retryCount <= MAX_WRITE_RETRIES) {
    console.log(`[v3.gen] step 3 — write (sonnet) retry=${retryCount}...`);
    const draft = await runWrite({
      mode: input.mode,
      brandName,
      industry: input.mode === "industry" ? input.industry : industrySub ?? industryMain ?? undefined,
      industrySub: industrySub ?? undefined,
      isCustomer,
      topic: input.topic,
      today,
      plan,
      outline,
      retryNote,
    });
    draftBody = draft.body;

    console.log(`[v3.gen] step 4 — polish (post + haiku)...`);
    const polished = await runPolish({ body: draftBody });
    polishedBody = polished.body;
    polishLog = polished.log;
    console.log(`[v3.gen] polish log: ${polishLog.join(" | ")}`);

    // 4-C validate
    const cc = crosscheckV3(polishedBody, factsPool);
    const lint = lintV3(polishedBody);
    lastUnmatched = cc.unmatched;
    lastLintErrors = lint.errors;
    console.log(
      `[v3.gen] validate: matched=${cc.matched} unmatched=${cc.unmatched.length} lintErrors=${lint.errors.length}`,
    );

    if (cc.ok && lint.errors.length === 0) {
      break; // 통과
    }

    if (retryCount >= MAX_WRITE_RETRIES) {
      // 더 이상 retry 안 함
      if (!cc.ok) throw new HallucinationDetectedError(cc.unmatched);
      if (lint.errors.length > 0) throw new LintErrorV3(lint.errors);
    }

    // retryNote 작성 — Step 3 만 재시도
    const noteParts: string[] = [];
    if (cc.unmatched.length > 0) {
      noteParts.push(
        `[검증 실패] 다음 숫자/출처가 facts pool 에 없습니다. 본문에서 제거하거나 facts 의 값으로 교체:`,
        ...cc.unmatched.slice(0, 20).map((u) => `  - ${u}`),
      );
    }
    if (lint.errors.length > 0) {
      noteParts.push(
        `[lint 실패] 다음 룰 위반:`,
        ...lint.errors.slice(0, 10).map((e) => `  - ${e}`),
      );
    }
    retryNote = noteParts.join("\n");
    retryCount++;
  }

  // (4) frontmatter 파싱 + date 강제
  const { title, frontmatter: rawFm, bodyMd } = parseFrontmatter(polishedBody);
  const frontmatter = normalizeFrontmatter(rawFm, today);

  // FAQ lint
  const faqLint = lintV3Faq(frontmatter.faq);
  const lintRes = lintV3(polishedBody);
  const allWarnings = [...lintRes.warnings, ...faqLint.warnings];
  if (faqLint.errors.length > 0) {
    throw new LintErrorV3(faqLint.errors);
  }

  // (5) draft 저장 — date / dateModified 강제 치환
  const finalContent = polishedBody.replace(
    /^(---\s*\n[\s\S]*?\n---)/,
    (block) =>
      block
        .replace(/^date:\s*"?[^"\n]+"?$/m, `date: "${today}"`)
        .replace(/^dateModified:\s*"?[^"\n]+"?$/m, `dateModified: "${today}"`),
  );

  const tns = createAdminClient();
  let draftId: string | null = null;
  let saveError: string | null = null;
  try {
    const insertObj: Record<string, unknown> = {
      brand_id: geoBrandId,
      ftc_brand_id: input.mode === "brand" ? input.brandId : null,
      industry: input.mode === "industry" ? input.industry : null,
      channel: "frandoor",
      title:
        title ||
        (input.mode === "brand"
          ? `${brandName} ${input.topic}`
          : `${input.industry} 업종 — ${input.topic}`),
      content: finalContent,
      faq: frontmatter.faq ?? [],
      meta: {
        tags: frontmatter.tags ?? [],
        description: frontmatter.description ?? null,
        frontmatter,
        mode: input.mode,
        isCustomer,
      },
      content_type: input.mode,
      status: "draft",
      target_date: today,
      pipeline_version: "v3",
      debug_plan_json: plan,
      debug_outline_json: outline,
      polish_log: polishLog,
    };
    const { data: ins, error: dErr } = await tns
      .from("frandoor_blog_drafts")
      .insert(insertObj)
      .select("id")
      .single();
    if (dErr) saveError = dErr.message;
    else draftId = ins?.id ?? null;
  } catch (e) {
    saveError = e instanceof Error ? e.message : String(e);
  }

  console.log(`[v3.gen] ✓ draftId=${draftId} retry=${retryCount}`);

  return {
    draftId,
    saveError,
    title:
      title ||
      (input.mode === "brand"
        ? `${brandName} ${input.topic}`
        : `${input.industry} 업종 — ${input.topic}`),
    content: bodyMd,
    frontmatter,
    factsUsed: factsPool.length,
    retryCount,
    polishLog,
    lintWarnings: allWarnings,
    plan,
    outline,
  };
}
