/**
 * v5-01 smoke — 예약 발행 자동화 인프라 (DB / schedules CRUD / UI / tab).
 *
 * v5-02 supersede: cron 부분 (vercel.json cron + /api/geo/scheduler/tick) 은 GitHub Actions 로 이전되어 제거됨.
 * 이 smoke 는 v5-02 이후에도 살아남는 인프라 (DB / CRUD / UI / tab) 만 검증.
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

  // T2 — UI
  console.log("\n[T2] /content/scheduler UI");
  const pageSrc = await fs.readFile("app/(groupware)/content/scheduler/page.tsx", "utf-8");
  check(`page 서버 컴포넌트 + SELECT frandoor_blog_schedules`, pageSrc.includes("frandoor_blog_schedules") && pageSrc.includes("createAdminClient"));
  check(`SchedulerForm import`, pageSrc.includes("import SchedulerForm"));
  check(`SchedulerList import`, pageSrc.includes("import SchedulerList"));
  // v5-03 supersede: 안내 문구 "매시 0분" → "예약 시각 도래" / "백그라운드 generation" 흐름 안내.
  check(
    `안내 메시지 (스케줄 흐름)`,
    pageSrc.includes("매시 0분") || pageSrc.includes("예약 시각") || pageSrc.includes("백그라운드"),
  );

  const formSrc = await fs.readFile("app/(groupware)/content/scheduler/SchedulerForm.tsx", "utf-8");
  check(`SchedulerForm "use client"`, formSrc.startsWith('"use client"'));
  check(`INDUSTRIES 15`, (formSrc.match(/"[가-힣()]+"/g) ?? []).length >= 15);
  check(`industry select + topic + datetime-local`, formSrc.includes("type=\"datetime-local\"") && formSrc.includes("setIndustry") && formSrc.includes("setTopic"));
  check(`POST /api/geo/scheduler/schedules`, formSrc.includes("/api/geo/scheduler/schedules"));

  const listSrc = await fs.readFile("app/(groupware)/content/scheduler/SchedulerList.tsx", "utf-8");
  check(`SchedulerList "use client"`, listSrc.startsWith('"use client"'));
  // v5-03 supersede: "대기" → "대기 중", "실행 중" → "생성 중...", "발행됨" → "발행 완료".
  check(
    `상태 라벨 (대기 / 생성·발행 / 발행 완료)`,
    listSrc.includes("대기") &&
      (listSrc.includes("생성 중") || listSrc.includes("실행 중")) &&
      (listSrc.includes("발행 완료") || listSrc.includes("발행됨")),
  );
  check(`PATCH action 호출`, listSrc.includes("/api/geo/scheduler/schedules/"));
  check(`run_now / cancel / retry 액션 버튼`, listSrc.includes("run_now") && listSrc.includes("cancel") && listSrc.includes("retry"));
  check(`KST timezone 표시`, listSrc.includes("Asia/Seoul"));
  check(`draft 링크 + frandoor.co.kr 링크`, listSrc.includes("/content/posts/") && listSrc.includes("frandoor.co.kr"));

  // T5 — content layout tab
  console.log("\n[T5] content layout — 예약 발행 탭");
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
