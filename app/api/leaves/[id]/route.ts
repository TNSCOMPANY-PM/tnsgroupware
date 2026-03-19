import { createClient } from "@/utils/supabase/server";
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
  } catch {}
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient();
  const body = await req.json();
  const { id } = await params;

  const updateData: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };
  if (body.status !== undefined) updateData.status = body.status;
  if (body.teamLeadApprovedAt) updateData.team_lead_approved_at = body.teamLeadApprovedAt;
  if (body.cLevelApprovedAt) updateData.c_level_approved_at = body.cLevelApprovedAt;
  if (body.rejectedAt) updateData.rejected_at = body.rejectedAt;
  if (body.rejectReason) updateData.reject_reason = body.rejectReason;
  if (body.proofStatus !== undefined) updateData.proof_status = body.proofStatus;
  if (body.proofFileName !== undefined) updateData.proof_file_name = body.proofFileName;
  if (body.proofUploadedAt !== undefined) updateData.proof_uploaded_at = body.proofUploadedAt;

  const { data, error } = await supabase
    .from("leave_requests")
    .update(updateData)
    .eq("id", id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // 상태 변경별 Pushbullet 알림
  if (body.status === "C레벨_최종_승인_대기") {
    notifyPushbullet(
      "휴가 최종 승인 요청",
      `${data.applicant_name}님의 휴가가 팀장 승인 완료. C레벨 최종 승인이 필요합니다.\n기간: ${data.start_date} ~ ${data.end_date} (${data.days}일)`
    ).catch(() => {});
  } else if (body.status === "승인_완료") {
    notifyPushbullet(
      "휴가 승인 완료",
      `${data.applicant_name}님의 휴가가 최종 승인되었습니다.\n기간: ${data.start_date} ~ ${data.end_date} (${data.days}일)`
    ).catch(() => {});
  } else if (body.status === "반려") {
    notifyPushbullet(
      "휴가 반려 알림",
      `${data.applicant_name}님의 휴가 신청이 반려되었습니다.\n기간: ${data.start_date} ~ ${data.end_date}`
    ).catch(() => {});
  } else if (body.status === "CANCELED") {
    notifyPushbullet(
      "휴가 취소 승인",
      `${data.applicant_name}님의 휴가 취소가 승인되었습니다.`
    ).catch(() => {});
  }

  return NextResponse.json(data);
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient();
  const { id } = await params;

  const { error } = await supabase
    .from("leave_requests")
    .delete()
    .eq("id", id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
