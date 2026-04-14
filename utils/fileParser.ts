// eslint-disable-next-line @typescript-eslint/no-require-imports
const XLSX = require("xlsx");

/**
 * Parse a file from a URL into plain text.
 * Supports: txt, csv, pdf, docx, xlsx, xls
 */
export async function parseFile(url: string, filename: string): Promise<string> {
  const ext = filename.split(".").pop()?.toLowerCase() ?? "";
  const res = await fetch(url);
  if (!res.ok) throw new Error(`fetch ${filename} failed: ${res.status}`);

  // Plain text files
  if (ext === "txt" || ext === "csv") {
    return await res.text();
  }

  const buf = Buffer.from(await res.arrayBuffer());

  // PDF - use pdf-parse
  if (ext === "pdf") {
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const pdfParse = require("pdf-parse");
      const parsed = await pdfParse(buf);
      return parsed.text;
    } catch (e) {
      console.error(`PDF 파싱 실패 (${filename}):`, e);
      return "";
    }
  }

  // DOCX - use mammoth
  if (ext === "docx") {
    try {
      const mammoth = await import("mammoth");
      const result = await mammoth.extractRawText({ buffer: buf });
      return result.value;
    } catch (e) {
      console.error(`DOCX 파싱 실패 (${filename}):`, e);
      return "";
    }
  }

  // Excel files
  if (ext === "xlsx" || ext === "xls") {
    try {
      const wb = XLSX.read(buf, { type: "buffer" });
      const sheets: string[] = [];
      for (const name of wb.SheetNames) {
        const sheet = wb.Sheets[name];
        const csv = XLSX.utils.sheet_to_csv(sheet);
        sheets.push(`[시트: ${name}]\n${csv}`);
      }
      return sheets.join("\n\n");
    } catch (e) {
      console.error(`Excel 파싱 실패 (${filename}):`, e);
      return "";
    }
  }

  // Fallback: try as text
  try {
    const text = await res.text();
    // Check if it's actually binary garbage
    const controlChars = (text.slice(0, 1000).match(/[\x00-\x08\x0E-\x1F]/g) ?? []).length;
    if (controlChars > 10) return "";
    return text;
  } catch {
    return "";
  }
}
