import { createClient } from "@/utils/supabase/server";
import { NextResponse } from "next/server";
import { logAudit } from "@/lib/auditLog";

/** 결재 승인 시 연결된 finance UNMAPPED 행 → completed 처리 (없으면 신규 INSERT) */
async function approveFinanceFromApproval(
  supabase: Awaited<ReturnType<typeof createClient>>,
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

    // approval_id로 연결된 기존 행 업데이트 시도
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
      // 연결된 행 없으면 신규 INSERT
      await supabase.from("finance").insert({
        month,
        date: today,
        type: "매입",
        amount,
        status: "completed",
        description,
        category: "기타",
        client_name: (approval.account_holder_name as string) ?? null,
        approval_id: String(approval.id),
      } as Record<string, unknown>);
    }
  } catch {
    // finance 처리 실패해도 결재 승인은 유지
  }
}

/** 비품구입 승인 시 assets 테이블에 자동 추가 */
async function createAssetFromPurchase(
  supabase: Awaited<ReturnType<typeof createClient>>,
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

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient();
  const { id } = await params;
  const body = await req.json();

  // 현재 결재 건 조회
  const { data: current, error: fetchErr } = await supabase
    .from("approvals")
    .select("*")
    .eq("id", id)
    .single();
  if (fetchErr || !current) return NextResponse.json({ error: "결재 건을 찾을 수 없습니다." }, { status: 404 });

  const isApproving = body.status === "approved";
  const isRejecting = body.status === "rejected";

  // 결재선 위계: 팀장이 1차 승인, C레벨이 최종 승인
  // approver_role이 "팀장"이면 → first_approved_at 기록, status는 여전히 pending (C레벨 대기)
  // approver_role이 "C레벨"이면 → 최종 승인 처리
  if (isApproving && body.approver_role === "팀장" && !current.first_approved_at) {
    // 1차 승인 (팀장) — C레벨 최종 승인 대기 상태로 전환
    const { data, error } = await supabase
      .from("approvals")
      .update({
        first_approved_at: new Date().toISOString(),
        first_approver_name: body.approver_name,
        status: "pending", // 아직 pending (C레벨 대기)
        approval_stage: "팀장승인완료",
      } as Record<string, unknown>)
      .eq("id", id)
      .select()
      .single();
    if (error) {
      // 컬럼 없으면 그냥 완전 승인으로 처리 (마이그레이션 미적용)
      return legacyApprove(supabase, id, body, current);
    }
    return NextResponse.json(data);
  }

  // 최종 승인 (C레벨) 또는 반려 — 알 수 없는 컬럼(approver_role 등) 제거
  const { approver_role: _role, ...bodyWithoutRole } = body as Record<string, unknown>;
  const updatePayload: Record<string, unknown> = { ...bodyWithoutRole };
  if (isApproving) {
    updatePayload.reviewed_at = new Date().toISOString();
  }

  const { data, error } = await supabase
    .from("approvals")
    .update(updatePayload)
    .eq("id", id)
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // 최종 승인 시 후처리
  if (isApproving && data) {
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
    // 반려 시 연결된 finance 미승인 행 삭제
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

/** 컬럼 없을 때 폴백: 기존 방식 그대로 단순 업데이트 */
async function legacyApprove(
  supabase: Awaited<ReturnType<typeof createClient>>,
  id: string,
  body: Record<string, unknown>,
  current: Record<string, unknown>
) {
  const { data, error } = await supabase
    .from("approvals")
    .update(body)
    .eq("id", id)
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (body.status === "approved" && data) {
    if (current.type === "expense" || current.type === "purchase") {
      approveFinanceFromApproval(supabase, data as Record<string, unknown>).catch(() => {});
    }
    if (current.type === "purchase") createAssetFromPurchase(supabase, data as Record<string, unknown>).catch(() => {});
  }
  return NextResponse.json(data);
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient();
  const { id } = await params;

  // 연결된 finance 미승인 행 먼저 삭제
  await supabase.from("finance").delete().eq("approval_id", id);

  const { error } = await supabase.from("approvals").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
