import { NextRequest, NextResponse } from "next/server";
import { approveTransaction } from "@/lib/transactions";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await request.json();
  const { classification, clientName } = body as { classification?: string; clientName?: string };

  if (!id || !classification?.trim() || !clientName?.trim()) {
    return NextResponse.json(
      { error: "id, classification, clientName 필요" },
      { status: 400 }
    );
  }

  const result = approveTransaction(id, classification.trim(), clientName.trim());
  if (!result.success) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }
  return NextResponse.json({ success: true });
}
