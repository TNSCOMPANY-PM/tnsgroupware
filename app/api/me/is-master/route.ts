import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getMasterCookieName, verifyMasterToken } from "@/utils/masterAuth";
import { getSessionEmployee, unauthorized } from "@/utils/apiAuth";

export async function GET() {
  const session = await getSessionEmployee();
  if (!session) return unauthorized();

  try {
    const cookieStore = await cookies();
    const token = cookieStore.get(getMasterCookieName())?.value ?? "";
    const master = token ? await verifyMasterToken(token) : false;
    return NextResponse.json({ master });
  } catch {
    return NextResponse.json({ master: false });
  }
}
