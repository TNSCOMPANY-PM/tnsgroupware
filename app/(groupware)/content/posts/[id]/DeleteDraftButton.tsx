"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export default function DeleteDraftButton({ id }: { id: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function handleDelete() {
    if (!confirm("이 초안을 삭제할까요? 복구 불가.")) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/geo/blog-drafts?id=${encodeURIComponent(id)}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const msg = await res.text().catch(() => "");
        alert(`삭제 실패: ${msg || res.status}`);
        setBusy(false);
        return;
      }
      router.push("/content/posts");
      router.refresh();
    } catch (e) {
      alert(`삭제 실패: ${e instanceof Error ? e.message : String(e)}`);
      setBusy(false);
    }
  }

  return (
    <button
      type="button"
      onClick={handleDelete}
      disabled={busy}
      className="text-xs px-3 py-1.5 rounded-md border border-rose-200 bg-white text-rose-600 hover:bg-rose-50 disabled:opacity-50"
    >
      {busy ? "삭제 중…" : "삭제"}
    </button>
  );
}
