import { createAdminClient } from "@/utils/supabase/admin";
import { NextResponse } from "next/server";
import { logAudit } from "@/lib/auditLog";

type AdminClient = ReturnType<typeof createAdminClient>;

/** 결재 승인 시 연결된 finance UNMAPPED 행 → completed 처리 (없으면 신규 INSERT) */
async function approveFinanceFromApproval(
  supabase: AdminClient,
  approval: Record<string, unknown>
) {
  try {
    const amount = Number(approval.amount) || 0;
    if (amount <= 0) return;
    const today = new Date().toISOString().slice(0, 10);
    const month = today.slice(0, 7);
    const description = [
      approval.payment_reason ? `사유: ${approval.payment_reason}` : null,
      approval.sheet_classification ? `분류: ${approval.sheet_classification}` : null,
      `결재: ${approval.title}`,
      `신청자: ${approval.requester_name}`,
    ].filter(Boolean).join(" | ");

    const { data: existing } = await supabase
      .from("finance")
      .select("id")
      .eq("approval_id", String(approval.id))
      .limit(1)
      .maybeSingle();

    if (existing?.id) {
      await supabase
        .from("finance")
        .update({ status: "completed", category: "기타", description })
        .eq("id", existing.id);
    } else {
      await supabase.from("finance").insert({
        month,
        date: today,
        type: "매입",
        amount,
        status: "completed",
        description,
        category: "기타",
        client_name: (approval.title as string) ?? null,
        approval_id: String(approval.id),
      } as Record<string, unknown>);
    }
  } catch {
    // finance 처리 실패해도 결재 승인은 유지
  }
}

/** 비품구입 승인 시 assets 테이블에 자동 추가 */
async function createAssetFromPurchase(
  supabase: AdminClient,
  approval: Record<string, unknown>
) {
  try {
    const amount = Number(approval.amount) || 0;
    const today = new Date().toISOString().slice(0, 10);
    await supabase.from("assets").insert({
      name: approval.item_name ?? approval.title ?? "비품",
      category: "비품",
      purchase_date: today,
      amount,
      purpose: approval.purpose ?? null,
      purchase_url: approval.purchase_url ?? null,
      note: `결재번호: ${approval.id}`,
    } as Record<string, unknown>);
  } catch {
    // assets 자동 추가 실패해도 결재 승인은 유지
  }
}

/** 결재 결과 알림 (Pushbullet) */
async function notifyApprovalResult(approval: Record<string, unknown>, status: "approved" | "rejected") {
  const apiKey = process.env.PUSHBULLET_API_KEY?.trim();
  if (!apiKey) return;
  const isApproved = status === "approved";
  const title = isApproved ? "✅ 결재 승인 완료" : "❌ 결재 반려";
  const body = [
    `제목: ${approval.title}`,
    `신청자: ${approval.requester_name}`,
    approval.amount != null ? `금액: ${Number(approval.amount).toLocaleString()}원` : null,
    !isApproved && approval.reject_reason ? `반려 사유: ${approval.reject_reason}` : null,
  ].filter(Boolean).join("\n");
  try {
    await fetch("https://api.pushbullet.com/v2/pushes", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Access-Token": apiKey },
      body: JSON.stringify({ type: "note", title, body }),
    });
  } catch {
    // 알림 실패해도 결재 처리 유지
  }
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const supabase = createAdminClient();
  const { id } = await params;
  const body = await req.json();

  const { data: current, error: fetchErr } = await supabase
    .from("approvals")
    .select("*")
    .eq("id", id)
    .single();
  if (fetchErr || !current) return NextResponse.json({ error: "결재 건을 찾을 수 없습니다." }, { status: 404 });

  const isApproving = body.status === "approved";
  const isRejecting = body.status === "rejected";

  if (isApproving && body.approver_role === "팀장" && !current.first_approved_at) {
    const { data, error } = await supabase
      .from("approvals")
      .update({
        first_approved_at: new Date().toISOString(),
        first_approver_name: body.approver_name,
        status: "pending",
        approval_stage: "팀장승인완료",
      } as Record<string, unknown>)
      .eq("id", id)
      .select()
      .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json(data);
  }

  const { approver_role: _role, ...bodyWithoutRole } = body as Record<string, unknown>;
  const updatePayload: Record<string, unknown> = { ...bodyWithoutRole };
  if (isApproving) updatePayload.reviewed_at = new Date().toISOString();

  const { data, error } = await supabase
    .from("approvals")
    .update(updatePayload)
    .eq("id", id)
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  if (isApproving && data) {
    notifyApprovalResult(data as Record<string, unknown>, "approved").catch(() => {});
    if (data.type === "expense" || data.type === "purchase") {
      approveFinanceFromApproval(supabase, data as Record<string, unknown>).catch(() => {});
    }
    if (data.type === "purchase") {
      createAssetFromPurchase(supabase, data as Record<string, unknown>).catch(() => {});
    }
    logAudit("approval.approved", {
      actorName: body.approver_name as string ?? undefined,
      targetId: id,
      targetType: "approval",
      detail: { title: data.title, type: data.type, amount: data.amount },
    }).catch(() => {});
  }

  if (isRejecting && data) {
    notifyApprovalResult(data as Record<string, unknown>, "rejected").catch(() => {});
    void supabase.from("finance").delete().eq("approval_id", id);
    logAudit("approval.rejected", {
      actorName: body.approver_name as string ?? undefined,
      targetId: id,
      targetType: "approval",
      detail: { title: data.title },
    }).catch(() => {});
  }

  return NextResponse.json(data);
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const supabase = createAdminClient();
  const { id } = await params;

  await supabase.from("finance").delete().eq("approval_id", id);

  const { error } = await supabase.from("approvals").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
