/**
 * v5-01 — 예약 발행 schedule 액션 (cancel / retry / run_now).
 *
 * PATCH { action: 'cancel' | 'retry' | 'run_now' }
 *  · cancel  — pending 만 → status='canceled'
 *  · retry   — failed 만 → status='pending' + retry_count=0
 *  · run_now — pending/failed → scheduled_at=now() (cron 다음 tick 에서 즉시 pickup)
 *
 * v5-05 — DELETE 영구 삭제 (모든 status). draft 본문은 별도 보존.
 */

import { NextResponse } from "next/server";
import { getSessionEmployee, unauthorized } from "@/utils/apiAuth";
import { createAdminClient } from "@/utils/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type ScheduleAction = "cancel" | "retry" | "run_now";

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getSessionEmployee();
  if (!session) return unauthorized();

  const { id } = await params;
  if (!id || typeof id !== "string") {
    return NextResponse.json({ error: "INVALID_ID" }, { status: 422 });
  }

  const raw = await req.json().catch(() => null);
  const action = (raw as { action?: string } | null)?.action as ScheduleAction | undefined;
  if (action !== "cancel" && action !== "retry" && action !== "run_now") {
    return NextResponse.json(
      { error: "INVALID_INPUT", message: "action 은 cancel | retry | run_now" },
      { status: 422 },
    );
  }

  const sb = createAdminClient();
  const { data: current, error: loadErr } = await sb
    .from("frandoor_blog_schedules")
    .select("id, status")
    .eq("id", id)
    .maybeSingle();
  if (loadErr) {
    return NextResponse.json({ error: "LOAD_FAILED", message: loadErr.message }, { status: 500 });
  }
  if (!current) {
    return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  }

  const currentStatus = (current as { status: string }).status;
  const updatePayload: Record<string, unknown> = { updated_at: new Date().toISOString() };

  if (action === "cancel") {
    if (currentStatus !== "pending") {
      return NextResponse.json(
        { error: "INVALID_STATE", message: `cancel 은 pending 만 (현재: ${currentStatus})` },
        { status: 409 },
      );
    }
    updatePayload.status = "canceled";
  } else if (action === "retry") {
    if (currentStatus !== "failed") {
      return NextResponse.json(
        { error: "INVALID_STATE", message: `retry 는 failed 만 (현재: ${currentStatus})` },
        { status: 409 },
      );
    }
    updatePayload.status = "pending";
    updatePayload.retry_count = 0;
    updatePayload.error_msg = null;
  } else {
    // run_now
    if (currentStatus !== "pending" && currentStatus !== "failed") {
      return NextResponse.json(
        { error: "INVALID_STATE", message: `run_now 는 pending/failed 만 (현재: ${currentStatus})` },
        { status: 409 },
      );
    }
    updatePayload.status = "pending";
    updatePayload.scheduled_at = new Date().toISOString();
    updatePayload.retry_count = 0;
    updatePayload.error_msg = null;
  }

  const { data, error: uErr } = await sb
    .from("frandoor_blog_schedules")
    .update(updatePayload)
    .eq("id", id)
    .select("*")
    .single();
  if (uErr) {
    return NextResponse.json({ error: "UPDATE_FAILED", message: uErr.message }, { status: 500 });
  }
  return NextResponse.json(data);
}

/**
 * v5-05 — schedule row 영구 삭제 (모든 status 허용).
 * draft 본문 (frandoor_blog_drafts) 은 그대로 보존. frandoor.co.kr 발행본 git history 도 무영향.
 */
export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getSessionEmployee();
  if (!session) return unauthorized();

  const { id } = await params;
  if (!id || typeof id !== "string") {
    return NextResponse.json({ error: "INVALID_ID" }, { status: 422 });
  }

  const sb = createAdminClient();
  const { error } = await sb
    .from("frandoor_blog_schedules")
    .delete()
    .eq("id", id);
  if (error) {
    return NextResponse.json(
      { error: "DELETE_FAILED", message: error.message },
      { status: 500 },
    );
  }
  return NextResponse.json({ ok: true });
}
