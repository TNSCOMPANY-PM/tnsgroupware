/**
 * v5-01 — 예약 발행 cron tick (매시 0분).
 *
 * 흐름:
 *   1) status='pending' + scheduled_at <= now() row LIMIT 3 pickup
 *   2) running 으로 lock (race condition 방지 — UPDATE ... WHERE status='pending')
 *   3) A only 4-step (analyze → structure → write → thumbnail) 자동화
 *   4) commitToFrandoor 로 TNSCOMPANY-PM/Frandoor main 브랜치 content/blog/{slug}.md push
 *   5) draft + schedule 모두 published 마킹
 *
 * 실패 시: retry_count++ → 1회 미만이면 pending 재진입 (다음 cron pickup), 그 외 failed.
 */

import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/utils/supabase/admin";
import {
  runStep1AnalyzeAOnly,
  runStep2StructureAOnly,
  runStep3WriteAOnly,
  runStep4ThumbnailAOnly,
} from "@/lib/geo/v4/pipeline";
import {
  commitToFrandoor,
  extractSlugFromMarkdown,
  isFrandoorPublishConfigured,
} from "@/lib/geo/publish/githubFrandoor";

export const runtime = "nodejs";
export const maxDuration = 300; // 5분 — 최대 3건 × ~100s
export const dynamic = "force-dynamic";

type ScheduleRow = {
  id: string;
  industry: string;
  topic: string | null;
  scheduled_at: string;
  status: string;
  retry_count: number | null;
};

type TickResult =
  | { id: string; ok: true; draft_id: string; published_url: string }
  | { id: string; ok: false; error: string; next_status: "pending" | "failed" };

export async function GET(request: NextRequest) {
  // Vercel cron 만 호출 가능 (Bearer ${CRON_SECRET})
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!isFrandoorPublishConfigured()) {
    return NextResponse.json(
      { error: "FRANDOOR_GITHUB_TOKEN_MISSING" },
      { status: 503 },
    );
  }

  const sb = createAdminClient();
  const nowIso = new Date().toISOString();

  const { data: rows, error: selectErr } = await sb
    .from("frandoor_blog_schedules")
    .select("id, industry, topic, scheduled_at, status, retry_count")
    .eq("status", "pending")
    .lte("scheduled_at", nowIso)
    .order("scheduled_at", { ascending: true })
    .limit(3);

  if (selectErr) {
    return NextResponse.json(
      { error: "SELECT_FAILED", message: selectErr.message },
      { status: 500 },
    );
  }

  const results: TickResult[] = [];
  for (const r of (rows ?? []) as ScheduleRow[]) {
    const result = await processOne(sb, r);
    results.push(result);
  }

  return NextResponse.json({ processed: results.length, results });
}

async function processOne(
  sb: ReturnType<typeof createAdminClient>,
  row: ScheduleRow,
): Promise<TickResult> {
  // 1) lock: pending → running (다른 인스턴스 동시 pickup 방지)
  const { data: locked } = await sb
    .from("frandoor_blog_schedules")
    .update({ status: "running", updated_at: new Date().toISOString() })
    .eq("id", row.id)
    .eq("status", "pending")
    .select("id")
    .maybeSingle();
  if (!locked) {
    return { id: row.id, ok: false, error: "LOCK_FAILED (다른 인스턴스 pickup 추정)", next_status: "pending" };
  }

  try {
    // 2) A only 4-step
    const s1 = await runStep1AnalyzeAOnly({
      industry: row.industry,
      topic: row.topic ?? `${row.industry} 업종 분포 분석`,
    });
    const draftId = s1.draftId;
    await runStep2StructureAOnly(draftId);
    await runStep3WriteAOnly(draftId);
    await runStep4ThumbnailAOnly(draftId);

    // 3) draft.content fetch → frontmatter slug 추출 → commitToFrandoor
    const { data: draft } = await sb
      .from("frandoor_blog_drafts")
      .select("content")
      .eq("id", draftId)
      .maybeSingle();
    const content = (draft as { content?: string } | null)?.content ?? "";
    if (!content.trim()) throw new Error("draft content 비어있음");

    const slug = extractSlugFromMarkdown(content);
    if (!slug) throw new Error("frontmatter slug 추출 실패");

    const publishResult = await commitToFrandoor({ slug, content });

    // 4) draft + schedule 둘 다 published 마킹
    await sb
      .from("frandoor_blog_drafts")
      .update({ published_url: publishResult.pageUrl, status: "published" })
      .eq("id", draftId);
    await sb
      .from("frandoor_blog_schedules")
      .update({
        status: "published",
        draft_id: draftId,
        published_url: publishResult.pageUrl,
        updated_at: new Date().toISOString(),
      })
      .eq("id", row.id);

    return {
      id: row.id,
      ok: true,
      draft_id: draftId,
      published_url: publishResult.pageUrl,
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    const retryCount = (row.retry_count ?? 0) + 1;
    const nextStatus: "pending" | "failed" = retryCount > 1 ? "failed" : "pending";
    await sb
      .from("frandoor_blog_schedules")
      .update({
        status: nextStatus,
        retry_count: retryCount,
        error_msg: msg,
        updated_at: new Date().toISOString(),
      })
      .eq("id", row.id);
    return { id: row.id, ok: false, error: msg, next_status: nextStatus };
  }
}
