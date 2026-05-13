/**
 * v5-06 smoke — cron 매 30분 + 발행 시점 frontmatter date 재작성.
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
  console.log("\n=== v5-06 smoke ===\n");
  const fs = await import("node:fs/promises");

  // T1 — cron 매 30분
  console.log("[T1] workflow cron \"0,30 * * * *\"");
  const workflow = await fs.readFile(".github/workflows/scheduler-tick.yml", "utf-8");
  check(`cron "0,30 * * * *"`, workflow.includes('- cron: "0,30 * * * *"'));
  check(`이전 "0 * * * *" 제거`, !workflow.includes('- cron: "0 * * * *"'));
  check(`v5-06 마커`, workflow.includes("v5-06"));

  // T2 — rewriteFrontmatterDate export + 동작
  console.log("\n[T2] rewriteFrontmatterDate helper");
  const { rewriteFrontmatterDate } = await import("../lib/geo/publish/githubFrandoor");
  check(`rewriteFrontmatterDate export`, typeof rewriteFrontmatterDate === "function");

  // case A: 기존 date / dateModified 모두 있음 → 두 값 모두 갱신 (1회씩)
  const before = `---
title: "분식 평균 매출 분포 분석"
slug: "korean-snack-industry-abc12345-2026"
date: "2026-05-07T14:00:00"
dateModified: "2026-05-07T14:00:00"
tags: ["분식"]
---

본문`;
  const after = rewriteFrontmatterDate(before);
  // 옛 값 제거
  check(`옛 date 값 제거`, !after.includes('"2026-05-07T14:00:00"'));
  // 새 값 패턴 (오늘 KST datetime — "YYYY-MM-DDTHH:MM:SS")
  const KST_PATTERN = /\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/;
  const dateMatches = after.match(/date:\s*"([^"]+)"/);
  const dmMatches = after.match(/dateModified:\s*"([^"]+)"/);
  check(`새 date 값 KST datetime 패턴`, !!dateMatches && KST_PATTERN.test(dateMatches[1]), dateMatches?.[1]);
  check(`새 dateModified 값 KST datetime 패턴`, !!dmMatches && KST_PATTERN.test(dmMatches[1]), dmMatches?.[1]);
  // date == dateModified (같은 시각에 재작성)
  check(`date == dateModified`, !!dateMatches && !!dmMatches && dateMatches[1] === dmMatches[1]);
  // 1회씩만 등장
  check(`date: 라인 1회만`, (after.match(/^date:/gm) ?? []).length === 1);
  check(`dateModified: 라인 1회만`, (after.match(/^dateModified:/gm) ?? []).length === 1);
  // 본문 보존
  check(`본문 보존`, after.includes("본문"));
  check(`title 보존`, after.includes('title: "분식 평균 매출 분포 분석"'));

  // case B: frontmatter 없음 → 무변경
  const noFm = "본문만 있음";
  check(`frontmatter 없으면 무변경`, rewriteFrontmatterDate(noFm) === noFm);

  // case C: date / dateModified 없음 → title 다음에 추가
  const noDate = `---
title: "test"
slug: "test-2026"
---

본문`;
  const afterC = rewriteFrontmatterDate(noDate);
  check(`date / dateModified 신규 추가`, /^date:\s*"/m.test(afterC) && /^dateModified:\s*"/m.test(afterC));
  check(`title 다음에 date 위치`, /title:[\s\S]*?\ndate:\s*"/.test(afterC));

  // T3 — publish-frandoor route 적용
  console.log("\n[T3] /api/geo/publish-frandoor — rewriteFrontmatterDate 적용");
  const routeSrc = await fs.readFile("app/api/geo/publish-frandoor/route.ts", "utf-8");
  check(`rewriteFrontmatterDate import`, routeSrc.includes("rewriteFrontmatterDate"));
  check(`commit 전 date 재작성`, routeSrc.includes("rewriteFrontmatterDate(content)"));
  check(`commit content = contentWithFreshDate`, /commitToFrandoor\(\{\s*slug,\s*content:\s*contentWithFreshDate/.test(routeSrc));
  check(`drafts content 도 sync update`, /content:\s*contentWithFreshDate,\s*published_url/.test(routeSrc));

  console.log(`\n=== ${okAll ? "ALL PASS" : "SOME FAILED"} ===\n`);
  process.exit(okAll ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
