import { NextResponse } from "next/server";
import { createAdminClient } from "@/utils/supabase/admin";
import { parseShinhanDepositSms } from "@/lib/shinhanDepositParser";
import { matchClient, type ClientForMatch } from "@/lib/clientMatcher";

/**
 * 신한은행 입금 SMS 웹훅.
 * POST body: { sms_text: string }
 * Header: Authorization: Bearer {WEBHOOK_SECRET}
 */
export async function POST(request: Request) {
  try {
    const webhookSecret = process.env.WEBHOOK_SECRET?.trim();
    if (webhookSecret) {
      const auth = request.headers.get("authorization") ?? "";
      const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
      if (token !== webhookSecret) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      }
    }

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

    const supabase = createAdminClient();

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
      // 중복 키 오류는 이미 등록된 건 — 200으로 정상 처리
      if (error.code === "23505") {
        return NextResponse.json({ ok: true, duplicate: true, date: parsed.date, amount: parsed.amount, client_name: mappedClientName });
      }
      return NextResponse.json(
        { ok: false, error: error.message },
        { status: 500 }
      );
    }

    const financeId = data?.id;

    // 청구발행 결재 자동 승인: 입금자명 + 금액이 pending invoice와 매칭되면 자동 승인
    try {
      const { data: invoiceApprovals } = await supabase
        .from("approvals")
        .select("id, title, amount, account_holder_name, requester_id, requester_name")
        .eq("type", "invoice")
        .eq("status", "pending");

      if (invoiceApprovals && invoiceApprovals.length > 0 && parsed.amount > 0) {
        const depositorName = (mappedClientName ?? parsed.client_name ?? "").toLowerCase();
        const matched = invoiceApprovals.find((inv: Record<string, unknown>) => {
          const invAmount = Number(inv.amount);
          if (invAmount !== parsed.amount) return false;
          const invDepositor = String(inv.account_holder_name ?? "").toLowerCase();
          return invDepositor && (depositorName.includes(invDepositor) || invDepositor.includes(depositorName));
        });
        if (matched) {
          // 결재 자동 승인
          await supabase.from("approvals").update({
            status: "approved",
            approver_name: "시스템(자동)",
            reviewed_at: new Date().toISOString(),
          }).eq("id", (matched as Record<string, unknown>).id);
          // finance 행 상태를 completed/매출로 업데이트
          if (financeId) {
            await supabase.from("finance").update({
              status: "completed",
              category: mappedCategory ?? null,
              client_name: mappedClientName,
              approval_id: String((matched as Record<string, unknown>).id),
            }).eq("id", financeId);
          }
        }
      }
    } catch {
      // 자동 승인 실패해도 입금 등록은 유지
    }

    return NextResponse.json({
      ok: true,
      id: financeId,
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
