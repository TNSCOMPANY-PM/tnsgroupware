/**
 * v4-07 — /api/geo/write-part1/[draft_id]
 * Phase A 완료된 draft 에 대해 Sonnet 으로 frontmatter + 블럭 A+B+C 작성.
 * stage: plan_done → part1_done.
 */

import { NextResponse } from "next/server";
import { getSessionEmployee, unauthorized } from "@/utils/apiAuth";
import {
  runPhaseBPart1,
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
    const out = await runPhaseBPart1(draftId);
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
        { error: e.code, message: e.message, expected: e.expected, actual: e.actual },
        { status: 409 },
      );
    }
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[v4-07.B1] failed:", msg);
    return NextResponse.json({ error: "PART1_FAILED", message: msg }, { status: 500 });
  }
}
