#!/usr/bin/env node
/**
 * v5-03 — GitHub Actions Runner 안에서 실행되는 2단계 scheduler tick.
 *
 * 흐름:
 *   Stage 1 — pending → ready (generation, 시각 도래 무관)
 *     · pickup LIMIT 3 pending (오래된 created_at 순)
 *     · running 'generating' lock
 *     · A only 4-step chain (analyze → structure → write → thumbnail)
 *     · 성공 → status='ready' + draft_id 저장 (발행은 시각 도래 시 stage 2 가 처리)
 *     · 실패 → retry 1회 (pending 재진입) → 그 후 failed
 *
 *   Stage 2 — ready → published (commit, 시각 도래 시만)
 *     · pickup LIMIT 5 ready + scheduled_at <= now
 *     · 'publishing' lock
 *     · /api/geo/publish-frandoor 호출 → commitToFrandoor
 *     · 성공 → status='published' + published_url 저장
 *     · 실패 → retry 1회 (ready 재진입) → 그 후 failed
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

// v5-02-hf1 — 어느 secret 이 비었는지 정확히 출력 (값은 미노출, boolean 만).
const envFlags = {
  NEXT_PUBLIC_SUPABASE_URL: !!NEXT_PUBLIC_SUPABASE_URL,
  SUPABASE_SERVICE_ROLE_KEY: !!SUPABASE_SERVICE_ROLE_KEY,
  GROUPWARE_BASE_URL: !!GROUPWARE_BASE_URL,
  SCHEDULER_API_TOKEN: !!SCHEDULER_API_TOKEN,
};
const missing = Object.entries(envFlags)
  .filter(([, present]) => !present)
  .map(([k]) => k);
if (missing.length > 0) {
  console.error(`[scheduler] env 누락: ${missing.join(", ")}`);
  console.error(`[scheduler] env 상태: ${JSON.stringify(envFlags)}`);
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

// ─────────────────────────────────────────────────────────
// Stage 1 — pending → ready (generation)
// ─────────────────────────────────────────────────────────
async function stage1Generation() {
  const { data: rows, error } = await sb
    .from("frandoor_blog_schedules")
    .select("id, industry, topic, scheduled_at, status, retry_count, draft_id")
    .eq("status", "pending")
    .order("created_at", { ascending: true })
    .limit(3);
  if (error) {
    console.error("[stage1] pickup error:", error.message);
    return;
  }
  console.log(`[stage1] picked up ${rows?.length ?? 0} pending rows`);

  for (const row of rows ?? []) {
    console.log(
      `[stage1 ${row.id}] industry=${row.industry} topic=${row.topic ?? "(default)"}`,
    );

    // 'generating' 으로 lock
    const { data: lockOk } = await sb
      .from("frandoor_blog_schedules")
      .update({ status: "generating", updated_at: new Date().toISOString() })
      .eq("id", row.id)
      .eq("status", "pending")
      .select("id")
      .maybeSingle();
    if (!lockOk) {
      console.log(`[stage1 ${row.id}] skip — lock 실패 (다른 인스턴스 pickup 추정)`);
      continue;
    }

    try {
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
      console.log(`[stage1 ${row.id}] step1 OK draftId=${draftId}`);

      await postJSON(`/api/geo/a-only/structure/${draftId}`, {});
      console.log(`[stage1 ${row.id}] step2 OK`);

      await postJSON(`/api/geo/a-only/write/${draftId}`, {});
      console.log(`[stage1 ${row.id}] step3 OK`);

      await postJSON(`/api/geo/a-only/thumbnail/${draftId}`, {});
      console.log(`[stage1 ${row.id}] step4 OK`);

      await sb
        .from("frandoor_blog_schedules")
        .update({
          status: "ready",
          draft_id: draftId,
          updated_at: new Date().toISOString(),
        })
        .eq("id", row.id);
      console.log(`[stage1 ${row.id}] generated → ready (draftId=${draftId})`);
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
        `[stage1 ${row.id}] generation FAIL (retry=${retryCount}, next=${nextStatus}): ${msg}`,
      );
    }
  }
}

// ─────────────────────────────────────────────────────────
// Stage 2 — ready → published (commit, 시각 도래 시만)
// ─────────────────────────────────────────────────────────
async function stage2Publish() {
  const nowIso = new Date().toISOString();
  const { data: rows, error } = await sb
    .from("frandoor_blog_schedules")
    .select("id, draft_id, scheduled_at, status, retry_count")
    .eq("status", "ready")
    .lte("scheduled_at", nowIso)
    .order("scheduled_at", { ascending: true })
    .limit(5);
  if (error) {
    console.error("[stage2] pickup error:", error.message);
    return;
  }
  console.log(`[stage2] picked up ${rows?.length ?? 0} ready rows`);

  for (const row of rows ?? []) {
    if (!row.draft_id) {
      console.warn(`[stage2 ${row.id}] draft_id 없음 — skip`);
      continue;
    }

    const { data: lockOk } = await sb
      .from("frandoor_blog_schedules")
      .update({ status: "publishing", updated_at: new Date().toISOString() })
      .eq("id", row.id)
      .eq("status", "ready")
      .select("id")
      .maybeSingle();
    if (!lockOk) {
      console.log(`[stage2 ${row.id}] skip — lock 실패`);
      continue;
    }

    try {
      const publishRes = await postJSON("/api/geo/publish-frandoor", {
        post_id: row.draft_id,
      });
      const publishedUrl =
        publishRes.pageUrl ?? publishRes.published_url ?? null;
      console.log(`[stage2 ${row.id}] published OK → ${publishedUrl}`);

      // drafts 는 publish-frandoor route 가 이미 update 했음. schedules 만 마킹.
      await sb
        .from("frandoor_blog_schedules")
        .update({
          status: "published",
          published_url: publishedUrl,
          updated_at: new Date().toISOString(),
        })
        .eq("id", row.id);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      const retryCount = (row.retry_count ?? 0) + 1;
      const nextStatus = retryCount > 1 ? "failed" : "ready";
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
        `[stage2 ${row.id}] publish FAIL (retry=${retryCount}, next=${nextStatus}): ${msg}`,
      );
    }
  }
}

async function main() {
  await stage1Generation();
  await stage2Publish();
  console.log("[scheduler] done");
}

main().catch((e) => {
  console.error("[scheduler] fatal:", e);
  process.exit(1);
});
