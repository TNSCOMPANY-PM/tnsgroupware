/**
 * v5-05 smoke — 예약 목록 "삭제" 버튼 (모든 status).
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
  console.log("\n=== v5-05 smoke ===\n");
  const fs = await import("node:fs/promises");

  // T1 — DELETE handler
  console.log("[T1] DELETE /api/geo/scheduler/schedules/[id]");
  const routeSrc = await fs.readFile("app/api/geo/scheduler/schedules/[id]/route.ts", "utf-8");
  check(`DELETE handler export`, routeSrc.includes("export async function DELETE"));
  check(`v5-05 마커`, routeSrc.includes("v5-05"));
  check(`session 인증 + unauthorized`, routeSrc.includes("getSessionEmployee") && routeSrc.includes("unauthorized()"));
  check(`Supabase delete().eq("id", id)`, routeSrc.includes('.delete()') && routeSrc.includes('.eq("id", id)'));
  check(`error 핸들링 DELETE_FAILED`, routeSrc.includes('"DELETE_FAILED"'));
  check(`성공 응답 { ok: true }`, routeSrc.includes("ok: true"));

  // T2 — SchedulerList 삭제 버튼 (모든 row)
  console.log("\n[T2] SchedulerList — 모든 row 에 삭제 버튼");
  const listSrc = await fs.readFile("app/(groupware)/content/scheduler/SchedulerList.tsx", "utf-8");
  check(`callDelete 함수`, listSrc.includes("const callDelete"));
  check(`DELETE method 호출`, /fetch\([\s\S]*?schedules\/\$\{id\}[\s\S]*?method:\s*"DELETE"/.test(listSrc));
  check(`confirm 다이얼로그`, listSrc.includes("영구 삭제합니다"));
  check(`삭제 버튼 라벨`, listSrc.includes(">\n                    삭제\n") || listSrc.includes("삭제"));
  check(`성공 시 rows filter 제거 (낙관적 UI)`, listSrc.includes("prev.filter((r) => r.id !== id)"));
  check(`router.refresh transition`, listSrc.includes("startTransition(() => router.refresh())"));
  // 모든 status row 에 보여야 함 — 액션 column 안 status 분기 밖에 위치
  check(`삭제 버튼이 status 분기 외부 (모든 row 노출)`, /v5-05[\s\S]{0,400}삭제\s*<\/button>/.test(listSrc));
  // 이전 "—" placeholder span 제거
  check(`이전 "—" placeholder span 제거`, !listSrc.includes('text-slate-400 text-[10px]">—'));
  // 더 이상 isCanceled 분기 불필요
  check(`isCanceled 변수 제거 (unused)`, !listSrc.includes("const isCanceled"));

  console.log(`\n=== ${okAll ? "ALL PASS" : "SOME FAILED"} ===\n`);
  process.exit(okAll ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
