import OpenAI from "openai";
import { createHash } from "crypto";
import { createAdminClient } from "@/utils/supabase/admin";
import { parseFileWithMeta, type ParseMeta } from "@/utils/fileParser";
import { extractFactsFromLargeText, type ExtractResult } from "@/utils/factExtractor";
import { validateFacts, type ValidationIssue } from "@/utils/factValidator";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

type FactFile = { url: string; name: string };

export const MAX_FILE_SIZE = 50 * 1024 * 1024;
export const MAX_TOTAL_CHARS = 3_000_000;
export const EXTRACT_MAX_CHARS = 150_000;

export type ProgressEvent =
  | { stage: "start"; total_files: number }
  | { stage: "cache_check"; hit: boolean }
  | { stage: "parse"; current: number; total: number; name: string; size?: number; scan?: boolean }
  | { stage: "parse_skip"; name: string; reason: string }
  | { stage: "official_search" }
  | { stage: "prescan"; chars: number }
  | { stage: "extract"; chunks_processed: number }
  | { stage: "validate"; issues: number }
  | { stage: "save" }
  | { stage: "done"; result: Record<string, unknown> }
  | { stage: "error"; error: string };

export type ExtractRunResult = {
  status: number;
  body: Record<string, unknown>;
};

async function saveFactData(
  supabase: ReturnType<typeof createAdminClient>,
  brandId: string,
  currentFactData: unknown,
  extracted: ExtractResult,
) {
  const PRESERVE_LABELS = ["__blog_ref_links__", "__brand_plan__", "__brand_images__"];
  const preserved = (currentFactData && Array.isArray(currentFactData))
    ? (currentFactData as { label: string; keyword: string }[]).filter(d => PRESERVE_LABELS.includes(d.label))
    : [];

  const officialEntry = extracted.official_data && (extracted.official_data as Record<string, unknown>).stores_total != null
    ? [{ keyword: JSON.stringify(extracted.official_data), label: "__official_data__" }]
    : [];

  const factData = [
    ...extracted.keywords.map(k => ({ keyword: k.keyword, label: k.label })),
    { keyword: extracted.raw_text, label: "__raw_text__" },
    ...officialEntry,
    ...preserved,
  ];

  await supabase.from("geo_brands").update({ fact_data: factData }).eq("id", brandId);
}

