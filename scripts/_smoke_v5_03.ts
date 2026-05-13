/**
 * v5-03 smoke — 등록 즉시 백그라운드 generation + 발행만 예약 시각.
 *
 * 검증:
 *  · DB CHECK 확장 (generating / ready / publishing 추가)
 *  · POST /api/geo/scheduler/schedules workflow_dispatch trigger
 *  · scheduler_tick.mjs 2-stage (pending→ready / ready→published)
 *  · SchedulerList 새 status 라벨 + active polling + ready 미리보기
 *  · API ALLOWED_STATUSES 확장
 */
import Module from "node:module";
const ModAny = Module as unknown as { _load: (req: string, ...rest: unknown[]) => unknown };
const origLoad = ModAny._load;
ModAny._load = function (req: string, ...rest: unknown[]) {
  if (req === "server-only") return {};
  return origLoad.call(this, req, ...rest);
};

let okAll = true;
function check(label: string, ok: boolean, detail?: string) {
  console.log(`  ${ok ? "✓" : "✗"} ${label}${detail ? ` — ${detail.slice(0, 200)}` : ""}`);
  if (!ok) okAll = false;
}

async function main() {
  console.log("\n=== v5-03 smoke ===\n");
  const fs = await import("node:fs/promises");

  // T1 — DB migration status CHECK 확장
  console.log("[T1] DB migration status CHECK 확장 (generating / ready / publishing)");
  const migration = await fs
    .readFile("supabase/migrations/20260515_v5_03_schedules_status_flow.sql", "utf-8")
    .catch(() => "");
  check(`migration 파일 존재`, migration.length > 0);
  for (const s of ["pending", "generating", "ready", "publishing", "published", "failed", "canceled"]) {
    check(`status CHECK 포함 — '${s}'`, migration.includes(`'${s}'`));
  }
  check(`DROP CONSTRAINT 기존 status check`, migration.includes("DROP CONSTRAINT IF EXISTS frandoor_blog_schedules_status_check"));

  // T2 — POST schedules workflow_dispatch trigger
  console.log("\n[T2] POST /api/geo/scheduler/schedules — workflow_dispatch trigger");
  const crudSrc = await fs.readFile("app/api/geo/scheduler/schedules/route.ts", "utf-8");
  check(`triggerSchedulerWorkflowDispatch 함수`, crudSrc.includes("triggerSchedulerWorkflowDispatch"));
  check(`GitHub API workflows dispatch URL`, crudSrc.includes("scheduler-tick.yml/dispatches"));
  check(`GH_DISPATCH_PAT env`, crudSrc.includes("GH_DISPATCH_PAT"));
  check(`fire-and-forget — PAT 없어도 INSERT 성공`, crudSrc.includes("매시 cron 이 catch-up"));
  check(`Authorization: Bearer PAT`, crudSrc.includes("Authorization: `Bearer ${pat}`") || crudSrc.includes("`Bearer ${pat}`"));
  check(`ref: main 명시`, crudSrc.includes('"ref": "main"') || crudSrc.includes("ref: \"main\""));
  check(`ALLOWED_STATUSES 확장 (ready 포함)`, crudSrc.includes('"ready"') && crudSrc.includes('"generating"') && crudSrc.includes('"publishing"'));

  // T4 — scheduler_tick.mjs 2-stage
  console.log("\n[T4] scheduler_tick.mjs 2-stage (pending→ready / ready→published)");
  const tickScript = await fs.readFile("scripts/scheduler_tick.mjs", "utf-8");
  check(`stage1Generation 함수`, tickScript.includes("async function stage1Generation"));
  check(`stage2Publish 함수`, tickScript.includes("async function stage2Publish"));
  // Stage 1: pending → generating lock → A only chain → ready
  // v5-09 supersede: .eq("status", "pending") → PostgREST "status=eq.pending" query.
  check(
    `stage1 pickup 'pending'`,
    /stage1[\s\S]*\.eq\("status",\s*"pending"\)/.test(tickScript) ||
      /stage1[\s\S]*status=eq\.pending/.test(tickScript),
  );
  check(`stage1 'generating' lock`, tickScript.includes('status: "generating"'));
  check(`stage1 → 'ready' + draft_id 저장`, /status:\s*"ready"[\s\S]{0,200}draft_id/.test(tickScript));
  check(`stage1 실패 retry > 1 → failed (else pending)`, tickScript.includes('retryCount > 1 ? "failed" : "pending"'));
  // Stage 2: ready → publishing lock → publish-frandoor → published
  // v5-09 supersede: .eq("status", "ready").lte("scheduled_at", now) → PostgREST query.
  check(
    `stage2 pickup 'ready' + scheduled_at <= now`,
    /stage2[\s\S]*\.eq\("status",\s*"ready"\)[\s\S]*\.lte\("scheduled_at"/.test(tickScript) ||
      /stage2[\s\S]*status=eq\.ready[\s\S]*scheduled_at=lte\./.test(tickScript),
  );
  check(`stage2 'publishing' lock`, tickScript.includes('status: "publishing"'));
  check(`stage2 publish-frandoor 호출 (commitToFrandoor 위임)`, tickScript.includes("/api/geo/publish-frandoor"));
  check(`stage2 → 'published'`, tickScript.includes('status: "published"'));
  check(`stage2 실패 retry > 1 → failed (else ready)`, tickScript.includes('retryCount > 1 ? "failed" : "ready"'));
  // main 이 stage1 + stage2 순서대로 호출
  check(`main: stage1 → stage2`, /stage1Generation\(\)[\s\S]*stage2Publish\(\)/.test(tickScript));
  // v5-02-hf1 env 진단 (회귀)
  check(`v5-02-hf1 env 누락 진단 보존`, tickScript.includes("env 누락"));

  // T5 — SchedulerList 새 status + polling + ready 미리보기
  console.log("\n[T5] SchedulerList 새 status 라벨 + polling + ready 미리보기");
  const listSrc = await fs.readFile("app/(groupware)/content/scheduler/SchedulerList.tsx", "utf-8");
  for (const s of ["대기 중", "생성 중...", "준비 완료", "발행 중...", "발행 완료"]) {
    check(`status label 포함 — "${s}"`, listSrc.includes(s));
  }
  check(`ACTIVE_STATUSES set`, listSrc.includes("ACTIVE_STATUSES"));
  check(`5초 polling (router.refresh)`, listSrc.includes("setInterval") && listSrc.includes("router.refresh") && listSrc.includes("5000"));
  check(`ready 상태 미리보기 라벨`, listSrc.includes('"미리보기 ↗"') || listSrc.includes("미리보기 ↗"));
  check(`ready 라벨 분기 (status === 'ready' ? 미리보기 : draft)`, /r\.status === "ready"\s*\?\s*"미리보기/.test(listSrc));

  // page hint 갱신
  console.log("\n[T5b] scheduler page 안내 텍스트 v5-03 흐름 반영");
  const pageSrc = await fs.readFile("app/(groupware)/content/scheduler/page.tsx", "utf-8");
  check(`hint — 등록 즉시 백그라운드 generation`, pageSrc.includes("백그라운드 generation 시작"));
  check(`hint — 준비 완료 미리보기`, pageSrc.includes("준비 완료") && pageSrc.includes("미리보기"));
  check(`hint — 예약 시각 도래 시 commit`, pageSrc.includes("예약 시각 도래"));

  console.log(`\n=== ${okAll ? "ALL PASS" : "SOME FAILED"} ===\n`);
  process.exit(okAll ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
