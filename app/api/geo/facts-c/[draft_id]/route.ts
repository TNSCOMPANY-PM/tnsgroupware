/**
 * v4-07 — /api/geo/facts-c/[draft_id] (LLM2, haiku).
 * 입력: URL param draft_id
 * 출력: { draftId, c_facts }
 * stage: facts_a_done → facts_c_done.
 */

import { NextResponse } from "next/server";
import { getSessionEmployee, unauthorized } from "@/utils/apiAuth";
import {
  runStep2FactsC,
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
    const out = await runStep2FactsC(draftId);
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
    console.error("[v4-07.2] failed:", msg);
    return NextResponse.json({ error: "FACTS_C_FAILED", message: msg }, { status: 500 });
  }
}
