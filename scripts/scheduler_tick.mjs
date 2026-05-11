#!/usr/bin/env node
/**
 * v5-02 — GitHub Actions Runner 안에서 매시 실행되는 standalone scheduler tick.
 *
 * 흐름:
 *   1) Supabase pickup pending LIMIT 5 (status='pending' + scheduled_at <= now)
 *   2) running 으로 lock (race condition 방지)
 *   3) groupware Vercel endpoint chain 호출 (x-scheduler-token 헤더 인증):
 *      /api/geo/a-only/analyze → structure/{id} → write/{id} → thumbnail/{id} → publish-frandoor
 *   4) 성공 시 published 마킹, 실패 시 retry 1회 (pending 재진입) → 그 후 failed
 *
 * env (GitHub Secrets):
 *   - NEXT_PUBLIC_SUPABASE_URL
 *   - SUPABASE_SERVICE_ROLE_KEY
 *   - GROUPWARE_BASE_URL (e.g. https://tnsgroupware.vercel.app)
 *   - SCHEDULER_API_TOKEN
 */

import { createClient } from "@supabase/supabase-js";

const {
  NEXT_PUBLIC_SUPABASE_URL,
  SUPABASE_SERVICE_ROLE_KEY,
  GROUPWARE_BASE_URL,
  SCHEDULER_API_TOKEN,
} = process.env;

if (
  !NEXT_PUBLIC_SUPABASE_URL ||
  !SUPABASE_SERVICE_ROLE_KEY ||
  !GROUPWARE_BASE_URL ||
  !SCHEDULER_API_TOKEN
) {
  console.error(
    "[scheduler] env 누락 — NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY / GROUPWARE_BASE_URL / SCHEDULER_API_TOKEN",
  );
  process.exit(1);
}

const BASE = GROUPWARE_BASE_URL.replace(/\/$/, "");
const sb = createClient(NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

async function postJSON(path, body) {
  const r = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-scheduler-token": SCHEDULER_API_TOKEN,
    },
    body: JSON.stringify(body ?? {}),
  });
  const text = await r.text();
  if (!r.ok) {
    throw new Error(`${path} → HTTP ${r.status} ${text.slice(0, 400)}`);
  }
  try {
    return JSON.parse(text);
  } catch {
    return { raw: text };
  }
}

async function main() {
  // 1) pickup
  const nowIso = new Date().toISOString();
  const { data: rows, error } = await sb
    .from("frandoor_blog_schedules")
    .select("id, industry, topic, scheduled_at, status, retry_count")
    .eq("status", "pending")
    .lte("scheduled_at", nowIso)
    .order("scheduled_at", { ascending: true })
    .limit(5);

  if (error) {
    console.error("[scheduler] pickup error:", error.message);
    process.exit(1);
  }

  console.log(`[scheduler] picked up ${rows?.length ?? 0} rows`);

  for (const row of rows ?? []) {
    console.log(
      `[${row.id}] industry=${row.industry} topic=${row.topic ?? "(default)"} scheduled=${row.scheduled_at}`,
    );

    // 2) running 으로 lock
    const { data: lockOk } = await sb
      .from("frandoor_blog_schedules")
      .update({ status: "running", updated_at: new Date().toISOString() })
      .eq("id", row.id)
      .eq("status", "pending")
      .select("id")
      .maybeSingle();
    if (!lockOk) {
      console.log(`[${row.id}] skip — lock 실패 (다른 인스턴스 pickup 추정)`);
      continue;
    }

    try {
      // 3) A only 4-step
      const step1 = await postJSON("/api/geo/a-only/analyze", {
        industry: row.industry,
        topic: row.topic ?? `${row.industry} 업종 분포 분석`,
      });
      const draftId = step1.draftId ?? step1.draft_id ?? step1.id;
      if (!draftId) {
        throw new Error(
          `step1 응답에 draftId 없음: ${JSON.stringify(step1).slice(0, 200)}`,
        );
      }
      console.log(`[${row.id}] step1 OK draftId=${draftId}`);

      await postJSON(`/api/geo/a-only/structure/${draftId}`, {});
      console.log(`[${row.id}] step2 OK`);

      await postJSON(`/api/geo/a-only/write/${draftId}`, {});
      console.log(`[${row.id}] step3 OK`);

      await postJSON(`/api/geo/a-only/thumbnail/${draftId}`, {});
      console.log(`[${row.id}] step4 OK`);

      // 4) frandoor 발행
      const publishRes = await postJSON("/api/geo/publish-frandoor", {
        post_id: draftId,
      });
      const publishedUrl =
        publishRes.pageUrl ?? publishRes.published_url ?? null;
      console.log(`[${row.id}] published OK → ${publishedUrl}`);

      // 5) schedule published 마킹
      await sb
        .from("frandoor_blog_schedules")
        .update({
          status: "published",
          draft_id: draftId,
          published_url: publishedUrl,
          updated_at: new Date().toISOString(),
        })
        .eq("id", row.id);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      const retryCount = (row.retry_count ?? 0) + 1;
      // 1회 자동 재시도 — 다음 cron pickup. 2회 이상 실패 시 failed 종료.
      const nextStatus = retryCount > 1 ? "failed" : "pending";
      await sb
        .from("frandoor_blog_schedules")
        .update({
          status: nextStatus,
          retry_count: retryCount,
          error_msg: msg.slice(0, 1000),
          updated_at: new Date().toISOString(),
        })
        .eq("id", row.id);
      console.error(
        `[${row.id}] FAIL (retry=${retryCount}, next=${nextStatus}): ${msg}`,
      );
    }
  }

  console.log("[scheduler] done");
}

main().catch((e) => {
  console.error("[scheduler] fatal:", e);
  process.exit(1);
});
