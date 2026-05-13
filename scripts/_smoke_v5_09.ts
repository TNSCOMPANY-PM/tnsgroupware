/**
 * v5-09 smoke — scheduler_tick.mjs supabase-js 제거 (fetch only) + cron 매 5분.
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
  console.log("\n=== v5-09 smoke ===\n");
  const fs = await import("node:fs/promises");

  // T1 — scheduler_tick.mjs supabase-js 의존 제거
  console.log("[T1] scripts/scheduler_tick.mjs — fetch only");
  const tickScript = await fs.readFile("scripts/scheduler_tick.mjs", "utf-8");
  // import 문 자체 제거 (changelog 주석에 패키지 이름 언급은 OK).
  check(`@supabase/supabase-js import 문 제거`, !/^import[^\n]*@supabase\/supabase-js/m.test(tickScript));
  check(`createClient import 제거`, !tickScript.includes("createClient"));
  check(`v5-09 마커`, tickScript.includes("v5-09"));
  // fetch helpers
  check(`sbSelect 헬퍼`, tickScript.includes("async function sbSelect"));
  check(`sbUpdate 헬퍼 (conditional)`, tickScript.includes("async function sbUpdate"));
  check(`PostgREST REST API path /rest/v1/`, tickScript.includes("/rest/v1/"));
  check(`apikey + Bearer 헤더`, tickScript.includes("apikey:") && tickScript.includes("Bearer ${SUPABASE_SERVICE_ROLE_KEY}"));
  check(`prefer: return=representation (lock 검증용)`, tickScript.includes('prefer: "return=representation"'));
  // 흐름 보존
  check(`stage1Generation 보존`, tickScript.includes("async function stage1Generation"));
  check(`stage2Publish 보존`, tickScript.includes("async function stage2Publish"));
  // race condition lock — conditional update length === 0 체크
  check(`lock 실패 처리 (length === 0)`, tickScript.includes("locked.length === 0"));
  // retry 1회 정책 유지
  check(`stage1 retry > 1 → failed`, tickScript.includes('retryCount > 1 ? "failed" : "pending"'));
  check(`stage2 retry > 1 → failed`, tickScript.includes('retryCount > 1 ? "failed" : "ready"'));
  // v5-02-hf1 env 진단 보존
  check(`v5-02-hf1 env 진단 보존`, tickScript.includes("env 누락"));

  // T2 — workflow yml install step 제거 + cron */5
  console.log("\n[T2] workflow yml — install step 제거 + cron */5");
  const workflow = await fs.readFile(".github/workflows/scheduler-tick.yml", "utf-8");
  check(`cron "*/5 * * * *"`, workflow.includes('- cron: "*/5 * * * *"'));
  check(`이전 "0,30 * * * *" 제거`, !workflow.includes('- cron: "0,30 * * * *"'));
  check(`Install supabase-js step 제거`, !workflow.includes("Install supabase-js"));
  check(`npm install --no-save @supabase/supabase-js 제거`, !workflow.includes("@supabase/supabase-js"));
  check(`Run scheduler tick step 유지`, workflow.includes("Run scheduler tick"));
  check(`v5-09 마커`, workflow.includes("v5-09"));

  console.log(`\n=== ${okAll ? "ALL PASS" : "SOME FAILED"} ===\n`);
  process.exit(okAll ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
