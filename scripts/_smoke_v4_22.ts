/**
 * v4-22 smoke — A only Step 4 신규 (gpt-image-1 썸네일).
 * OpenAI / Supabase Storage 호출 X — surface + image prompt + injectImageIntoFrontmatter 단위 테스트.
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
  console.log("\n=== v4-22 smoke ===\n");

  const fs = await import("node:fs/promises");

  // T1 — migration 파일 존재
  console.log("[T1] DB migration thumbnail_url + thumbnail_prompt");
  const migration = await fs
    .readFile("supabase/migrations/20260512_v4_22_thumbnail.sql", "utf-8")
    .catch(() => "");
  check(`migration 파일 존재`, migration.length > 0);
  check(`thumbnail_url 컬럼 추가`, migration.includes("ADD COLUMN IF NOT EXISTS thumbnail_url"));
  check(
    `thumbnail_prompt 컬럼 추가`,
    migration.includes("ADD COLUMN IF NOT EXISTS thumbnail_prompt"),
  );
  check(`stage 'a_only_thumbnail_done' 추가`, migration.includes("'a_only_thumbnail_done'"));
  check(`Storage bucket "geo-thumbnails" 안내`, migration.includes("geo-thumbnails"));

  // T3 — build_image_prompt
  console.log("\n[T3] buildIndustryImagePrompt (15 industry)");
  const { buildIndustryImagePrompt, SUPPORTED_INDUSTRIES } = await import(
    "../lib/geo/v4/build_image_prompt"
  );
  check(`SUPPORTED_INDUSTRIES 15개`, SUPPORTED_INDUSTRIES.length === 15);
  for (const ind of ["한식", "분식", "중식", "치킨", "커피", "피자"]) {
    check(`SUPPORTED_INDUSTRIES — ${ind}`, SUPPORTED_INDUSTRIES.includes(ind));
  }
  // prompt 영어 + industry food hint 포함
  const p1 = buildIndustryImagePrompt({ industry: "분식" });
  // v4-23 supersede: "Hyperrealistic top-down food photography ..." (lowercase t).
  check(`분식 prompt 영어`, /top-down food photography/i.test(p1));
  check(`분식 prompt — tteokbokki / kimbap`, /tteokbokki|kimbap/.test(p1));
  check(`분식 prompt — no text or labels`, /no text or labels/.test(p1));

  const p2 = buildIndustryImagePrompt({ industry: "치킨" });
  check(`치킨 prompt — Korean fried chicken`, /Korean fried chicken/.test(p2));

  // 미등록 industry → fallback
  const p3 = buildIndustryImagePrompt({ industry: "신생업종" });
  check(`unknown industry → fallback prompt`, /신생업종/.test(p3) || /Korean.*cuisine/i.test(p3));

  // T4 — generate_thumbnail surface
  console.log("\n[T4] generate_thumbnail.ts surface");
  const genSrc = await fs.readFile("lib/geo/v4/generate_thumbnail.ts", "utf-8");
  check(`generateAndUploadThumbnail export`, genSrc.includes("export async function generateAndUploadThumbnail"));
  check(`OpenAI client (gpt-image-1)`, genSrc.includes('model: "gpt-image-1"'));
  check(`size 1024x1024`, genSrc.includes('size: "1024x1024"'));
  check(`Storage bucket geo-thumbnails`, genSrc.includes('STORAGE_BUCKET = "geo-thumbnails"'));
  check(`upsert: true`, genSrc.includes("upsert: true"));
  check(`b64_json 처리 분기`, genSrc.includes("item.b64_json"));
  check(`url 처리 분기 (DALL-E 3 fallback)`, genSrc.includes("item.url"));

  // T5 — pipeline runStep4ThumbnailAOnly + injectImageIntoFrontmatter
  console.log("\n[T5] pipeline runStep4ThumbnailAOnly + injectImageIntoFrontmatter");
  const pipelineSrc = await fs.readFile("lib/geo/v4/pipeline.ts", "utf-8");
  const pipeline = await import("../lib/geo/v4/pipeline");
  check(`runStep4ThumbnailAOnly export`, typeof pipeline.runStep4ThumbnailAOnly === "function");
  check(`injectImageIntoFrontmatter export`, typeof pipeline.injectImageIntoFrontmatter === "function");
  check(`v4-22 마커`, pipelineSrc.includes("v4-22"));
  check(`stage transition a_only_written → a_only_thumbnail_done`, pipelineSrc.includes('stage: "a_only_thumbnail_done"'));

  // injectImageIntoFrontmatter 단위 테스트
  const sampleContent = `---
title: "분식 평균 매출 분포 분석"
description: "분식 380개 브랜드 분포 분석"
slug: "industry-분식-2026"
category: "업종 분석"
date: "2026-05-12"
dateModified: "2026-05-12"
tags: ["분식", "외식", "업종 분석"]
faq:
  - q: "Q1"
    a: "A1"
---

본문 시작...`;
  // v4-25 supersede: image: → thumbnail: (frandoor 표준).
  const url = "https://felaezeqnoskkowoqsja.supabase.co/storage/v1/object/public/geo-thumbnails/abc123.png";
  const injected = pipeline.injectThumbnailIntoFrontmatter(sampleContent, url);
  check(`tags 다음 thumbnail: 추가`, /tags:.*\nthumbnail: "https/.test(injected));
  check(`url 정확히 삽입`, injected.includes(`thumbnail: "${url}"`));
  check(`기존 frontmatter 보존`, injected.includes('title: "분식 평균 매출 분포 분석"'));
  check(`본문 보존`, injected.includes("본문 시작..."));

  // 이미 thumbnail 필드가 있을 때 — 갱신
  const withImage = injected;
  const newUrl = "https://newhost.example.com/new.png";
  const updated = pipeline.injectThumbnailIntoFrontmatter(withImage, newUrl);
  check(
    `이미 thumbnail 있으면 갱신 (1회만)`,
    (updated.match(/thumbnail:/g) ?? []).length === 1,
    `count=${(updated.match(/thumbnail:/g) ?? []).length}`,
  );
  check(`갱신된 url`, updated.includes(`thumbnail: "${newUrl}"`) && !updated.includes(`thumbnail: "${url}"`));

  // frontmatter 없는 content → 무변경
  const noFm = "본문만 있음";
  const noFmInjected = pipeline.injectThumbnailIntoFrontmatter(noFm, url);
  check(`frontmatter 없으면 무변경`, noFmInjected === noFm);

  // T6 — /api/geo/a-only/thumbnail endpoint 존재
  console.log("\n[T6] /api/geo/a-only/thumbnail/[draft_id] endpoint");
  const ep = await fs
    .readFile("app/api/geo/a-only/thumbnail/[draft_id]/route.ts", "utf-8")
    .catch(() => "");
  check(`endpoint 파일 존재`, ep.length > 0);
  check(`runStep4ThumbnailAOnly import`, ep.includes("runStep4ThumbnailAOnly"));
  check(`maxDuration = 60`, ep.includes("maxDuration = 60"));
  check(`POST handler`, ep.includes("export async function POST"));
  check(`InvalidStageError 처리`, ep.includes("InvalidStageError"));

  // T7 — editor page chain 4-step
  console.log("\n[T7] editor page — A only chain 4-step (phase a_only_thumbnail)");
  const editorSrc = await fs.readFile("app/(groupware)/content/editor/page.tsx", "utf-8");
  check(`phase "a_only_thumbnail"`, editorSrc.includes('"a_only_thumbnail"'));
  check(`/api/geo/a-only/thumbnail/${"$"}{draftId}`, editorSrc.includes("/api/geo/a-only/thumbnail/${draftId}"));
  check(`progress "4/4 썸네일 생성"`, editorSrc.includes("4/4 썸네일 생성"));
  check(`Step 4 try/catch — 실패 시 본문 보존`, editorSrc.includes("v4-22 썸네일 생성 실패"));
  check(`progress 1/4 ~ 3/4 라벨 갱신`, editorSrc.includes("1/4 분석 각도") && editorSrc.includes("3/4 본문 작성"));

  // T8 — Frontmatter thumbnail? + render (v4-25 supersede: image → thumbnail)
  console.log("\n[T8] Frontmatter thumbnail? field + YAML render");
  const fmSrc = await fs.readFile("lib/geo/v4/build_frontmatter.ts", "utf-8");
  check(`Frontmatter type — thumbnail?: string`, fmSrc.includes("thumbnail?: string"));

  const renderSrc = await fs.readFile("lib/geo/v4/render_frontmatter.ts", "utf-8");
  check(`renderFrontmatterYaml — thumbnail emit`, renderSrc.includes('lines.push(`thumbnail: "${'));

  // 실제 render 결과 검증
  const { renderFrontmatterYaml } = await import("../lib/geo/v4/render_frontmatter");
  const yaml = renderFrontmatterYaml(
    {
      title: "T",
      description: "D",
      slug: "s",
      category: "C",
      date: "2026-05-12",
      dateModified: "2026-05-12",
      tags: ["t"],
      thumbnail: "https://x.png",
    },
    [{ q: "Q", a: "A" }],
  );
  check(`yaml — thumbnail: emitted`, yaml.includes('thumbnail: "https://x.png"'));

  const yamlNoImg = renderFrontmatterYaml(
    {
      title: "T",
      description: "D",
      slug: "s",
      category: "C",
      date: "2026-05-12",
      dateModified: "2026-05-12",
      tags: ["t"],
    },
    [{ q: "Q", a: "A" }],
  );
  check(`yaml — thumbnail 없으면 emit X`, !yamlNoImg.includes("thumbnail:") && !yamlNoImg.includes("image:"));

  console.log(`\n=== ${okAll ? "ALL PASS" : "SOME FAILED"} ===\n`);
  process.exit(okAll ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
