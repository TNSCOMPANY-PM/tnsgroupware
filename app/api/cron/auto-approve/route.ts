import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";
import { countBusinessDays } from "@/utils/leaveCalculator";

/** Vercel Cron: 매일 자정 실행. 3영업일 경과 또는 휴가 당일 도달 시 pending → approved, auto_approved = true */
export const dynamic = "force-dynamic";
export const maxDuration = 60;

function toDateOnly(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let supabase;
  try {
    supabase = await createClient();
  } catch {
    return NextResponse.json(
      { ok: false, error: "Supabase not configured", updated: 0 },
      { status: 200 }
    );
  }

  const now = new Date();
  const todayStr = toDateOnly(now);

  const { data: pendingLeaves, error: fetchError } = await supabase
    .from("leaves")
    .select("id, created_at, start_date")
    .eq("status", "pending");

  if (fetchError) {
    console.error("[auto-approve] fetch", fetchError);
    return NextResponse.json(
      { ok: false, error: fetchError.message, updated: 0 },
      { status: 200 }
    );
  }

  if (!pendingLeaves?.length) {
    return NextResponse.json({ ok: true, updated: 0, message: "No pending leaves" });
  }

  const toApprove: string[] = [];
  for (const row of pendingLeaves) {
    const createdAt = row.created_at ? new Date(row.created_at) : null;
    const startDate = row.start_date ?? null;

    const threeBusinessDaysReached =
      createdAt != null &&
      countBusinessDays(createdAt, now) >= 3;

    const leaveDateReached =
      startDate != null && String(startDate).slice(0, 10) <= todayStr;

    if (threeBusinessDaysReached || leaveDateReached) {
      toApprove.push(row.id);
    }
  }

  if (toApprove.length === 0) {
    return NextResponse.json({ ok: true, updated: 0, ids: [] });
  }

  const { error: updateError } = await supabase
    .from("leaves")
    .update({
      status: "approved",
      auto_approved: true,
      approved_by: null,
    })
    .in("id", toApprove);

  if (updateError) {
    console.error("[auto-approve] update", updateError);
    return NextResponse.json(
      { ok: false, error: updateError.message, updated: 0 },
      { status: 200 }
    );
  }

  return NextResponse.json({
    ok: true,
    updated: toApprove.length,
    ids: toApprove,
  });
}
