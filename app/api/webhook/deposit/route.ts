import { NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";
import { parseShinhanDepositSms } from "@/lib/shinhanDepositParser";
import { matchClient, type ClientForMatch } from "@/lib/clientMatcher";

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

    // 시간+이름 기반 중복 체크: iden 있으면 기존 항목에 iden 업데이트, 없으면 차단
    if (parsed.time) {
      const rawName = parsed.client_name || "";
      let sameTimeQuery = supabase
        .from("finance")
        .select("id, description, amount, date")
        .eq("amount", parsed.amount)
        .eq("date", parsed.date)
        .eq("type", "매출")
        .like("description", `%t:${parsed.time}%`);
      if (rawName) sameTimeQuery = sameTimeQuery.ilike("description", `%${rawName}%`);
      const { data: sameTime } = await sameTimeQuery.maybeSingle();
      if (sameTime) {
        if (iden) {
          const existDesc = String((sameTime as Record<string, unknown>).description ?? "");
          if (!existDesc.includes(`pb:${iden}`)) {
            await supabase.from("finance")
              .update({ description: `${existDesc} pb:${iden}`.trim() })
              .eq("id", (sameTime as Record<string, unknown>).id as string);
          }
        }
        return NextResponse.json({ ok: true, duplicate: true, id: (sameTime as Record<string, unknown>).id, date: (sameTime as Record<string, unknown>).date, amount: (sameTime as Record<string, unknown>).amount });
      }
    }

    // clients 매핑: 정확 alias → 퍼지 매칭 순서로 시도
    let mappedClientName = parsed.client_name || null;
    let mappedCategory: string | null = null;
    if (mappedClientName) {
      // 1차: 정확 alias 매칭
      const { data: exactMatch } = await supabase
        .from("clients")
        .select("name, category")
        .contains("aliases", [mappedClientName])
        .maybeSingle();
      if (exactMatch) {
        mappedClientName = exactMatch.name;
        mappedCategory = exactMatch.category;
      } else {
        // 2차: 퍼지 매칭 (정규화 후 부분 문자열 포함)
        const { data: allClients } = await supabase
          .from("clients")
          .select("id, name, category, aliases");
        const fuzzy = matchClient(mappedClientName, (allClients ?? []) as ClientForMatch[]);
        if (fuzzy) {
          mappedClientName = fuzzy.client.name;
          mappedCategory = fuzzy.client.category;
        }
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
        deposit_time: parsed.time ?? null,
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
