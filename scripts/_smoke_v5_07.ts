/**
 * v5-07 smoke — 예약 시각 수정 (PATCH reschedule action).
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
  console.log("\n=== v5-07 smoke ===\n");
  const fs = await import("node:fs/promises");

  // T1 — PATCH reschedule action route
  console.log("[T1] PATCH /api/geo/scheduler/schedules/[id] — reschedule action");
  const routeSrc = await fs.readFile("app/api/geo/scheduler/schedules/[id]/route.ts", "utf-8");
  check(`ScheduleAction 타입 reschedule 포함`, /type ScheduleAction[\s\S]{0,100}"reschedule"/.test(routeSrc));
  check(`action 검증 reschedule`, routeSrc.includes('action !== "reschedule"'));
  check(`parseKstScheduledAt 헬퍼`, routeSrc.includes("function parseKstScheduledAt"));
  check(`+09:00 KST 부착`, routeSrc.includes("+09:00"));
  check(`published 거부 (ALREADY_PUBLISHED)`, routeSrc.includes('"ALREADY_PUBLISHED"'));
  check(`reschedule 분기 처리`, /action === "reschedule"|else \{[\s\S]{0,80}reschedule/.test(routeSrc) || routeSrc.includes("updatePayload.scheduled_at = parsed.toISOString()"));
  check(`scheduled_at 필수 검증`, routeSrc.includes("scheduled_at 필수"));

  // T2 — SchedulerList 시각 수정 버튼
  console.log("\n[T2] SchedulerList — 시각 수정 버튼");
  const listSrc = await fs.readFile("app/(groupware)/content/scheduler/SchedulerList.tsx", "utf-8");
  check(`callReschedule 함수`, listSrc.includes("const callReschedule"));
  check(`window.prompt KST 입력`, listSrc.includes('window.prompt("새 예약 시각'));
  check(`datetime-local 정규식 검증`, listSrc.includes("^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}$"));
  check(`PATCH body action="reschedule" + scheduled_at`, /action:\s*"reschedule"[\s\S]{0,80}scheduled_at/.test(listSrc));
  check(`prefill — Asia/Seoul KST 변환`, listSrc.includes('timeZone: "Asia/Seoul"'));
  check(`시각 수정 버튼 라벨`, listSrc.includes("시각 수정"));
  check(`published 제외 (status !== "published")`, listSrc.includes('r.status !== "published"'));
  check(`낙관적 UI rows update`, /setRows[\s\S]{0,80}data as ScheduleRow/.test(listSrc));

  // T3 — 회귀 — 기존 action 유지
  console.log("\n[T3] 회귀 — 기존 cancel/retry/run_now/delete 유지");
  check(`cancel action 유지`, routeSrc.includes('action === "cancel"'));
  check(`retry action 유지`, routeSrc.includes('action === "retry"'));
  check(`run_now action 유지`, routeSrc.includes('action === "run_now"'));
  check(`DELETE handler 유지`, routeSrc.includes("export async function DELETE"));

  console.log(`\n=== ${okAll ? "ALL PASS" : "SOME FAILED"} ===\n`);
  process.exit(okAll ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
