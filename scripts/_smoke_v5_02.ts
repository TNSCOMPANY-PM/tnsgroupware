/**
 * v5-02 smoke — GitHub Actions 기반 예약 발행 (Vercel Hobby 대응).
 *
 * 검증:
 *  · vercel.json 의 /api/geo/scheduler/tick cron 제거
 *  · /api/geo/scheduler/tick endpoint 파일 부재
 *  · SCHEDULER_API_TOKEN 인증 (getSessionOrSchedulerToken) 5 routes 적용
 *  · scripts/scheduler_tick.mjs 신규
 *  · .github/workflows/scheduler-tick.yml 신규 (cron + workflow_dispatch)
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
  console.log("\n=== v5-02 smoke ===\n");
  const fs = await import("node:fs/promises");

  // T1 — vercel.json cron 제거
  console.log("[T1] vercel.json — /api/geo/scheduler/tick cron 제거");
  const vercelJson = JSON.parse(await fs.readFile("vercel.json", "utf-8"));
  const crons = (vercelJson.crons ?? []) as Array<{ path: string; schedule: string }>;
  check(
    `vercel.json 에 /api/geo/scheduler/tick cron 없음`,
    !crons.some((c) => c.path === "/api/geo/scheduler/tick"),
  );

  // T2 — tick endpoint 파일 삭제
  console.log("\n[T2] /api/geo/scheduler/tick endpoint 파일 부재");
  const tickExists = await fs
    .stat("app/api/geo/scheduler/tick/route.ts")
    .then(() => true)
    .catch(() => false);
  check(`tick route.ts 파일 없음`, !tickExists);

  // T3 — getSessionOrSchedulerToken helper + 5 routes 적용
  console.log("\n[T3] SCHEDULER_API_TOKEN 인증 헬퍼 + 5 routes 적용");
  const authSrc = await fs.readFile("utils/apiAuth.ts", "utf-8");
  check(`getSessionOrSchedulerToken export`, authSrc.includes("export async function getSessionOrSchedulerToken"));
  check(`x-scheduler-token 헤더`, authSrc.includes('"x-scheduler-token"'));
  check(`SCHEDULER_API_TOKEN env`, authSrc.includes("SCHEDULER_API_TOKEN"));

  const routesToCheck: Array<[string, string]> = [
    ["analyze", "app/api/geo/a-only/analyze/route.ts"],
    ["structure", "app/api/geo/a-only/structure/[draft_id]/route.ts"],
    ["write", "app/api/geo/a-only/write/[draft_id]/route.ts"],
    ["thumbnail", "app/api/geo/a-only/thumbnail/[draft_id]/route.ts"],
    ["publish-frandoor", "app/api/geo/publish-frandoor/route.ts"],
  ];
  for (const [name, path] of routesToCheck) {
    const src = await fs.readFile(path, "utf-8");
    check(
      `${name} route — getSessionOrSchedulerToken import + 호출`,
      src.includes("getSessionOrSchedulerToken") && src.includes("auth.ok"),
    );
  }

  // T4 — scheduler_tick.mjs 신규
  console.log("\n[T4] scripts/scheduler_tick.mjs");
  const tickScript = await fs.readFile("scripts/scheduler_tick.mjs", "utf-8");
  check(`scheduler_tick.mjs 파일 존재`, tickScript.length > 0);
  check(`Supabase createClient (service role)`, tickScript.includes("@supabase/supabase-js") && tickScript.includes("SUPABASE_SERVICE_ROLE_KEY"));
  check(`x-scheduler-token 헤더 전송`, tickScript.includes('"x-scheduler-token"'));
  check(`pickup pending LIMIT 5`, tickScript.includes(".limit(5)"));
  check(`A only 4-step chain (analyze → structure → write → thumbnail)`, tickScript.includes("/api/geo/a-only/analyze") && tickScript.includes("/api/geo/a-only/structure/") && tickScript.includes("/api/geo/a-only/write/") && tickScript.includes("/api/geo/a-only/thumbnail/"));
  check(`publish-frandoor 호출`, tickScript.includes("/api/geo/publish-frandoor"));
  // v5-03 supersede: lock 상태가 running → generating/publishing 으로 분화.
  check(
    `running / generating / publishing 으로 lock (race condition 방지)`,
    tickScript.includes('status: "running"') ||
      tickScript.includes('status: "generating"') ||
      tickScript.includes('status: "publishing"'),
  );
  check(`실패 시 retry > 1 → failed`, tickScript.includes("retryCount > 1") || tickScript.includes('retryCount > 1 ? "failed"'));
  check(`draftId 응답 파싱 (camelCase 우선)`, tickScript.includes("step1.draftId"));

  // T5 — .github/workflows/scheduler-tick.yml
  console.log("\n[T5] .github/workflows/scheduler-tick.yml");
  const workflow = await fs.readFile(".github/workflows/scheduler-tick.yml", "utf-8");
  check(`workflow 파일 존재`, workflow.length > 0);
  check(`name: Scheduler Tick`, workflow.includes("name: Scheduler Tick"));
  check(`cron "0 * * * *"`, workflow.includes('- cron: "0 * * * *"'));
  check(`workflow_dispatch (수동 trigger)`, workflow.includes("workflow_dispatch"));
  check(`concurrency group scheduler-tick`, workflow.includes("group: scheduler-tick"));
  check(`actions/checkout@v4`, workflow.includes("actions/checkout@v4"));
  // v5-02 hf2: Node 22 (native WebSocket 지원, supabase-js v2 realtime-js 요구)
  check(`actions/setup-node@v4 + node-version 22`, workflow.includes("actions/setup-node@v4") && workflow.includes('node-version: "22"'));
  check(`@supabase/supabase-js install`, workflow.includes("@supabase/supabase-js"));
  check(`run node scripts/scheduler_tick.mjs`, workflow.includes("node scripts/scheduler_tick.mjs"));
  for (const sec of [
    "NEXT_PUBLIC_SUPABASE_URL",
    "SUPABASE_SERVICE_ROLE_KEY",
    "GROUPWARE_BASE_URL",
    "SCHEDULER_API_TOKEN",
  ]) {
    check(`env ${sec}: ${"$"}{{ secrets.${sec} }}`, workflow.includes(`${sec}: ${"$"}{{ secrets.${sec} }}`));
  }

  console.log(`\n=== ${okAll ? "ALL PASS" : "SOME FAILED"} ===\n`);
  process.exit(okAll ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
