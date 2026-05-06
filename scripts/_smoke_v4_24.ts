/**
 * v4-24 smoke — 이미지 재생성 버튼 (post detail) + cache busting.
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
  console.log("\n=== v4-24 smoke ===\n");

  const fs = await import("node:fs/promises");
  const pipelineSrc = await fs.readFile("lib/geo/v4/pipeline.ts", "utf-8");

  // T1 — runStep4ThumbnailAOnly stage check 완화
  console.log("[T1] Step 4 stage check 완화 (a_only_written + a_only_thumbnail_done)");
  check(
    `STAGES_ALLOWED_FOR_THUMBNAIL set`,
    pipelineSrc.includes("STAGES_ALLOWED_FOR_THUMBNAIL"),
  );
  check(
    `'a_only_thumbnail_done' 도 통과`,
    /STAGES_ALLOWED_FOR_THUMBNAIL[\s\S]*a_only_thumbnail_done/.test(pipelineSrc),
  );
  check(
    `이전 단일 stage 검증 제거 (\"draft.stage !== 'a_only_written'\")`,
    !pipelineSrc.includes('draft.stage !== "a_only_written"'),
  );
  check(
    `InvalidStageError expected 라벨 "a_only_written | a_only_thumbnail_done"`,
    pipelineSrc.includes("a_only_written | a_only_thumbnail_done"),
  );
  check(`v4-24 마커`, pipelineSrc.includes("v4-24"));

  // T2 — cache busting (?v=<ts>)
  console.log("\n[T2] cache busting — thumbnail_url ?v=<ts>");
  check(`cacheBustedUrl 변수`, pipelineSrc.includes("cacheBustedUrl"));
  check(
    `cacheBustedUrl = ${"`"}${"$"}{url}?v=${"$"}{Date.now()}${"`"}`,
    pipelineSrc.includes("`${url}?v=${Date.now()}`"),
  );
  check(
    `DB UPDATE thumbnail_url = cacheBustedUrl`,
    pipelineSrc.includes("thumbnail_url: cacheBustedUrl"),
  );
  check(
    `injectImageIntoFrontmatter(content, cacheBustedUrl)`,
    pipelineSrc.includes("injectImageIntoFrontmatter(draft.content, cacheBustedUrl)"),
  );

  // T3 — ThumbnailRegenerateButton client component
  console.log("\n[T3] ThumbnailRegenerateButton client component");
  const btnSrc = await fs
    .readFile("app/(groupware)/content/posts/[id]/ThumbnailRegenerateButton.tsx", "utf-8")
    .catch(() => "");
  check(`파일 존재`, btnSrc.length > 0);
  check(`"use client" directive`, btnSrc.startsWith('"use client"'));
  check(`useState busy`, btnSrc.includes("useState"));
  check(`useRouter`, btnSrc.includes("useRouter"));
  check(`POST /api/geo/a-only/thumbnail/${"$"}{draftId}`, btnSrc.includes("/api/geo/a-only/thumbnail/${draftId}"));
  check(`router.refresh()`, btnSrc.includes("router.refresh()"));
  check(`confirm dialog`, btnSrc.includes("confirm("));
  check(`hasExisting prop`, btnSrc.includes("hasExisting"));
  check(`label "🔄 이미지 재생성" + "🖼️ 이미지 생성"`, btnSrc.includes("이미지 재생성") && btnSrc.includes("이미지 생성"));
  check(`disabled when busy`, btnSrc.includes("disabled={busy}"));
  check(`alert on failure`, btnSrc.includes("alert("));

  // T4 — post detail page integration
  console.log("\n[T4] post detail page — 버튼 + gen_mode/stage 조건");
  const pageSrc = await fs.readFile("app/(groupware)/content/posts/[id]/page.tsx", "utf-8");
  check(`ThumbnailRegenerateButton import`, pageSrc.includes('import ThumbnailRegenerateButton from "./ThumbnailRegenerateButton"'));
  check(`gen_mode + stage SELECT`, pageSrc.includes("gen_mode, stage"));
  check(`DraftRow.gen_mode 정의`, pageSrc.includes("gen_mode: string | null"));
  check(`DraftRow.stage 정의`, pageSrc.includes("stage: string | null"));
  check(`canRegenThumbnail 조건 — gen_mode='a_only'`, pageSrc.includes('draft.gen_mode === "a_only"'));
  check(
    `canRegenThumbnail 조건 — stage in (a_only_written | a_only_thumbnail_done)`,
    pageSrc.includes('draft.stage === "a_only_written"') &&
      pageSrc.includes('draft.stage === "a_only_thumbnail_done"'),
  );
  check(
    `이미지 있을 때 hasExisting=true 버튼`,
    pageSrc.includes("hasExisting={true}"),
  );
  check(
    `이미지 없을 때 hasExisting=false 버튼 (생성)`,
    pageSrc.includes("hasExisting={false}"),
  );

  console.log(`\n=== ${okAll ? "ALL PASS" : "SOME FAILED"} ===\n`);
  process.exit(okAll ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
