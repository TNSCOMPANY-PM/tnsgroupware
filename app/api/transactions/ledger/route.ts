import { NextResponse } from "next/server";
import { getLedger } from "@/lib/transactions";

export async function GET() {
  const ledger = getLedger();
  return NextResponse.json({ ledger });
}
