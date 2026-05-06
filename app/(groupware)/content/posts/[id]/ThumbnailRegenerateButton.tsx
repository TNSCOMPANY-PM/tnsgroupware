"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

/**
 * v4-24 — A only post 의 썸네일 재생성 (~15s, gpt-image-1).
 * 같은 Storage path 에 upsert + cache-busting query 부착.
 */
export default function ThumbnailRegenerateButton({
  draftId,
  hasExisting,
}: {
  draftId: string;
  hasExisting: boolean;
}) {
  const [busy, setBusy] = useState(false);
  const router = useRouter();

  const onClick = async () => {
    const msg = hasExisting
      ? "기존 이미지를 새 이미지로 교체합니다 (~15s 소요, $0.04). 진행할까요?"
      : "썸네일 이미지를 새로 생성합니다 (~15s 소요, $0.04). 진행할까요?";
    if (!confirm(msg)) return;

    setBusy(true);
    try {
      const res = await fetch(`/api/geo/a-only/thumbnail/${draftId}`, {
        method: "POST",
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message ?? err.error ?? `재생성 실패 (${res.status})`);
      }
      router.refresh();
    } catch (e) {
      alert(`이미지 재생성 실패: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={busy}
      className="text-xs px-3 py-1 rounded border border-violet-300 text-violet-700 hover:bg-violet-50 disabled:opacity-50"
    >
      {busy
        ? "생성 중... (~15s)"
        : hasExisting
          ? "🔄 이미지 재생성"
          : "🖼️ 이미지 생성"}
    </button>
  );
}
