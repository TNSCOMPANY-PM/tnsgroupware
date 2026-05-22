/**
 * v5-13 smoke — Anthropic transient retry + scheduler transient policy.
 *
 * 검증:
 *  · lib/geo/v4/claude.ts: withTransientRetry 헬퍼 + 3 호출 함수 감싸기
 *  · API endpoint maxDuration 60 → 90 (Vercel Pro)
 *  · scheduler_tick.mjs: isTransientMsg + retry_count 동결 + 1h hard cap
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
  console.log("\n=== v5-13 smoke ===\n");
  const fs = await import("node:fs/promises");

  // T1 — lib/geo/v4/claude.ts transient retry
  console.log("[T1] lib/geo/v4/claude.ts — withTransientRetry");
  const claudeSrc = await fs.readFile("lib/geo/v4/claude.ts", "utf-8");
  check(`APIError import`, /import Anthropic,\s*\{\s*APIError\s*\}\s*from "@anthropic-ai\/sdk"/.test(claudeSrc));
  check(`TRANSIENT_HTTP_STATUSES set`, claudeSrc.includes("TRANSIENT_HTTP_STATUSES"));
  check(`backoff array 정의`, /TRANSIENT_BACKOFF_MS\s*=\s*\[/.test(claudeSrc));
  check(`isTransientError 함수`, /function isTransientError/.test(claudeSrc));
  check(`overloaded_error 패턴`, claudeSrc.includes("overloaded_error"));
  check(`withTransientRetry 함수`, /async function withTransientRetry/.test(claudeSrc));
  check(`callSonnet — withTransientRetry 감쌈`, /withTransientRetry\("callSonnet"/.test(claudeSrc));
  check(`callLLM1 — withTransientRetry 감쌈`, /withTransientRetry\("callLLM1"/.test(claudeSrc));
  check(`callHaiku — withTransientRetry 감쌈`, /withTransientRetry\("callHaiku"/.test(claudeSrc));

  // T2 — LLM endpoint maxDuration 90
  console.log("\n[T2] API endpoint maxDuration 60 → 90");
  const endpoints = [
    "app/api/geo/a-only/analyze/route.ts",
    "app/api/geo/a-only/structure/[draft_id]/route.ts",
    "app/api/geo/a-only/write/[draft_id]/route.ts",
    "app/api/geo/a-only/thumbnail/[draft_id]/route.ts",
    "app/api/geo/facts-a/route.ts",
    "app/api/geo/facts-c/[draft_id]/route.ts",
    "app/api/geo/write/[draft_id]/route.ts",
  ];
  for (const p of endpoints) {
    const src = await fs.readFile(p, "utf-8");
    check(`${p} — maxDuration 90`, /export const maxDuration = 90/.test(src));
  }

  // T3 — scheduler_tick.mjs transient policy
  console.log("\n[T3] scripts/scheduler_tick.mjs — transient policy");
  const tickSrc = await fs.readFile("scripts/scheduler_tick.mjs", "utf-8");
  check(`TRANSIENT_RX 정규식 정의`, tickSrc.includes("TRANSIENT_RX"));
  check(`overloaded_error 매칭`, tickSrc.includes("overloaded_error"));
  check(`529 매칭`, /\b529\b/.test(tickSrc));
  check(`TRANSIENT_HARD_CAP_MS (1h)`, /TRANSIENT_HARD_CAP_MS\s*=\s*60\s*\*\s*60\s*\*\s*1000/.test(tickSrc));
  check(`isTransientMsg 함수`, /function isTransientMsg/.test(tickSrc));
  check(`stage1 transient 분기`, /\[stage1 \$\{row\.id\}\] generation FAIL \(transient=\$\{transient\}/.test(tickSrc));
  check(`stage2 transient 분기`, /\[stage2 \$\{row\.id\}\] publish FAIL \(transient=\$\{transient\}/.test(tickSrc));
  check(`exceededTransientCap → failed`, tickSrc.includes("exceededTransientCap"));
  check(`transient 면 retry_count 동결`, tickSrc.includes("transient && !exceededTransientCap ? prevRetryCount"));

  console.log(`\n=== ${okAll ? "ALL PASS" : "SOME FAILED"} ===\n`);
  process.exit(okAll ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
