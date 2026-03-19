import { createClient } from "@/utils/supabase/server";
import { NextResponse } from "next/server";

export async function GET() {
  const supabase = await createClient();
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

export async function POST(req: Request) {
  const supabase = await createClient();
  const body = await req.json();

  const baseInsert = {
    type: body?.type,
    title: body?.title,
    content: body?.content ?? null,
    requester_name: body?.requester_name,
    requester_id: body?.requester_id,
    amount: body?.amount ?? null,
    start_date: body?.start_date ?? null,
    end_date: body?.end_date ?? null,
    status: "pending",
  } as Record<string, unknown>;

  // 1) 전체 payload로 1차 INSERT
  const first = await supabase.from("approvals").insert({ ...body, status: "pending" }).select().single();
  if (!first.error) {
    notifyApprovalToTeamLead(first.data).catch(() => {});
    return NextResponse.json(first.data);
  }

  // 2) 컬럼 미존재(마이그레이션 미적용) 등으로 실패하면 base 컬럼만으로 폴백 INSERT
  const msg = first.error.message ?? "";
  const looksLikeMissingColumn =
    msg.includes("does not exist") ||
    msg.includes("column") ||
    msg.includes("42703");
  if (looksLikeMissingColumn) {
    const fallback = await supabase.from("approvals").insert(baseInsert).select().single();
    if (!fallback.error) {
      notifyApprovalToTeamLead(fallback.data).catch(() => {});
      return NextResponse.json({
        ...fallback.data,
        _warning: "DB 컬럼(정산/비품 상세)이 아직 없어 기본 정보만 저장되었습니다. Supabase SQL 마이그레이션을 적용하면 상세 필드도 저장됩니다.",
      });
    }
    return NextResponse.json({ error: fallback.error.message }, { status: 500 });
  }

  return NextResponse.json({ error: first.error.message }, { status: 500 });
}
