#!/usr/bin/env node
/**
 * v5-09 — GitHub Actions Runner 안에서 매 5분 실행되는 2단계 scheduler tick.
 *
 * 변경점 (vs v5-02~06):
 *   · @supabase/supabase-js 의존성 제거 → PostgREST REST API 를 fetch 직접 호출
 *   · workflow install step 자체 소멸 → run 시간 ~60s → ~10s
 *   · v5-02-hf2 Node 22 강제 이유 (realtime-js WebSocket) 소멸
 *
 * 흐름 (v5-03~06 그대로):
 *   Stage 1 — pending → ready (generation)
 *   Stage 2 — ready (시각 도래) → published (commit)
 *
 * env (GitHub Secrets):
 *   - NEXT_PUBLIC_SUPABASE_URL
 *   - SUPABASE_SERVICE_ROLE_KEY
 *   - GROUPWARE_BASE_URL (e.g. https://tnsgroupware.vercel.app)
 *   - SCHEDULER_API_TOKEN
 */

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
const SUPA_BASE = NEXT_PUBLIC_SUPABASE_URL.replace(/\/$/, "");
const SUPA_HEADERS = {
  apikey: SUPABASE_SERVICE_ROLE_KEY,
  authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
};

// ─────────────────────────────────────────────────────────
// Supabase REST helpers (PostgREST 직접 호출)
// ─────────────────────────────────────────────────────────
async function sbSelect(table, query) {
  const r = await fetch(`${SUPA_BASE}/rest/v1/${table}?${query}`, {
    headers: { ...SUPA_HEADERS, accept: "application/json" },
  });
  if (!r.ok) {
    const text = await r.text().catch(() => "");
    throw new Error(`SELECT ${table} → HTTP ${r.status} ${text.slice(0, 300)}`);
  }
  return r.json();
}

/**
 * Conditional UPDATE. 반환값: 업데이트된 row 배열.
 * length === 0 이면 조건 미일치 = lock 실패 (race condition 방지).
 */
