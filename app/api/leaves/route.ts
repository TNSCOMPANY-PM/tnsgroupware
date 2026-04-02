import { createAdminClient } from "@/utils/supabase/admin";
import { NextResponse } from "next/server";

async function notifyPushbullet(title: string, body: string) {
  const apiKey = process.env.PUSHBULLET_API_KEY?.trim();
  if (!apiKey) return;
  try {
    await fetch("https://api.pushbullet.com/v2/pushes", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Access-Token": apiKey },
      body: JSON.stringify({ type: "note", title, body }),
    });
  } catch {
    // 알림 실패해도 API는 정상 처리
  }
}

export async function GET() {
  // 관리자 클라이언트로 RLS 우회 — 팀장/C레벨 모두 전체 목록 조회 필요
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("leave_requests")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function POST(req: Request) {
  const supabase = createAdminClient();
  const body = await req.json();

  const insert = {
    applicant_id: body.applicantId,
    applicant_name: body.applicantName,
    applicant_department: body.applicantDepartment,
    leave_type: body.leaveType,
    start_date: body.startDate,
    end_date: body.endDate,
    days: body.days,
    reason: body.reason ?? "",
    status: body.status,
    requires_proof: body.requiresProof ?? false,
    proof_status: body.requiresProof ? "pending" : null,
  };

  const { data, error } = await supabase
    .from("leave_requests")
    .insert(insert)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Pushbullet 알림
  if (body.status === "팀장_1차_승인_대기") {
    notifyPushbullet(
      "휴가 신청 알림",
      `${body.applicantName}님이 휴가를 신청했습니다.\n유형: ${body.leaveType}\n기간: ${body.startDate} ~ ${body.endDate} (${body.days}일)\n사유: ${body.reason}`
    ).catch(() => {});
  } else if (body.status === "C레벨_최종_승인_대기") {
    notifyPushbullet(
      "휴가 최종 승인 요청",
      `${body.applicantName}님(팀장)의 휴가가 C레벨 최종 승인을 기다립니다.\n기간: ${body.startDate} ~ ${body.endDate} (${body.days}일)`
    ).catch(() => {});
  }

  return NextResponse.json(data);
}
