import OpenAI from "openai";
import { FACT_EXTRACTION_SCHEMA, type FactLabel } from "./factSchema";
import { prescanSections, extractByFranchiseTargets, mergeSections, detectMode, type Section } from "./factPrescan";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export type ExtractedFact = { label: FactLabel; keyword: string; unit: string; source: string };
export type ExtractResult = {
  keywords: ExtractedFact[];
  raw_text: string;
  official_data: Record<string, unknown> | null;
  chunks_processed: number;
};

function splitIntoChunks(text: string, maxChars = 12000): { content: string; hint: string }[] {
  const chunks: { content: string; hint: string }[] = [];
  const paras = text.split(/\n\n+/);
  let buffer = "";
  let currentHint = "";

  for (const para of paras) {
    const sectionMatch = para.match(/^(제\s*\d+\s*장|【[^】]+】|\[시트:[^\]]+\]|\d+\.\s+[가-힣][^\n]{0,30})/);
    if (sectionMatch) currentHint = sectionMatch[0];

    if ((buffer + "\n\n" + para).length > maxChars) {
      if (buffer) chunks.push({ content: buffer, hint: currentHint });
      buffer = para;
    } else {
      buffer = buffer ? buffer + "\n\n" + para : para;
    }
  }
  if (buffer) chunks.push({ content: buffer, hint: currentHint });
  return chunks;
}

async function extractFromChunk(brandName: string, chunk: string, hint: string, source: string): Promise<ExtractedFact[]> {
  try {
    const result = await openai.chat.completions.create({
      model: "gpt-5.4",
      response_format: { type: "json_schema", json_schema: FACT_EXTRACTION_SCHEMA },
      messages: [
        {
          role: "system",
          content: `프랜차이즈 팩트 추출 전문가. "${brandName}" 관련 수치·팩트를 JSON으로만 반환.
규칙:
1. label은 enum 값만 사용. 다른 이름 절대 금지.
2. 수치는 만원 단위 통일. "1억 5천만원" → "15000". 범위는 "최소-최대" 형식.
3. 원문에 없는 항목은 keywords 빈 배열로.
4. official_data 는 이 청크에 공정위 데이터 없으면 모든 필드 null.
현재 섹션: ${hint || "(없음)"}
출처: ${source}`,
        },
        { role: "user", content: chunk.slice(0, 15000) },
      ],
    });
    const parsed = JSON.parse(result.choices[0]?.message?.content ?? "{}");
    return (parsed.keywords ?? []).map((k: ExtractedFact) => ({ ...k, source: k.source || source }));
  } catch (e) {
    console.error("[factExtractor] chunk 추출 실패:", e);
    return [];
  }
}

function mergeFacts(chunksOfFacts: ExtractedFact[][]): ExtractedFact[] {
  const byLabel = new Map<string, ExtractedFact[]>();
  for (const facts of chunksOfFacts) {
    for (const f of facts) {
      const arr = byLabel.get(f.label) ?? [];
      arr.push(f);
      byLabel.set(f.label, arr);
    }
  }

  const result: ExtractedFact[] = [];
  for (const [, candidates] of byLabel) {
    if (candidates.length === 1) { result.push(candidates[0]); continue; }
    // Prefer official sources
    const official = candidates.find(c => c.source.includes("공정위"));
    if (official) { result.push(official); continue; }
    // Prefer range values
    const range = candidates.find(c => /[-~]/.test(c.keyword));
    if (range) { result.push(range); continue; }
    // Prefer longest keyword (most specific)
    result.push([...candidates].sort((a, b) => b.keyword.length - a.keyword.length)[0]);
  }
  return result;
}

export async function extractFactsFromLargeText(
  brandName: string,
  fullText: string,
  sourceName: string,
  options: { maxChars?: number } = {}
): Promise<ExtractResult> {
  const maxChars = options.maxChars ?? 150_000;
  const mode = detectMode(fullText, sourceName);

  let selectedText: string;
  if (fullText.length < 30000) {
    selectedText = fullText;
  } else if (mode === "disclosure") {
    const target = extractByFranchiseTargets(fullText);
    const pre = prescanSections(fullText, maxChars);
    const merged = mergeSections(target, pre, maxChars);
    selectedText = merged.map(s => s.content).join("\n\n");
  } else {
    const pre = prescanSections(fullText, maxChars);
    selectedText = pre.map(s => s.content).join("\n\n");
  }

  const chunks = splitIntoChunks(selectedText, 12000);

  // Batch extract (max 5 concurrent)
  const allFacts: ExtractedFact[][] = [];
  const batchSize = 5;
  for (let i = 0; i < chunks.length; i += batchSize) {
    const batch = chunks.slice(i, i + batchSize);
    const results = await Promise.all(
      batch.map(c => extractFromChunk(brandName, c.content, c.hint, sourceName))
    );
    allFacts.push(...results);
  }

  const merged = mergeFacts(allFacts);

  // Extract official data from relevant sections
  let officialData: Record<string, unknown> | null = null;
  const officialKeywords = ["공정거래위원회", "정보공개서", "가맹본부", "가맹금", "폐점률"];
  const excerpts: string[] = [];
  for (const kw of officialKeywords) {
    const idx = fullText.indexOf(kw);
    if (idx >= 0) excerpts.push(fullText.slice(Math.max(0, idx - 1000), Math.min(fullText.length, idx + 3000)));
  }
  if (excerpts.length > 0) {
    try {
      const combined = excerpts.join("\n\n---\n\n").slice(0, 15000);
      const result = await openai.chat.completions.create({
        model: "gpt-5.4",
        response_format: { type: "json_schema", json_schema: FACT_EXTRACTION_SCHEMA },
        messages: [
          { role: "system", content: `"${brandName}" 공정거래위원회 정보공개서 데이터만 추출. keywords는 빈 배열. raw_text는 빈 문자열.` },
          { role: "user", content: combined },
        ],
      });
      const parsed = JSON.parse(result.choices[0]?.message?.content ?? "{}");
      officialData = parsed.official_data ?? null;
    } catch { /* skip */ }
  }

  // raw_text: sample from chunks
  const rawText = chunks.slice(0, 8).map((c, i) =>
    `[청크${i + 1}${c.hint ? ` ${c.hint}` : ""}]\n${c.content.slice(0, 500)}`
  ).join("\n\n").slice(0, 4000);

  return { keywords: merged, raw_text: rawText, official_data: officialData, chunks_processed: chunks.length };
}
