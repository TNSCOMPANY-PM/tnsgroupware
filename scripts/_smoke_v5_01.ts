/**
 * v5-01 smoke — 예약 발행 자동화 인프라 (DB / API / cron / UI / tab).
 * DB / OpenAI / GitHub 호출 X — source surface 검증 + cron 컴포넌트 시그니처 확인.
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
  console.log("\n=== v5-01 smoke ===\n");
  const fs = await import("node:fs/promises");

  // T1 — migration
  console.log("[T1] DB migration frandoor_blog_schedules");
  const migration = await fs
    .readFile("supabase/migrations/20260511_v5_01_schedules.sql", "utf-8")
    .catch(() => "");
  check(`migration 파일 존재`, migration.length > 0);
  check(`CREATE TABLE frandoor_blog_schedules`, migration.includes("CREATE TABLE IF NOT EXISTS frandoor_blog_schedules"));
  check(`status CHECK pending/running/published/failed/canceled`, /'pending'[\s\S]*'running'[\s\S]*'published'[\s\S]*'failed'[\s\S]*'canceled'/.test(migration));
  check(`draft_id REFERENCES frandoor_blog_drafts`, migration.includes("draft_id uuid REFERENCES frandoor_blog_drafts"));
  check(`idx_schedules_status_at index`, migration.includes("CREATE INDEX IF NOT EXISTS idx_schedules_status_at"));

  // T3 — CRUD API
  console.log("\n[T3] CRUD API /api/geo/scheduler/schedules");
  const crudSrc = await fs.readFile("app/api/geo/scheduler/schedules/route.ts", "utf-8");
  check(`POST handler`, crudSrc.includes("export async function POST"));
  check(`GET handler`, crudSrc.includes("export async function GET"));
  check(`industry 필수 검증`, crudSrc.includes("industry 필수"));
  check(`scheduled_at 필수 검증`, crudSrc.includes("scheduled_at 필수"));
  check(`KST 해석 (+09:00 fallback)`, crudSrc.includes("+09:00"));
  check(`status='pending' INSERT default`, crudSrc.includes('status: "pending"'));

  const patchSrc = await fs.readFile("app/api/geo/scheduler/schedules/[id]/route.ts", "utf-8");
  check(`PATCH handler`, patchSrc.includes("export async function PATCH"));
  check(`action cancel`, patchSrc.includes('"cancel"'));
  check(`action retry`, patchSrc.includes('"retry"'));
  check(`action run_now`, patchSrc.includes('"run_now"'));
  check(`cancel pending only`, patchSrc.includes('cancel 은 pending 만'));
  check(`retry failed only`, patchSrc.includes('retry 는 failed 만'));
  check(`run_now scheduled_at = now()`, patchSrc.includes("scheduled_at = new Date()") || patchSrc.includes("new Date().toISOString()"));

  // T4 — cron tick
  console.log("\n[T4] cron /api/geo/scheduler/tick");
  const tickSrc = await fs.readFile("app/api/geo/scheduler/tick/route.ts", "utf-8");
  check(`Bearer CRON_SECRET 인증`, tickSrc.includes("`Bearer ${cronSecret}`") || tickSrc.includes('Bearer ${cronSecret}'));
  check(`isFrandoorPublishConfigured 가드`, tickSrc.includes("isFrandoorPublishConfigured"));
  check(`maxDuration = 300`, tickSrc.includes("maxDuration = 300"));
  check(`pending 만 + scheduled_at <= now LIMIT 3`, tickSrc.includes(".limit(3)") && tickSrc.includes(".eq(\"status\", \"pending\")") && tickSrc.includes(".lte(\"scheduled_at\""));
  check(`running 으로 lock`, tickSrc.includes('status: "running"') && tickSrc.includes('.eq("status", "pending")'));
  check(`A only 4-step 호출`, tickSrc.includes("runStep1AnalyzeAOnly") && tickSrc.includes("runStep2StructureAOnly") && tickSrc.includes("runStep3WriteAOnly") && tickSrc.includes("runStep4ThumbnailAOnly"));
  check(`commitToFrandoor + extractSlugFromMarkdown`, tickSrc.includes("commitToFrandoor") && tickSrc.includes("extractSlugFromMarkdown"));
  check(`draft published_url 갱신`, tickSrc.includes("published_url: publishResult.pageUrl"));
  check(`schedule published 갱신 + draft_id 저장`, /status:\s*"published"[\s\S]{0,200}draft_id/.test(tickSrc));
  check(`실패 시 retry > 1 → failed`, tickSrc.includes("retryCount > 1") || tickSrc.includes("retryCount > 1 ? \"failed\""));

  // T2 — UI
  console.log("\n[T2] /content/scheduler UI");
  const pageSrc = await fs.readFile("app/(groupware)/content/scheduler/page.tsx", "utf-8");
  check(`page 서버 컴포넌트 + SELECT frandoor_blog_schedules`, pageSrc.includes("frandoor_blog_schedules") && pageSrc.includes("createAdminClient"));
  check(`SchedulerForm import`, pageSrc.includes("import SchedulerForm"));
  check(`SchedulerList import`, pageSrc.includes("import SchedulerList"));
  check(`안내 메시지 (cron 매시 0분)`, pageSrc.includes("매시 0분"));

  const formSrc = await fs.readFile("app/(groupware)/content/scheduler/SchedulerForm.tsx", "utf-8");
  check(`SchedulerForm "use client"`, formSrc.startsWith('"use client"'));
  check(`INDUSTRIES 15`, (formSrc.match(/"[가-힣()]+"/g) ?? []).length >= 15);
  check(`industry select + topic + datetime-local`, formSrc.includes("type=\"datetime-local\"") && formSrc.includes("setIndustry") && formSrc.includes("setTopic"));
  check(`POST /api/geo/scheduler/schedules`, formSrc.includes("/api/geo/scheduler/schedules"));

  const listSrc = await fs.readFile("app/(groupware)/content/scheduler/SchedulerList.tsx", "utf-8");
  check(`SchedulerList "use client"`, listSrc.startsWith('"use client"'));
  check(`상태 라벨 (대기/실행중/발행됨/실패/취소됨)`, listSrc.includes("대기") && listSrc.includes("실행 중") && listSrc.includes("발행됨"));
  check(`PATCH action 호출`, listSrc.includes("/api/geo/scheduler/schedules/"));
  check(`run_now / cancel / retry 액션 버튼`, listSrc.includes("run_now") && listSrc.includes("cancel") && listSrc.includes("retry"));
  check(`KST timezone 표시`, listSrc.includes("Asia/Seoul"));
  check(`draft 링크 + frandoor.co.kr 링크`, listSrc.includes("/content/posts/") && listSrc.includes("frandoor.co.kr"));

  // T5 — vercel.json cron + content layout tab
  console.log("\n[T5] vercel.json cron + content layout tab");
  const vercelJson = JSON.parse(await fs.readFile("vercel.json", "utf-8"));
  const crons = vercelJson.crons as Array<{ path: string; schedule: string }>;
  const tickCron = crons.find((c) => c.path === "/api/geo/scheduler/tick");
  check(`vercel.json 에 /api/geo/scheduler/tick cron`, !!tickCron);
  check(`schedule "0 * * * *" (매시 0분)`, tickCron?.schedule === "0 * * * *");

  const layoutSrc = await fs.readFile("app/(groupware)/content/layout.tsx", "utf-8");
  check(`content layout — /content/scheduler 탭`, layoutSrc.includes("/content/scheduler"));
  check(`예약 발행 라벨`, layoutSrc.includes("예약 발행"));
  check(`Clock 아이콘 import`, layoutSrc.includes("Clock"));

  console.log(`\n=== ${okAll ? "ALL PASS" : "SOME FAILED"} ===\n`);
  process.exit(okAll ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
