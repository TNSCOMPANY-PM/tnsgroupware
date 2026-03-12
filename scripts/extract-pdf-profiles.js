const fs = require("fs");
const path = require("path");

const pdfjsLib = require("pdfjs-dist/legacy/build/pdf.js");

const PDF_DIR = "c:\\Users\\user1\\Downloads";
const PASSWORD = "woals_0504";
const FILES = [
  "구성원프로필_김동균_2026-03-12.pdf",
  "구성원프로필_심규성_2026-03-12.pdf",
  "구성원프로필_박재민_2026-03-12.pdf",
  "구성원프로필_김정섭_2026-03-12.pdf",
  "구성원프로필_김용준_2026-03-12.pdf",
];

async function extractText(pdfPath, password) {
  const data = new Uint8Array(fs.readFileSync(pdfPath));
  const loadingTask = pdfjsLib.getDocument({
    data,
    password: password || undefined,
  });
  const pdf = await loadingTask.promise;
  let out = "";
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    const strings = content.items.map((it) => (it.str || "")).join(" ");
    out += strings + "\n";
  }
  return out;
}

async function main() {
  const results = {};
  for (const file of FILES) {
    const pdfPath = path.join(PDF_DIR, file);
    if (!fs.existsSync(pdfPath)) {
      results[file] = { error: "File not found" };
      continue;
    }
    try {
      const text = await extractText(pdfPath, PASSWORD);
      results[file] = { text };
    } catch (e) {
      results[file] = { error: e.message };
    }
  }
  fs.writeFileSync(
    path.join(__dirname, "pdf-extracted.json"),
    JSON.stringify(results, null, 2),
    "utf8"
  );
  console.log("Done. Check scripts/pdf-extracted.json");
}

main();
