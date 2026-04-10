import { NextResponse } from "next/server";
import { getUnmappedTransactions } from "@/lib/transactions";
import { getSessionEmployee, unauthorized } from "@/utils/apiAuth";

export async function GET() {
  const session = await getSessionEmployee();
  if (!session) return unauthorized();

  const list = getUnmappedTransactions();
  return NextResponse.json({ transactions: list });
}
