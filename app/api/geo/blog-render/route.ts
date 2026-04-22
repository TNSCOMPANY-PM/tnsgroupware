import { NextResponse } from "next/server";
import { getSessionEmployee, unauthorized } from "@/utils/apiAuth";

// DEPRECATED — V2 (/api/geo/generate + /api/geo/syndicate) 로 이관됨.
export async function POST() {
  const session = await getSessionEmployee();
  if (!session) return unauthorized();
  return NextResponse.json(
    { error: "DEPRECATED", message: "V2 (/api/geo/generate + /api/geo/syndicate) 로 이관됨" },
    { status: 410 },
  );
}

export async function GET() {
  const session = await getSessionEmployee();
  if (!session) return unauthorized();
  return NextResponse.json({ error: "DEPRECATED" }, { status: 410 });
}