export async function runExtractFacts(
  brandId: string,
  emit: (ev: ProgressEvent) => void = () => {},
): Promise<ExtractRunResult> {
  const supabase = createAdminClient();
  const { data: brand } = await supabase
    .from("geo_brands")
    .select("name, fact_file_url, landing_url, fact_data")
    .eq("id", brandId)
    .single();

  if (!brand) return { status: 404, body: { error: "브랜드 없음" } };

  let files: FactFile[] = [];
  if (brand.fact_file_url) {
    try {
      const parsed = JSON.parse(brand.fact_file_url);
      if (Array.isArray(parsed)) {
        files = parsed.map((v: string | FactFile) => typeof v === "string" ? { url: v, name: "" } : v);
      }
    } catch {
      if (brand.fact_file_url) files = [{ url: brand.fact_file_url, name: "" }];
    }
  }

  emit({ stage: "start", total_files: files.length });

  const parsedFiles: { text: string; source: string; meta: ParseMeta }[] = [];
  for (let i = 0; i < files.length; i++) {
    const f = files[i];
    try {
      const meta = await parseFileWithMeta(f.url, f.name);
      if (meta.size > MAX_FILE_SIZE) {
        const msg = `파일 크기 초과 (${(meta.size / 1024 / 1024).toFixed(1)}MB, 상한 50MB)`;
        emit({ stage: "parse_skip", name: f.name, reason: msg });
        console.warn(`[extract-facts] ${f.name}: ${msg}`);
        continue;
      }
      emit({ stage: "parse", current: i + 1, total: files.length, name: f.name, size: meta.size, scan: meta.isScanPdf });
      if (meta.text && meta.text.length > 100) {
        parsedFiles.push({ text: meta.text, source: f.name || "파일", meta });
      } else if (meta.isScanPdf) {
        emit({ stage: "parse_skip", name: f.name, reason: "스캔 PDF 감지 - 텍스트 추출 실패 (OCR 필요)" });
      }
    } catch (e) {
      emit({ stage: "parse_skip", name: f.name, reason: e instanceof Error ? e.message : "파싱 실패" });
      console.error(`[extract-facts] 파일 파싱 실패: ${f.name}`, e);
    }
  }

  const combinedHash = parsedFiles.length > 0
    ? createHash("sha256")
        .update(parsedFiles.map(p => p.meta.hash).sort().join("|") + "|" + (brand.landing_url ?? ""))
        .digest("hex")
    : null;

  if (combinedHash) {
    const { data: cached } = await supabase
      .from("fact_extract_cache")
      .select("facts, raw_text, official_data, chunks_processed")
      .eq("file_hash", combinedHash)
      .maybeSingle();
    if (cached && cached.facts) {
      emit({ stage: "cache_check", hit: true });
      const extracted: ExtractResult = {
        keywords: cached.facts as ExtractResult["keywords"],
        raw_text: cached.raw_text ?? "",
        official_data: cached.official_data as Record<string, unknown> | null,
        chunks_processed: cached.chunks_processed ?? 0,
      };
      const validationIssues = validateFacts(extracted.keywords);
      await saveFactData(supabase, brandId, brand.fact_data, extracted);
      const result = {
        ok: true,
        from_cache: true,
        keywords_count: extracted.keywords.length,
        chunks_processed: extracted.chunks_processed,
        has_official_data: !!extracted.official_data,
        validation_issues: validationIssues,
        keywords: extracted.keywords.slice(0, 15),
      };
      emit({ stage: "done", result });
      return { status: 200, body: result };
    }
    emit({ stage: "cache_check", hit: false });
  }

  const extractedTexts: { text: string; source: string }[] = parsedFiles.map(p => ({ text: p.text, source: p.source }));
  if (brand.landing_url) {
    try {
      const res = await fetch(brand.landing_url);
      if (res.ok) {
        const html = await res.text();
        const text = html
          .replace(/<script[\s\S]*?<\/script>/g, "")
          .replace(/<style[\s\S]*?<\/style>/g, "")
          .replace(/<[^>]+>/g, " ")
          .replace(/\s+/g, " ")
          .trim();
        if (text.length > 500) extractedTexts.push({ text: text.slice(0, 50000), source: "홈페이지" });
      }
    } catch { /* ignore */ }
  }

  emit({ stage: "official_search" });
  let officialSearchText = "";
  try {
    const result = await openai.responses.create({
      model: "gpt-5.4-mini",
      tools: [{ type: "web_search_preview" as const }],
      instructions: "공정위 정보공개서 수치만 텍스트로 정리. 출처 URL 명시. 한국어.",
      input: `"${brand.name}" 프랜차이즈 공정거래위원회 정보공개서 최신 데이터 검색. 가맹점 수, 창업비용, 평균매출, 폐점률 등.`,
    });
    for (const o of result.output ?? []) {
      if (o.type === "message" && "content" in o) {
        for (const c of (o as unknown as { content: { type: string; text?: string }[] }).content) {
          if (c.type === "output_text" && c.text) officialSearchText += c.text + "\n";
        }
      }
    }
  } catch (e) {
    console.error("[extract-facts] 공정위 웹검색 실패:", e instanceof Error ? e.message : e);
  }
  if (officialSearchText) extractedTexts.push({ text: officialSearchText, source: "공정위 웹검색" });

  if (extractedTexts.length === 0) {
    const result = { ok: true, keywords_count: 0, message: "추출할 텍스트가 없습니다" };
    emit({ stage: "done", result });
    return { status: 200, body: result };
  }

  let mergedText = extractedTexts.map(t => `[출처: ${t.source}]\n${t.text}`).join("\n\n===\n\n");
  if (mergedText.length > MAX_TOTAL_CHARS) {
    console.warn(`[extract-facts] 원본 ${mergedText.length}자 → ${MAX_TOTAL_CHARS}자로 절단`);
    mergedText = mergedText.slice(0, MAX_TOTAL_CHARS);
  }
  emit({ stage: "prescan", chars: mergedText.length });

  try {
    const extracted = await extractFactsFromLargeText(brand.name, mergedText, "통합", { maxChars: EXTRACT_MAX_CHARS });
    emit({ stage: "extract", chunks_processed: extracted.chunks_processed });

    const validationIssues: ValidationIssue[] = validateFacts(extracted.keywords);
    emit({ stage: "validate", issues: validationIssues.length });

    emit({ stage: "save" });
    await saveFactData(supabase, brandId, brand.fact_data, extracted);

    if (combinedHash) {
      const { error: cacheErr } = await supabase.from("fact_extract_cache").upsert({
        file_hash: combinedHash,
        file_name: parsedFiles.map(p => p.source).join(", ").slice(0, 200),
        facts: extracted.keywords,
        raw_text: extracted.raw_text,
        official_data: extracted.official_data,
        chunks_processed: extracted.chunks_processed,
      });
      if (cacheErr) console.warn("[extract-facts] 캐시 저장 실패 (무시):", cacheErr.message);
    }

    const result = {
      ok: true,
      from_cache: false,
      keywords_count: extracted.keywords.length,
      chunks_processed: extracted.chunks_processed,
      has_official_data: !!extracted.official_data,
      validation_issues: validationIssues,
      keywords: extracted.keywords.slice(0, 15),
    };
    emit({ stage: "done", result });
    return { status: 200, body: result };
  } catch (e) {
    console.error("[extract-facts] 추출 실패:", e);
    const msg = `팩트 추출 실패: ${e instanceof Error ? e.message : ""}`;
    emit({ stage: "error", error: msg });
    return { status: 500, body: { error: msg } };
  }
}
