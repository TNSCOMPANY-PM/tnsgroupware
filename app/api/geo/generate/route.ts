import { NextResponse } from "next/server";
import { getSessionEmployee, unauthorized } from "@/utils/apiAuth";
import { GeoInputSchema } from "@/lib/geo/schema";
import { generate } from "@/lib/geo";
import { NotImplementedError } from "@/lib/geo/types";
import { toErrorResponse } from "@/utils/apiError";

export const runtime = "nodejs";
export const maxDuration = 120;

export async function POST(req: Request) {
  const session = await getSessionEmployee();
  if (!session) return unauthorized();

  const raw = await req.json().catch(() => null);
  const parsed = GeoInputSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "INVALID_INPUT", detail: parsed.error.issues },
      { status: 422 },
    );
  }

  try {
    const out = await generate(parsed.data);
    return NextResponse.json(out);
  } catch (e) {
    if (e instanceof NotImplementedError) {
      return NextResponse.json({ error: "NOT_IMPLEMENTED", message: e.message }, { status: 501 });
    }
    const { body, status } = toErrorResponse(e, "GENERATE_FAILED");
    return NextResponse.json(body, { status });
  }
}
