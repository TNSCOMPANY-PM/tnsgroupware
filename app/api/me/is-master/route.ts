import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getMasterCookieName, verifyMasterToken } from "@/utils/masterAuth";

export async function GET() {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get(getMasterCookieName())?.value ?? "";
    const master = token ? await verifyMasterToken(token) : false;
    return NextResponse.json({ master });
  } catch {
    return NextResponse.json({ master: false });
  }
}
