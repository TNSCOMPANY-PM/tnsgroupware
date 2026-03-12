import { NextResponse } from "next/server";
import { getUnmappedTransactions } from "@/lib/transactions";

export async function GET() {
  const list = getUnmappedTransactions();
  return NextResponse.json({ transactions: list });
}
