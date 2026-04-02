import { createAdminClient } from "@/utils/supabase/admin";
import { NextResponse } from "next/server";
import { getSessionEmployee, unauthorized } from "@/utils/apiAuth";

export async function GET() {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("approvals")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

/** 결재 신청 시 팀장(박재민) 알림용 Pushbullet 푸시 (비동기, 실패해도 결재는 성공) */
async function notifyApprovalToTeamLead(approval: { title?: string; requester_name?: string; type?: string; amount?: number }) {
  const apiKey = process.env.PUSHBULLET_API_KEY?.trim();
  if (!apiKey) return;
  const isInvoice = approval.type === "invoice";
  const title = isInvoice ? "🧾 청구발행 요청" : "전자결재 새 건";
  const body = [
    approval.requester_name && `요청자: ${approval.requester_name}`,
    approval.title && `제목: ${approval.title}`,
    approval.amount != null && `금액: ${Number(approval.amount).toLocaleString()}원`,
    isInvoice ? "→ 발행 후 입금 시 원장 자동 등록" : null,
  ].filter(Boolean).join("\n");
  try {
    await fetch("https://api.pushbullet.com/v2/pushes", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Access-Token": apiKey,
      },
      body: JSON.stringify({ type: "note", title, body }),
    });
  } catch {
    // 알림 실패해도 결재 생성은 유지
  }
}

/** 결재 생성 시 finance 테이블에 미승인 매입 행 자동 생성 */
async function createPendingFinanceFromApproval(
  supabase: ReturnType<typeof createAdminClient>,
  approval: Record<string, unknown>
) {
  try {
    const amount = Number(approval.amount) || 0;
    if (amount <= 0) return;
    const type = String(approval.type ?? "");
    // invoice는 매출(수금)이므로 여기서 생성하지 않음 — 입금 시 자동 생성
    if (type !== "expense" && type !== "purchase") return;

    const today = new Date().toISOString().slice(0, 10);
    const dateToUse = (approval.finance_date as string) || today;
    const month = dateToUse.slice(0, 7);
    const description = [
      approval.payment_reason ? `사유: ${approval.payment_reason}` : null,
      approval.sheet_classification ? `분류: ${approval.sheet_classification}` : null,
      `결재: ${approval.title}`,
      `신청자: ${approval.requester_name}`,
    ].filter(Boolean).join(" | ");

    await supabase.from("finance").insert({
      month,
      date: dateToUse,
      type: "매입",
      amount,
      status: "UNMAPPED",
      description,
      category: (approval.ledger_category as string) || null,
      client_name: (approval.title as string) ?? null,
      approval_id: String(approval.id),
    } as Record<string, unknown>);
  } catch {
    // 실패해도 결재 생성 유지
  }
}

/** 결재 신청 시 approval_alerts 삽입 — 김동균 + 신청자 본인 */
async function insertApprovalAlerts(
  supabase: ReturnType<typeof createAdminClient>,
  approval: Record<string, unknown>
) {
  try {
    const approvalId = String(approval.id ?? "");
    const approvalTitle = String(approval.title ?? "");
    const requesterName = String(approval.requester_name ?? "");
    const requesterId = String(approval.requester_id ?? "");

    // 김동균의 employee id 조회
    const { data: dong } = await supabase
      .from("employees")
      .select("id")
      .eq("name", "김동균")
      .maybeSingle();

    const dongId = dong?.id ? String(dong.id) : null;

    const rows: { target_user_id: string; approval_id: string; approval_title: string; requester_name: string }[] = [];

    if (dongId) {
      rows.push({ target_user_id: dongId, approval_id: approvalId, approval_title: approvalTitle, requester_name: requesterName });
    }
    // 청구발행: 박재민에게도 알림
    if (String(approval.type ?? "") === "invoice") {
      const { data: jaeminRow } = await supabase.from("employees").select("id").eq("name", "박재민").maybeSingle();
      const jaeminId = jaeminRow?.id ? String(jaeminRow.id) : null;
      if (jaeminId && jaeminId !== dongId && jaeminId !== requesterId) {
        rows.push({ target_user_id: jaeminId, approval_id: approvalId, approval_title: approvalTitle, requester_name: requesterName });
      }
    }
    // 신청자가 김동균 본인이 아닌 경우에만 추가
    if (requesterId && requesterId !== dongId) {
      rows.push({ target_user_id: requesterId, approval_id: approvalId, approval_title: approvalTitle, requester_name: requesterName });
    }

    if (rows.length > 0) {
      await supabase.from("approval_alerts").insert(rows);
    }
  } catch {
    // 알림 실패해도 결재 생성 유지
  }
}

export async function POST(req: Request) {
  const session = await getSessionEmployee();
  if (!session) return unauthorized();

  const supabase = createAdminClient();
  const body = await req.json();

  const { data, error } = await supabase
    .from("approvals")
    .insert({ ...body, status: "pending" })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  notifyApprovalToTeamLead(data).catch(() => {});
  createPendingFinanceFromApproval(supabase, data as Record<string, unknown>).catch(() => {});
  insertApprovalAlerts(supabase, data as Record<string, unknown>).catch(() => {});
  return NextResponse.json(data);
}
