import { NextRequest, NextResponse } from "next/server";
import { matchTransactionToInvoice } from "@/lib/transactions";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
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
