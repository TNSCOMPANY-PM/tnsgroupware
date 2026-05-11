/**
 * v4-16 — /api/geo/a-only/structure/[draft_id] (코드 결정론 구조화 단계).
 * 입력: URL param draft_id
 * 출력: { draftId }
 * stage: a_only_analyzed → a_only_structured.
 */

import { NextResponse } from "next/server";
import { getSessionOrSchedulerToken, unauthorized } from "@/utils/apiAuth";
import {
  runStep2StructureAOnly,
  DraftNotFoundError,
  InvalidStageError,
} from "@/lib/geo/v4/pipeline";

export const runtime = "nodejs";
export const maxDuration = 60;
export const dynamic = "force-dynamic";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ draft_id: string }> },
) {
  const auth = await getSessionOrSchedulerToken(req);
  if (!auth.ok) return unauthorized();

  const { draft_id: draftId } = await params;
  if (!draftId || typeof draftId !== "string") {
    return NextResponse.json({ error: "INVALID_DRAFT_ID" }, { status: 422 });
  }

  try {
    const out = await runStep2StructureAOnly(draftId);
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
    console.error("[v4-16.2] failed:", msg);
    return NextResponse.json({ error: "A_ONLY_STRUCTURE_FAILED", message: msg }, { status: 500 });
  }
}
