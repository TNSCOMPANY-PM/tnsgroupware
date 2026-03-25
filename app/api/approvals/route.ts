import { createAdminClient } from "@/utils/supabase/admin";
import { NextResponse } from "next/server";

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
  const title = "전자결재 새 건";
  const body = [
    approval.requester_name && `요청자: ${approval.requester_name}`,
    approval.title && `제목: ${approval.title}`,
    approval.amount != null && `금액: ${Number(approval.amount).toLocaleString()}원`,
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
    if (type !== "expense" && type !== "purchase") return;

    const today = new Date().toISOString().slice(0, 10);
    const month = today.slice(0, 7);
    const description = [
      approval.payment_reason ? `사유: ${approval.payment_reason}` : null,
      approval.sheet_classification ? `분류: ${approval.sheet_classification}` : null,
      `결재: ${approval.title}`,
      `신청자: ${approval.requester_name}`,
    ].filter(Boolean).join(" | ");

    await supabase.from("finance").insert({
      month,
      date: today,
      type: "매입",
      amount,
      status: "UNMAPPED",
      description,
      category: null,
      client_name: (approval.title as string) ?? null,
      approval_id: String(approval.id),
    } as Record<string, unknown>);
  } catch {
    // 실패해도 결재 생성 유지
  }
}

export async function POST(req: Request) {
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
  return NextResponse.json(data);
}
