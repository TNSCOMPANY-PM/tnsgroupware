import { NextRequest, NextResponse } from "next/server";
import { ingestBankTransaction } from "@/lib/transactions";

export type WebhookPayload = {
  date: string;
  amount: number;
  senderName: string;
  type: "DEPOSIT" | "WITHDRAWAL";
  bankName: string;
};

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { date, amount, senderName, type, bankName } = body as Partial<WebhookPayload>;

    if (!date || typeof amount !== "number" || !senderName || !type || !bankName) {
      return NextResponse.json(
        { error: "필수 필드 누락: date, amount, senderName, type, bankName" },
        { status: 400 }
      );
    }

    if (type !== "DEPOSIT" && type !== "WITHDRAWAL") {
      return NextResponse.json(
        { error: "type은 DEPOSIT 또는 WITHDRAWAL이어야 합니다." },
        { status: 400 }
      );
    }

    const result = ingestBankTransaction({
      date: String(date),
      amount: Number(amount),
      senderName: String(senderName),
      type,
      bankName: String(bankName),
    });

    return NextResponse.json({
      success: true,
      status: result.status,
      transactionId: result.transaction.id,
      matchedInvoiceId: result.matchedInvoice?.id,
    });
  } catch (e) {
    console.error("webhook error", e);
    return NextResponse.json(
      { error: "처리 중 오류가 발생했습니다." },
      { status: 500 }
    );
  }
}
