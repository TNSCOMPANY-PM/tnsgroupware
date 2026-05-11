/**
 * v5-01 — 예약 발행 schedule CRUD.
 *
 * POST { industry, topic?, scheduled_at } — 신규 예약 등록 (status='pending')
 * GET ?status=...&limit=... — 목록 조회 (default 최근 50건)
 */

import { NextResponse } from "next/server";
import { getSessionEmployee, unauthorized } from "@/utils/apiAuth";
import { createAdminClient } from "@/utils/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// v5-03: 새 status (generating / ready / publishing) 포함 + v5-01 running 호환 유지.
const ALLOWED_STATUSES = [
  "pending",
  "generating",
  "ready",
  "publishing",
  "running",
  "published",
  "failed",
  "canceled",
] as const;

export async function POST(req: Request) {
  const session = await getSessionEmployee();
  if (!session) return unauthorized();

  const raw = await req.json().catch(() => null);
  const r = (raw ?? {}) as Record<string, unknown>;
  const industry = typeof r.industry === "string" ? r.industry.trim() : "";
  const topic = typeof r.topic === "string" && r.topic.trim() ? r.topic.trim() : null;
  const scheduledAtInput = typeof r.scheduled_at === "string" ? r.scheduled_at.trim() : "";

  if (!industry) {
    return NextResponse.json({ error: "INVALID_INPUT", message: "industry 필수" }, { status: 422 });
  }
  if (!scheduledAtInput) {
    return NextResponse.json(
      { error: "INVALID_INPUT", message: "scheduled_at 필수" },
      { status: 422 },
    );
  }

  // datetime-local ("2026-05-11T14:00") → KST 절대 시각 으로 해석.
  // already-Z (UTC) 또는 +offset 포함이면 그대로 Date 생성.
  const hasTZ = /[zZ]$|[+-]\d{2}:?\d{2}$/.test(scheduledAtInput);
  const isoCandidate = hasTZ ? scheduledAtInput : `${scheduledAtInput}+09:00`;
  const scheduledAt = new Date(isoCandidate);
  if (isNaN(scheduledAt.getTime())) {
    return NextResponse.json(
      { error: "INVALID_INPUT", message: `scheduled_at parse 실패: ${scheduledAtInput}` },
      { status: 422 },
    );
  }

  const sb = createAdminClient();
  const { data, error } = await sb
    .from("frandoor_blog_schedules")
    .insert({
      industry,
      topic,
      scheduled_at: scheduledAt.toISOString(),
      status: "pending",
      created_by: session.email ?? null,
    })
    .select("*")
    .single();

  if (error || !data) {
    return NextResponse.json(
      { error: "INSERT_FAILED", message: error?.message ?? "INSERT 실패" },
      { status: 500 },
    );
  }

  // v5-03: 즉시 GitHub Actions workflow_dispatch (백그라운드 generation 트리거).
  // 실패해도 등록은 성공 — 매시 cron 이 catch-up.
  await triggerSchedulerWorkflowDispatch();

  return NextResponse.json(data);
}

async function triggerSchedulerWorkflowDispatch(): Promise<void> {
  const pat = process.env.GH_DISPATCH_PAT;
  if (!pat) {
    console.warn(
      "[scheduler] GH_DISPATCH_PAT 미설정 — workflow_dispatch skip (매시 cron 이 catch-up)",
    );
    return;
  }
  try {
    const res = await fetch(
      "https://api.github.com/repos/TNSCOMPANY-PM/tnsgroupware/actions/workflows/scheduler-tick.yml/dispatches",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${pat}`,
          Accept: "application/vnd.github+json",
          "Content-Type": "application/json",
          "X-GitHub-Api-Version": "2022-11-28",
        },
        body: JSON.stringify({ ref: "main" }),
      },
    );
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      console.warn(
        `[scheduler] workflow_dispatch HTTP ${res.status}: ${text.slice(0, 300)}`,
      );
    } else {
      console.log("[scheduler] workflow_dispatch 트리거 OK (백그라운드 generation 시작)");
    }
  } catch (e) {
    console.warn(
      "[scheduler] workflow_dispatch 트리거 실패 — 매시 cron 이 catch-up:",
      e instanceof Error ? e.message : e,
    );
  }
}

export async function GET(req: Request) {
  const session = await getSessionEmployee();
  if (!session) return unauthorized();

  const url = new URL(req.url);
  const statusParam = url.searchParams.get("status");
  const limitParam = Number(url.searchParams.get("limit") ?? "50");
  const limit = Number.isFinite(limitParam) ? Math.min(Math.max(1, limitParam), 200) : 50;

  const sb = createAdminClient();
  let q = sb
    .from("frandoor_blog_schedules")
    .select("*")
    .order("scheduled_at", { ascending: false })
    .limit(limit);
  if (statusParam && (ALLOWED_STATUSES as readonly string[]).includes(statusParam)) {
    q = q.eq("status", statusParam);
  }

  const { data, error } = await q;
  if (error) {
    return NextResponse.json({ error: "SELECT_FAILED", message: error.message }, { status: 500 });
  }
  return NextResponse.json({ rows: data ?? [] });
}
