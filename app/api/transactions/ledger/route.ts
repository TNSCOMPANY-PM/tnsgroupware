import { NextResponse } from "next/server";
import { getLedger } from "@/lib/transactions";
import { getSessionEmployee, unauthorized } from "@/utils/apiAuth";

export async function GET() {
  const session = await getSessionEmployee();
  if (!session) return unauthorized();

  const ledger = getLedger();
  return NextResponse.json({ ledger });
}