async function sbUpdate(table, query, body) {
  const r = await fetch(`${SUPA_BASE}/rest/v1/${table}?${query}`, {
    method: "PATCH",
    headers: {
      ...SUPA_HEADERS,
      "content-type": "application/json",
      prefer: "return=representation",
      accept: "application/json",
    },
    body: JSON.stringify(body),
  });
  if (!r.ok) {
    const text = await r.text().catch(() => "");
    throw new Error(`UPDATE ${table} → HTTP ${r.status} ${text.slice(0, 300)}`);
  }
  return r.json();
}

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
  const rows = await sbSelect(
    "frandoor_blog_schedules",
    "select=*&status=eq.pending&order=created_at.asc&limit=3",
  );
  console.log(`[stage1] picked up ${rows.length} pending rows`);

  for (const row of rows) {
    const mode = row.gen_mode === "a_plus_c" ? "a_plus_c" : "a_only";
    console.log(
      `[stage1 ${row.id}] gen_mode=${mode} ${mode === "a_only" ? `industry=${row.industry}` : `brand_id=${row.brand_id}`} topic=${row.topic ?? "(default)"}`,
    );

    // 'generating' 으로 lock (조건부 UPDATE — race condition 방지)
    const locked = await sbUpdate(
      "frandoor_blog_schedules",
      `id=eq.${row.id}&status=eq.pending`,
      { status: "generating", updated_at: new Date().toISOString() },
    );
    if (locked.length === 0) {
      console.log(`[stage1 ${row.id}] skip — lock 실패 (다른 인스턴스 pickup 추정)`);
      continue;
    }

    try {
      let draftId;
      if (mode === "a_only") {
        const step1 = await postJSON("/api/geo/a-only/analyze", {
          industry: row.industry,
          topic: row.topic ?? `${row.industry} 업종 분포 분석`,
        });
        draftId = step1.draftId ?? step1.draft_id ?? step1.id;
        if (!draftId) {
          throw new Error(
            `step1 응답에 draftId 없음: ${JSON.stringify(step1).slice(0, 200)}`,
          );
        }
        console.log(`[stage1 ${row.id}] a_only step1 OK draftId=${draftId}`);

        await postJSON(`/api/geo/a-only/structure/${draftId}`, {});
        console.log(`[stage1 ${row.id}] a_only step2 OK`);

        await postJSON(`/api/geo/a-only/write/${draftId}`, {});
        console.log(`[stage1 ${row.id}] a_only step3 OK`);

        await postJSON(`/api/geo/a-only/thumbnail/${draftId}`, {});
        console.log(`[stage1 ${row.id}] a_only step4 OK`);
      } else {
        // v5-12 — A+C 3-step chain (editor 와 동일: facts-a → facts-c → write)
        if (!row.brand_id) throw new Error("a_plus_c row 인데 brand_id 없음");
        const step1 = await postJSON("/api/geo/facts-a", {
          brand_id: row.brand_id,
          topic: row.topic ?? "",
        });
        draftId = step1.draftId ?? step1.draft_id ?? step1.id;
        if (!draftId) {
          throw new Error(
            `facts-a 응답에 draftId 없음: ${JSON.stringify(step1).slice(0, 200)}`,
          );
        }
        console.log(`[stage1 ${row.id}] a_plus_c facts-a OK draftId=${draftId}`);

        await postJSON(`/api/geo/facts-c/${draftId}`, {});
        console.log(`[stage1 ${row.id}] a_plus_c facts-c OK`);

        await postJSON(`/api/geo/write/${draftId}`, {});
        console.log(`[stage1 ${row.id}] a_plus_c write OK`);
      }

      await sbUpdate(
        "frandoor_blog_schedules",
        `id=eq.${row.id}`,
        {
          status: "ready",
          draft_id: draftId,
          updated_at: new Date().toISOString(),
        },
      );
      console.log(`[stage1 ${row.id}] generated → ready (draftId=${draftId})`);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      const retryCount = (row.retry_count ?? 0) + 1;
      // 1회 자동 재시도 — 다음 cron pickup. 2회 이상 실패 시 failed 종료.
      const nextStatus = retryCount > 1 ? "failed" : "pending";
      await sbUpdate(
        "frandoor_blog_schedules",
        `id=eq.${row.id}`,
        {
          status: nextStatus,
          retry_count: retryCount,
          error_msg: msg.slice(0, 1000),
          updated_at: new Date().toISOString(),
        },
      );
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
  const rows = await sbSelect(
    "frandoor_blog_schedules",
    `select=*&status=eq.ready&scheduled_at=lte.${encodeURIComponent(nowIso)}&order=scheduled_at.asc&limit=5`,
  );
  console.log(`[stage2] picked up ${rows.length} ready rows`);

  for (const row of rows) {
    if (!row.draft_id) {
      console.warn(`[stage2 ${row.id}] draft_id 없음 — skip`);
      continue;
    }

    const locked = await sbUpdate(
      "frandoor_blog_schedules",
      `id=eq.${row.id}&status=eq.ready`,
      { status: "publishing", updated_at: new Date().toISOString() },
    );
    if (locked.length === 0) {
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

      // drafts 는 publish-frandoor route 가 이미 update. schedules 만 마킹.
      await sbUpdate(
        "frandoor_blog_schedules",
        `id=eq.${row.id}`,
        {
          status: "published",
          published_url: publishedUrl,
          updated_at: new Date().toISOString(),
        },
      );
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      const retryCount = (row.retry_count ?? 0) + 1;
      const nextStatus = retryCount > 1 ? "failed" : "ready";
      await sbUpdate(
        "frandoor_blog_schedules",
        `id=eq.${row.id}`,
        {
          status: nextStatus,
          retry_count: retryCount,
          error_msg: msg.slice(0, 1000),
          updated_at: new Date().toISOString(),
        },
      );
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
