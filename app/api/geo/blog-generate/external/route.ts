import { NextResponse } from "next/server";
import { getSessionEmployee, unauthorized } from "@/utils/apiAuth";

export async function POST(request: Request) {
  const session = await getSessionEmployee();
  if (!session) return unauthorized();
  const body = await request.json().catch(() => ({}));
  return NextResponse.json({ stub: true, content_type: "external", received: body }, { status: 501 });
}
