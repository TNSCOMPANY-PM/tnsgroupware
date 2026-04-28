/**
 * v2-04 LLM3 글 생성 entry.
 * 데이터 layer (LLM1·LLM2 적재한 brand_facts/industry_facts) 와 글 생성 layer 완전 분리.
 * crosscheckV2 0건 정책 + lintV2 errors 0건 정책. 위반 시 throw.
 */

import "server-only";
import { createAdminClient } from "@/utils/supabase/admin";
import { createFrandoorClient } from "@/utils/supabase/frandoor";
import { buildSystemPrompt, type FactPoolItem } from "./sysprompt";
import { crosscheckV2 } from "./crosscheck";
import { lintV2, lintV2Faq } from "./lint";
import { callSonnetV2 } from "./sonnet";

export type GenerateV2Input = {
  brandId: string;
  topic: string;
  tiers: ("A" | "B" | "C")[];
};

export type GenerateV2Output = {
  draftId: string | null;
  saveError: string | null;
  title: string;
  content: string;
  frontmatter: Record<string, unknown>;
  factsUsed: number;
  unmatchedRetries: number;
  lintWarnings: string[];
};

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

export class LintV2Error extends Error {
  code = "LINT_V2_FAILED";
  constructor(public lintErrors: string[]) {
    super(`lint v2 errors: ${lintErrors.join(" | ")}`);
    this.name = "LintV2Error";
  }
}

const MIN_FACTS_REQUIRED = 5;

/**
 * frontmatter (---\n{yaml}\n---) 파싱.
 * yaml 라이브러리 부재 — 휴리스틱 파서 (간단 키:값 + faq 리스트).
 */
