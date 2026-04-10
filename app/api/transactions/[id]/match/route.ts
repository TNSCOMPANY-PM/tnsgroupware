import { NextRequest, NextResponse } from "next/server";
import { matchTransactionToInvoice } from "@/lib/transactions";
import { getSessionEmployee, unauthorized } from "@/utils/apiAuth";

export async function POST(
  request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSessionEmployee();
  if (!session) return unauthorized();

  const { id } = await params;
  const body = await request.json();
  const { invoiceId } = body as { invoiceId?: string };

  if (!id || !invoiceId) {
    return NextResponse.json(
      { error: "transactionId(id), invoiceId 필요" },
      { status: 400 }
    );
  }

  const result = matchTransactionToInvoice(id, invoiceId);
  if (!result.success) {
    return NextResponse.json(
      { error: result.error },
      { status: 400 }
    );
  }

  return NextResponse.json({ success: true });
}
