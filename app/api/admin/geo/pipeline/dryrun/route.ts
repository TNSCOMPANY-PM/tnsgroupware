import { NextResponse } from "next/server";
import { getSessionEmployee, unauthorized, forbidden } from "@/utils/apiAuth";
import { runWithGates } from "@/lib/generators/pipeline";

export const runtime = "nodejs";
export const maxDuration = 120;

export async function POST(req: Request) {
  const session = await getSessionEmployee();
  if (!session) return unauthorized();
  if (session.role !== "C레벨") return forbidden();

  const body = (await req.json()) as { brand?: string; category?: string };
  if (!body.brand || !body.category) {
    return NextResponse.json({ error: "brand, category 필수" }, { status: 400 });
  }
  try {
    const res = await runWithGates("A", { brand: body.brand, category: body.category });
    return NextResponse.json(res);
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "실패" }, { status: 500 });
  }
}
