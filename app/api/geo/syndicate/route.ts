import { NextResponse } from "next/server";
import { getSessionEmployee, unauthorized } from "@/utils/apiAuth";
import { SyndicateInputSchema, syndicate } from "@/lib/geo/syndicate";

export const runtime = "nodejs";
export const maxDuration = 120;

export async function POST(req: Request) {
  const session = await getSessionEmployee();
  if (!session) return unauthorized();

  const raw = await req.json().catch(() => null);
  const parsed = SyndicateInputSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "INVALID_INPUT", detail: parsed.error.issues },
      { status: 422 },
    );
  }

  try {
    const out = await syndicate(parsed.data);
    return NextResponse.json(out);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: "SYNDICATE_FAILED", message: msg }, { status: 500 });
  }
}
