/**
 * v3-03 Phase B — Write + Polish + Validate → DB UPDATE (stage='write_done').
 * 입력: URL param draft_id
 * 출력: { draftId, title, content, frontmatter, polishLog, lintWarnings }
 */

import { NextResponse } from "next/server";
import { getSessionEmployee, unauthorized } from "@/utils/apiAuth";
import {
  runPhaseB,
  HallucinationDetectedError,
  LintErrorV3,
  DraftNotFoundError,
  InvalidStageError,
} from "@/lib/geo/v3/pipeline";

export const runtime = "nodejs";
// Phase B (sonnet write + haiku polish) ~40s 안 안전.
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
    const out = await runPhaseB(draftId);
    return NextResponse.json(out);
  } catch (e) {
    if (e instanceof DraftNotFoundError) {
      return NextResponse.json(
        { error: e.code, message: e.message },
        { status: 404 },
      );
    }
    if (e instanceof InvalidStageError) {
      return NextResponse.json(
        { error: e.code, message: e.message, currentStage: e.currentStage },
        { status: 409 },
      );
    }
    if (e instanceof HallucinationDetectedError) {
      return NextResponse.json(
        { error: e.code, message: e.message, unmatched: e.unmatched },
        { status: 400 },
      );
    }
    if (e instanceof LintErrorV3) {
      return NextResponse.json(
        { error: e.code, message: e.message, lintErrors: e.lintErrors },
        { status: 400 },
      );
    }
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[v3.B] failed:", msg);
    return NextResponse.json({ error: "WRITE_FAILED", message: msg }, { status: 500 });
  }
}
