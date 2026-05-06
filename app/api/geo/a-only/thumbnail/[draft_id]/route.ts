/**
 * v4-22 — /api/geo/a-only/thumbnail/[draft_id]
 * gpt-image-1 호출 + Supabase Storage 업로드 + frontmatter image: 갱신.
 * 입력: URL param draft_id
 * 출력: { draftId, thumbnail_url }
 * stage: a_only_written → a_only_thumbnail_done.
 */

import { NextResponse } from "next/server";
import { getSessionEmployee, unauthorized } from "@/utils/apiAuth";
import {
  runStep4ThumbnailAOnly,
  DraftNotFoundError,
  InvalidStageError,
} from "@/lib/geo/v4/pipeline";

export const runtime = "nodejs";
export const maxDuration = 60;
export const dynamic = "force-dynamic";

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ draft_id: string }> },
) {
  const session = await getSessionEmployee();
  if (!session) return unauthorized();

  const { draft_id: draftId } = await params;
  if (!draftId || typeof draftId !== "string") {
    return NextResponse.json({ error: "INVALID_DRAFT_ID" }, { status: 422 });
  }

  try {
    const out = await runStep4ThumbnailAOnly(draftId);
    return NextResponse.json(out);
  } catch (e) {
    if (e instanceof DraftNotFoundError) {
      return NextResponse.json({ error: e.code, message: e.message }, { status: 404 });
    }
    if (e instanceof InvalidStageError) {
      return NextResponse.json(
        { error: e.code, message: e.message, expected: e.expected, actual: e.actual },
        { status: 409 },
      );
    }
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[v4-22.4] failed:", msg);
    return NextResponse.json({ error: "THUMBNAIL_FAILED", message: msg }, { status: 500 });
  }
}
