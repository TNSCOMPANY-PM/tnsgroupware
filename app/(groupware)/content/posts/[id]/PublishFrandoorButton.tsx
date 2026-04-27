"use client";

import { useCallback, useState } from "react";

function extractSlug(content: string): string | null {
  const m = content.match(/^slug:\s*"?([^"\n]+)"?/m);
  return m ? m[1].trim() : null;
}

export default function PublishFrandoorButton({
  postId,
  content,
}: {
  postId: string;
  content: string;
}) {
  const [busy, setBusy] = useState(false);

  const slug = extractSlug(content);

  const handlePublish = useCallback(async () => {
    if (!slug) {
      alert("frontmatter slug 없음 — frandoor 자동 발행 불가");
      return;
    }
    if (!confirm(`${slug}.md 를 frandoor.co.kr/blog/${slug} 에 발행할까요?\n(GitHub API 로 main 브랜치에 직접 commit)`)) {
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/geo/publish-frandoor", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ post_id: postId }),
      });
      const json = await res.json();
      if (!res.ok) {
        alert(`발행 실패: ${json.error ?? res.statusText}\n${json.message ?? ""}`);
        return;
      }
      alert(`발행 완료\n약 2분 후 ${json.pageUrl} 에서 확인 가능\ncommit: ${json.commitUrl}`);
      if (typeof window !== "undefined") window.location.reload();
    } catch (e) {
      alert(`발행 실패: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBusy(false);
    }
  }, [postId, slug]);

  if (!slug) return null;

  return (
    <button
      type="button"
      onClick={handlePublish}
      disabled={busy}
      className="inline-flex items-center gap-1 rounded-md border border-amber-300 bg-amber-50 px-3 py-1.5 text-xs font-medium text-amber-700 hover:bg-amber-100 disabled:opacity-50"
    >
      {busy ? "발행 중…" : "⚡ frandoor.co.kr 자동 발행"}
    </button>
  );
}
