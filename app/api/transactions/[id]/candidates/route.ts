import { NextRequest, NextResponse } from "next/server";
import { getInvoiceCandidates } from "@/lib/transactions";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const { searchParams } = new URL(request.url);
  const amount = Number(searchParams.get("amount"));
  const date = searchParams.get("date") || "";
  const senderName = searchParams.get("senderName") || undefined;

  if (!id || isNaN(amount)) {
    return NextResponse.json(
      { error: "id, amount 쿼리 필요" },
      { status: 400 }
    );
  }

  const candidates = getInvoiceCandidates(amount, date, senderName);
  return NextResponse.json({ candidates });
}
