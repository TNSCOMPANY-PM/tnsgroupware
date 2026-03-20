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
    const iden: string | undefined = typeof body.iden === "string" ? body.iden : undefined;

    const parsed = parseShinhanDepositSms(sms_text);
    if (!parsed) {
      return NextResponse.json(
        { ok: false, error: "sms_text 파싱 실패 (일시/입금 금액 형식 확인)" },
        { status: 400 }
      );
    }

    const month = parsed.date.slice(0, 7);
    const timeTag = parsed.time ? ` t:${parsed.time}` : "";
    const description = iden
      ? `입금자: ${parsed.client_name || ""}${timeTag} pb:${iden}`
      : parsed.time ? `입금자: ${parsed.client_name || ""}${timeTag}` : null;

    const supabase = await createClient();

    // iden 중복 체크: 이미 같은 iden으로 등록된 행이 있으면 스킵
    if (iden) {
      const { data: existing } = await supabase
        .from("finance")
        .select("id, amount, date, client_name")
        .like("description", `%pb:${iden}%`)
        .maybeSingle();
      if (existing) {
        return NextResponse.json({
          ok: true,
          duplicate: true,
          id: existing.id,
          date: existing.date,
          amount: existing.amount,
          client_name: existing.client_name,
        });
      }
    }

    // clients alias 자동 매핑
    let mappedClientName = parsed.client_name || null;
    let mappedCategory: string | null = null;
    if (mappedClientName) {
      const { data: clientMatch } = await supabase
        .from("clients")
        .select("name, category")
        .contains("aliases", [mappedClientName])
        .maybeSingle();
      if (clientMatch) {
        mappedClientName = clientMatch.name;
        mappedCategory = clientMatch.category;
      }
    }

    const { data, error } = await supabase
      .from("finance")
      .insert({
        month,
        type: "매출",
        amount: parsed.amount,
        client_name: mappedClientName,
        status: "pending",
        category: mappedCategory,
        date: parsed.date,
        description,
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
      client_name: mappedClientName,
    });
  } catch (e) {
    const err = e instanceof Error ? e : new Error(String(e));
    return NextResponse.json(
      { ok: false, error: err.message },
      { status: 500 }
    );
  }
}
