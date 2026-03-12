# -*- coding: utf-8 -*-
import json
import os
from pathlib import Path

from pypdf import PdfReader

PDF_DIR = Path(r"c:\Users\user1\Downloads")
PASSWORD = "woals_0504"
FILES = [
    "구성원프로필_김동균_2026-03-12.pdf",
    "구성원프로필_심규성_2026-03-12.pdf",
    "구성원프로필_박재민_2026-03-12.pdf",
    "구성원프로필_김정섭_2026-03-12.pdf",
    "구성원프로필_김용준_2026-03-12 (1).pdf",
]

def extract_text(pdf_path: Path, password: str) -> str:
    reader = PdfReader(str(pdf_path), password=password)
    parts = []
    for page in reader.pages:
        parts.append(page.extract_text() or "")
    return "\n".join(parts)

def main():
    results = {}
    for f in FILES:
        pdf_path = PDF_DIR / f
        if not pdf_path.exists():
            results[f] = {"error": "File not found"}
            continue
        try:
            text = extract_text(pdf_path, PASSWORD)
            results[f] = {"text": text}
        except Exception as e:
            results[f] = {"error": str(e)}
    out_path = Path(__file__).parent / "pdf-extracted.json"
    with open(out_path, "w", encoding="utf-8") as out:
        json.dump(results, out, ensure_ascii=False, indent=2)
    print("Done:", out_path)

if __name__ == "__main__":
    main()
