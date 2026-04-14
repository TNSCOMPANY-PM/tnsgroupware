import { xlsxBufferToText } from "./factExtractorXlsx";
import { createHash } from "crypto";

export type ParseMeta = {
  text: string;
  size: number;
  hash: string;
  isScanPdf: boolean;
  pageCount?: number;
};

/**
 * Parse a file from a URL into plain text.
 * Supports: txt, csv, pdf, docx, xlsx, xls
 */
export async function parseFile(url: string, filename: string): Promise<string> {
  const meta = await parseFileWithMeta(url, filename);
  return meta.text;
}

/**
 * Parse a file AND return metadata (size, SHA-256 hash, scan-PDF detection).
 */
export async function parseFileWithMeta(url: string, filename: string): Promise<ParseMeta> {
  const ext = filename.split(".").pop()?.toLowerCase() ?? "";
  const res = await fetch(url);
  if (!res.ok) throw new Error(`fetch ${filename} failed: ${res.status}`);

  const buf = Buffer.from(await res.arrayBuffer());
  const size = buf.length;
  const hash = createHash("sha256").update(buf).digest("hex");

  if (ext === "txt" || ext === "csv") {
    return { text: buf.toString("utf8"), size, hash, isScanPdf: false };
  }

  if (ext === "pdf") {
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { PDFParse } = require("pdf-parse") as { PDFParse: new (opts: { data: Buffer }) => { getText: () => Promise<{ text: string; total?: number; pages?: unknown[] }> } };
      const parser = new PDFParse({ data: buf });
      const result = await parser.getText();
      const text: string = result.text ?? "";
      const pageCount: number = result.total ?? result.pages?.length ?? 0;
      // 스캔 PDF 판정: 페이지당 평균 50자 미만이면 이미지 기반으로 간주
      const isScanPdf = pageCount > 0 && text.length / pageCount < 50;
      return { text, size, hash, isScanPdf, pageCount };
    } catch (e) {
      console.error(`PDF 파싱 실패 (${filename}):`, e);
      return { text: "", size, hash, isScanPdf: false };
    }
  }

  if (ext === "docx") {
    try {
      const mammoth = await import("mammoth");
      // convertToHtml 로 표 구조 보존 후 markdown 변환
      const result = await mammoth.convertToHtml({ buffer: buf });
      const text = docxHtmlToMarkdown(result.value);
      return { text, size, hash, isScanPdf: false };
    } catch (e) {
      console.error(`DOCX 파싱 실패 (${filename}):`, e);
      return { text: "", size, hash, isScanPdf: false };
    }
  }

  if (ext === "xlsx" || ext === "xls") {
    try {
      return { text: xlsxBufferToText(buf), size, hash, isScanPdf: false };
    } catch (e) {
      console.error(`Excel 파싱 실패 (${filename}):`, e);
      return { text: "", size, hash, isScanPdf: false };
    }
  }

  // Fallback
  try {
    const text = buf.toString("utf8");
    const controlChars = (text.slice(0, 1000).match(/[\x00-\x08\x0E-\x1F]/g) ?? []).length;
    return { text: controlChars > 10 ? "" : text, size, hash, isScanPdf: false };
  } catch {
    return { text: "", size, hash, isScanPdf: false };
  }
}

/**
 * mammoth 가 생성한 HTML 을 팩트 추출용 markdown 으로 변환.
 * 핵심: 표 구조를 markdown table 로 보존해서 GPT 가 행/열 맥락을 잃지 않게 함.
 * (extractRawText 는 표를 단순 텍스트로 풀어버려 "어느 행의 5,210만원인지" 파악 불가.)
 */
function docxHtmlToMarkdown(html: string): string {
  let md = html;

  md = md.replace(/<h1[^>]*>([\s\S]*?)<\/h1>/gi, (_, t) => `\n# ${stripTags(t)}\n`);
  md = md.replace(/<h2[^>]*>([\s\S]*?)<\/h2>/gi, (_, t) => `\n## ${stripTags(t)}\n`);
  md = md.replace(/<h3[^>]*>([\s\S]*?)<\/h3>/gi, (_, t) => `\n### ${stripTags(t)}\n`);

  // table → markdown table (행/열 구조 유지)
  md = md.replace(/<table[^>]*>([\s\S]*?)<\/table>/gi, (_, inner) => {
    const rows = [...inner.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)].map((m) => {
      const cells = [...m[1].matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi)].map((c) =>
        stripTags(c[1]).replace(/\|/g, "\\|"),
      );
      return "| " + cells.join(" | ") + " |";
    });
    if (rows.length === 0) return "";
    const colCount = (rows[0].match(/\|/g) || []).length - 1;
    const divider = "| " + Array(colCount).fill("---").join(" | ") + " |";
    return "\n" + [rows[0], divider, ...rows.slice(1)].join("\n") + "\n";
  });

  md = md.replace(/<li[^>]*>([\s\S]*?)<\/li>/gi, (_, t) => `- ${stripTags(t)}\n`);
  md = md.replace(/<\/?(ul|ol)[^>]*>/gi, "\n");
  md = md.replace(/<p[^>]*>([\s\S]*?)<\/p>/gi, (_, t) => `${stripTags(t)}\n\n`);
  md = md.replace(/<br\s*\/?>/gi, "\n");
  md = md.replace(/<[^>]+>/g, "");
  md = decodeHtmlEntities(md);
  md = md.replace(/\n{3,}/g, "\n\n").trim();
  return md;
}

function stripTags(html: string): string {
  return decodeHtmlEntities(html.replace(/<[^>]+>/g, "")).replace(/\s+/g, " ").trim();
}

function decodeHtmlEntities(s: string): string {
  return s
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}
