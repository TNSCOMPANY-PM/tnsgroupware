import { NextResponse } from "next/server";
import { getLedger, getApprovedGrossTotal } from "@/lib/transactions";

export async function GET() {
  const ledger = getLedger();
  const approvedGrossTotal = getApprovedGrossTotal();
  return NextResponse.json({ ledger, approvedGrossTotal });
}
