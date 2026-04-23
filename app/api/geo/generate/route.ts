import { NextResponse } from "next/server";
import { getSessionEmployee, unauthorized } from "@/utils/apiAuth";
import { GeoInputSchema } from "@/lib/geo/schema";
import { generate } from "@/lib/geo";
import { NotImplementedError } from "@/lib/geo/types";

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

  const depth = parsed.data.depth;
  const tiers = parsed.data.tiers ?? ["A", "B"];

  if (depth !== "D3" && tiers.includes("C")) {
    return NextResponse.json(
      { error: "C_TIER_D3_ONLY", message: "C급은 D3 전용" },
      { status: 400 },
    );
  }

  if (depth === "D3" && !parsed.data.brandId) {
    return NextResponse.json(
      { error: "D3_REQUIRES_BRAND_ID", message: "D3는 brandId 필수" },
      { status: 400 },
    );
  }

  try {
    const out = await generate(parsed.data);
    return NextResponse.json(out);
  } catch (e) {
    if (e instanceof NotImplementedError) {
      return NextResponse.json({ error: "NOT_IMPLEMENTED", message: e.message }, { status: 501 });
    }
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: "GENERATE_FAILED", message: msg }, { status: 500 });
  }
}
