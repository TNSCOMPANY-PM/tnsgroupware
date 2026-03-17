import { NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";
import { parseShinhanDepositSms } from "@/lib/shinhanDepositParser";

/**
 * 신한은행 입금 SMS 웹훅.
 * POST body: { sms_text: string }
 */
export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const sms_text = typeof body.sms_text === "string" ? body.sms_text : body.smsText ?? "";

    const parsed = parseShinhanDepositSms(sms_text);
    if (!parsed) {
      return NextResponse.json(
        { ok: false, error: "sms_text 파싱 실패 (일시/입금 금액 형식 확인)" },
        { status: 400 }
      );
    }

    const month = parsed.date.slice(0, 7);

    const supabase = await createClient();
    const { data, error } = await supabase
      .from("finance")
      .insert({
        month,
        type: "매출",
        amount: parsed.amount,
        client_name: parsed.client_name || null,
        status: "pending",
        category: null,
        date: parsed.date,
      } as Record<string, unknown>)
      .select("id")
      .single();

    if (error) {
      return NextResponse.json(
        { ok: false, error: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      ok: true,
      id: data?.id,
      date: parsed.date,
      amount: parsed.amount,
      client_name: parsed.client_name,
    });
  } catch (e) {
    const err = e instanceof Error ? e : new Error(String(e));
    return NextResponse.json(
      { ok: false, error: err.message },
      { status: 500 }
    );
  }
}