function parseFrontmatter(raw: string): {
  title: string;
  frontmatter: Record<string, unknown>;
  bodyMd: string;
} {
  const m = raw.match(/^---\s*\n([\s\S]*?)\n---\s*\n([\s\S]*)$/);
  if (!m) {
    return { title: "", frontmatter: {}, bodyMd: raw.trim() };
  }
  const yaml = m[1];
  const bodyMd = m[2].trim();
  const fm: Record<string, unknown> = {};

  // 단순 key: "value" 또는 key: [a, b, c] 또는 key: \n  - q: ... \n    a: ...
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
      // 다음 줄들 - q: / a: 페어 파싱
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
          // 다음 top-level key — faq 종료
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

    // 배열 형식: ["a", "b"] 또는 [a, b]
    if (rest.startsWith("[") && rest.endsWith("]")) {
      const inner = rest.slice(1, -1);
      const items = inner
        .split(",")
        .map((s) => s.trim().replace(/^["']|["']$/g, ""))
        .filter(Boolean);
      fm[key] = items;
    } else {
      // 따옴표 제거
      fm[key] = rest.replace(/^["']|["']$/g, "");
    }
    i++;
  }

  const title = typeof fm.title === "string" ? fm.title : "";
  return { title, frontmatter: fm, bodyMd };
}

export async function generateV2(input: GenerateV2Input): Promise<GenerateV2Output> {
  // v2-10/11: input.brandId = ftc_brands_2024.id (TEXT — int 또는 uuid 등 어느 형태든 string 으로 다룸).
  // (1) ftc brand 정보 (frandoor)
  const fra = createFrandoorClient();
  const { data: ftcBrand, error: bErr } = await fra
    .from("ftc_brands_2024")
    .select("id, brand_nm, corp_nm, induty_lclas, induty_mlsfc")
    .eq("id", input.brandId)
    .maybeSingle();
  if (bErr || !ftcBrand) {
    throw new Error(`ftc brand not found: ${input.brandId} (${bErr?.message ?? "no row"})`);
  }

  // (2) geo_brands 매핑 확인 — 우리 고객일 경우 docx layer 추가
  const tns = createAdminClient();
  const { data: geoMapping } = await tns
    .from("geo_brands")
    .select("id, name")
    .eq("ftc_brand_id", input.brandId)
    .maybeSingle();
  const isCustomer = !!geoMapping;
  const brandName = (ftcBrand.brand_nm as string) ?? "?";

  // (3) brand_facts retrieve (ftc + 매핑된 docx 모두 — brand_id 가 ftc PK 통일)
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
    if (ifErr) console.warn(`[v2.gen] industry_facts: ${ifErr.message}`);
    industryFacts = (ifData ?? []) as Record<string, unknown>[];
  }

  const factsPool: FactPoolItem[] = [
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

  console.log(
    `[v2.gen] brand=${brandName} (customer=${isCustomer}) facts=${factsPool.length} (brand_facts=${brandFacts?.length ?? 0} + industry_facts=${industryFacts.length})`,
  );

  // (4) guard — facts 부족
  if (factsPool.length < MIN_FACTS_REQUIRED) {
    throw new InsufficientDataError({
      factsCount: factsPool.length,
      required: MIN_FACTS_REQUIRED,
    });
  }

  // (5) sonnet 1차 호출
  const sysPrompt = buildSystemPrompt({
    brand: {
      id: ftcBrand.id != null ? String(ftcBrand.id) : input.brandId,
      name: brandName,
      industry_main: (ftcBrand.induty_lclas as string | null) ?? null,
      industry_sub: (ftcBrand.induty_mlsfc as string | null) ?? null,
    },
    factsPool,
    topic: input.topic,
  });

  console.log(`[v2.gen] sonnet 1차 호출...`);
  let raw = await callSonnetV2({ system: sysPrompt, user: input.topic });
  let unmatchedRetries = 0;

  // (5) crosscheck
  let cc = crosscheckV2(raw, factsPool);
  console.log(`[v2.gen] cc(1) matched=${cc.matched} unmatched=${cc.unmatched.length}`);

  if (!cc.ok) {
    // 1회 재호출 — unmatched 명시 + 교체 요청
    unmatchedRetries = 1;
    const retryUser = [
      input.topic,
      "",
      "[검증 실패] 다음 숫자/출처가 facts pool 에 없습니다.",
      "본문에서 해당 값을 제거하거나 facts pool 에 있는 값으로 교체하세요:",
      ...cc.unmatched.slice(0, 30).map((u) => `  - ${u}`),
    ].join("\n");
    console.log(`[v2.gen] sonnet 재호출 (unmatched ${cc.unmatched.length}건)...`);
    raw = await callSonnetV2({ system: sysPrompt, user: retryUser });
    cc = crosscheckV2(raw, factsPool);
    console.log(`[v2.gen] cc(2) matched=${cc.matched} unmatched=${cc.unmatched.length}`);
    if (!cc.ok) {
      throw new HallucinationDetectedError(cc.unmatched);
    }
  }

  // (6) hard lint v2
  const lintRes = lintV2(raw);
  if (lintRes.errors.length > 0) {
    console.log(`[v2.gen] lint errors: ${lintRes.errors.join(" | ")}`);
    throw new LintV2Error(lintRes.errors);
  }

  // (7) frontmatter 파싱
  const { title, frontmatter, bodyMd } = parseFrontmatter(raw);

  // (7b) FAQ lint (frontmatter 파싱 후)
  const faqLint = lintV2Faq(frontmatter.faq);
  const allWarnings = [...lintRes.warnings, ...faqLint.warnings];
  if (faqLint.errors.length > 0) {
    throw new LintV2Error(faqLint.errors);
  }

  // (8) draft 저장 (frontmatter YAML + 본문 prepend)
  const finalContent = raw; // sonnet 응답 그대로 (frontmatter 포함)
  let draftId: string | null = null;
  let saveError: string | null = null;
  try {
    // v2-10: brand_id = geo_brands.id (우리 고객일 때만), ftc_brand_id = ftc PK 항상.
    const { data: ins, error: dErr } = await tns
      .from("frandoor_blog_drafts")
      .insert({
        brand_id: geoMapping?.id ?? null,
        ftc_brand_id: input.brandId,
        channel: "frandoor",
        title: title || `${brandName} ${input.topic}`,
        content: finalContent,
        faq: frontmatter.faq ?? [],
        meta: {
          tags: frontmatter.tags ?? [],
          description: frontmatter.description ?? null,
          frontmatter,
          isCustomer,
        },
        content_type: "brand",
        status: "draft",
        target_date: new Date().toISOString().slice(0, 10),
      })
      .select("id")
      .single();
    if (dErr) saveError = dErr.message;
    else draftId = ins?.id ?? null;
  } catch (e) {
    saveError = e instanceof Error ? e.message : String(e);
  }

  console.log(`[v2.gen] ✓ draftId=${draftId} unmatchedRetries=${unmatchedRetries}`);

  return {
    draftId,
    saveError,
    title: title || `${brandName} ${input.topic}`,
    content: bodyMd,
    frontmatter,
    factsUsed: factsPool.length,
    unmatchedRetries,
    lintWarnings: allWarnings,
  };
}
