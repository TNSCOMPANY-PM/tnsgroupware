"use client";

import { useCallback } from "react";

function extractSlug(content: string): string | null {
  const m = content.match(/^slug:\s*"?([^"\n]+)"?/m);
  return m ? m[1].trim() : null;
}

export default function DownloadMdButton({
  content,
  fallbackName,
}: {
  content: string;
  fallbackName?: string;
}) {
  const handleDownload = useCallback(() => {
    if (!content) return;
    const slug = extractSlug(content) ?? fallbackName ?? "draft";
    const blob = new Blob([content], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${slug}.md`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, [content, fallbackName]);

  return (
    <button
      type="button"
      onClick={handleDownload}
      className="inline-flex items-center gap-1 rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
    >
      ⬇ 발행용 .md 다운로드
    </button>
  );
}
