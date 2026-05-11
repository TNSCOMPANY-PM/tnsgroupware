/**
 * v5-04 smoke — proxy.ts middleware 에 SCHEDULER_API_TOKEN bypass.
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
  console.log("\n=== v5-04 smoke ===\n");
  const fs = await import("node:fs/promises");
  const proxySrc = await fs.readFile("proxy.ts", "utf-8");

  // T1 — middleware 에 x-scheduler-token bypass
  console.log("[T1] proxy.ts middleware scheduler-token bypass");
  check(`v5-04 마커 (주석)`, proxySrc.includes("v5-04"));
  check(`x-scheduler-token 헤더 검사`, proxySrc.includes('request.headers.get("x-scheduler-token")'));
  check(`SCHEDULER_API_TOKEN env 비교`, proxySrc.includes("SCHEDULER_API_TOKEN"));
  check(
    `토큰 일치 시 return response (redirect 회피)`,
    /schedulerToken === expectedSchedulerToken[\s\S]{0,100}return response/.test(proxySrc),
  );
  // isPublicPath 통과 직후, masterCookie 로직 이전 위치 검증
  const publicIdx = proxySrc.indexOf("if (isPublicPath(pathname)) return response;");
  const bypassIdx = proxySrc.indexOf('request.headers.get("x-scheduler-token")');
  const masterIdx = proxySrc.indexOf('getMasterCookieName()');
  check(`PUBLIC_PATHS 통과 → scheduler bypass → master 순서`, publicIdx > 0 && bypassIdx > publicIdx && masterIdx > bypassIdx);

  // T2 — config matcher 무변경 (영향 범위 그대로)
  console.log("\n[T2] middleware matcher 무변경");
  check(`config matcher 보존`, proxySrc.includes('"/((?!_next/static|_next/image|favicon.ico'));

  console.log(`\n=== ${okAll ? "ALL PASS" : "SOME FAILED"} ===\n`);
  process.exit(okAll ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
