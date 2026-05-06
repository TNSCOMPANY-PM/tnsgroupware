/**
 * v4-25 smoke — slug 영문 매핑 + frontmatter image: → thumbnail: 키.
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

import type { IndustryAnalysisFacts } from "../lib/geo/v4/types";

function emptyFacts(industry: string): IndustryAnalysisFacts {
  return {
    industry,
    n_brands: 100,
    topic: "test",
    key_angle: "k",
    analysis_axes: [],
    selected_metrics: [],
    ranking_metric: "avg_sales_2024_total",
    distributions: {},
    ranking: { metric_id: "avg_sales_2024_total", label: "x", unit: "만원", top10: [], bottom10: [] },
    outliers: [],
  };
}

async function main() {
  console.log("\n=== v4-25 smoke ===\n");

  const fs = await import("node:fs/promises");

  // T1 — industry slug 영문 매핑
  console.log("[T1] industry slug 영문 매핑 (한글 → 영문)");
  const fm = await import("../lib/geo/v4/build_industry_frontmatter");
  const cases: Array<[string, string]> = [
    ["한식", "korean"],
    ["분식", "korean-snack"],
    ["중식", "chinese"],
    ["일식", "japanese"],
    ["서양식", "western"],
    ["기타외국식", "international"],
    ["패스트푸드", "fastfood"],
    ["치킨", "chicken"],
    ["피자", "pizza"],
    ["제과제빵", "bakery"],
    ["아이스크림빙수", "icecream-bingsu"],
    ["커피", "coffee"],
    ["음료(커피외)", "beverage"],
    ["주점", "pub"],
    ["기타외식", "other-restaurant"],
  ];

  for (const [industry, expectedSeg] of cases) {
    const out = fm.buildIndustryFrontmatter({
      topic: "test",
      industry,
      draft_id: "abc12345-def0-...",
      today: "2026-05-07",
      facts: emptyFacts(industry),
    });
    // slug = "{en}-industry-{draft_id_8}-{year}"
    const expectedSlug = `${expectedSeg}-industry-abc12345-2026`;
    check(
      `industry "${industry}" → slug "${expectedSlug}"`,
      out.slug === expectedSlug,
      out.slug,
    );
  }

  // 한글 industry slug 안 들어감 검증
  for (const [industry, _] of cases) {
    const out = fm.buildIndustryFrontmatter({
      topic: "test",
      industry,
      draft_id: "xyz",
      today: "2026-05-07",
      facts: emptyFacts(industry),
    });
    check(
      `slug 한글 0 — "${industry}"`,
      !/[가-힣]/.test(out.slug),
      out.slug,
    );
  }

  // 미등록 industry → fallback "industry"
  const unknownOut = fm.buildIndustryFrontmatter({
    topic: "t",
    industry: "신생업종",
    draft_id: "qq",
    today: "2026-05-07",
    facts: emptyFacts("신생업종"),
  });
  check(`unknown industry → fallback "industry-industry"`, unknownOut.slug.startsWith("industry-industry-"));

  // T2 — Frontmatter type thumbnail?
  console.log("\n[T2] Frontmatter type thumbnail? + render");
  const fmSrc = await fs.readFile("lib/geo/v4/build_frontmatter.ts", "utf-8");
  check(`Frontmatter type — thumbnail?: string`, fmSrc.includes("thumbnail?: string"));
  check(`이전 image?: 제거`, !fmSrc.includes("image?: string"));

  const renderSrc = await fs.readFile("lib/geo/v4/render_frontmatter.ts", "utf-8");
  check(`render — fm.thumbnail emit`, renderSrc.includes("if (fm.thumbnail)"));
  check(`render — emit "thumbnail:"`, renderSrc.includes('lines.push(`thumbnail: "${'));
  check(`render — image: emit 제거`, !renderSrc.includes('lines.push(`image: "${'));

  // 실제 render 결과
  const { renderFrontmatterYaml } = await import("../lib/geo/v4/render_frontmatter");
  const yaml = renderFrontmatterYaml(
    {
      title: "T",
      description: "D",
      slug: "korean-snack-industry-abc-2026",
      category: "C",
      date: "2026-05-07",
      dateModified: "2026-05-07",
      tags: ["t"],
      thumbnail: "https://x.png?v=123",
    },
    [{ q: "Q", a: "A" }],
  );
  check(`yaml — thumbnail: emitted`, yaml.includes('thumbnail: "https://x.png?v=123"'));
  check(`yaml — image: 0건`, !yaml.includes("image:"));

  // T2b — injectThumbnailIntoFrontmatter
  console.log("\n[T2b] injectThumbnailIntoFrontmatter — 신규/갱신/legacy 마이그레이션");
  const pipeline = await import("../lib/geo/v4/pipeline");
  check(`injectThumbnailIntoFrontmatter export`, typeof pipeline.injectThumbnailIntoFrontmatter === "function");
  check(`injectImageIntoFrontmatter alias 유지 (legacy)`, typeof pipeline.injectImageIntoFrontmatter === "function");

  const sample = `---
title: "분식 분석"
tags: ["분식"]
faq:
  - q: "Q"
    a: "A"
---

본문`;
  const newUrl = "https://x.png?v=1";
  const r1 = pipeline.injectThumbnailIntoFrontmatter(sample, newUrl);
  check(`tags 다음 thumbnail: 추가`, /tags:.*\nthumbnail: "https/.test(r1));
  check(`갱신: thumbnail 유지`, r1.includes(`thumbnail: "${newUrl}"`));

  // 갱신 — 이미 thumbnail 있을 때
  const r2 = pipeline.injectThumbnailIntoFrontmatter(r1, "https://y.png?v=2");
  check(`thumbnail 갱신 (1회만)`, (r2.match(/thumbnail:/g) ?? []).length === 1);
  check(`thumbnail 갱신 url`, r2.includes('thumbnail: "https://y.png?v=2"'));

  // legacy image: 마이그레이션
  const legacy = `---
title: "x"
tags: ["t"]
image: "https://old.png"
faq:
  - q: "Q"
    a: "A"
---

본문`;
  const r3 = pipeline.injectThumbnailIntoFrontmatter(legacy, "https://new.png?v=3");
  check(`legacy image: → thumbnail: 마이그레이션`, !r3.includes("image:") && r3.includes('thumbnail: "https://new.png?v=3"'));

  // T3 — post detail page extractThumbnail
  console.log("\n[T3] post detail page — extractThumbnailFromFrontmatter (legacy fallback)");
  const pageSrc = await fs.readFile("app/(groupware)/content/posts/[id]/page.tsx", "utf-8");
  check(`extractThumbnailFromFrontmatter 헬퍼`, pageSrc.includes("function extractThumbnailFromFrontmatter"));
  check(`thumbnail: 우선`, pageSrc.includes("thumbnail:\\s*\"?") || pageSrc.includes("/thumbnail:"));
  check(`legacy image: fallback`, pageSrc.includes("/image:\\s*\"?") || pageSrc.includes("image:"));
  check(`이전 extractImageFromFrontmatter 제거`, !pageSrc.includes("function extractImageFromFrontmatter"));

  console.log(`\n=== ${okAll ? "ALL PASS" : "SOME FAILED"} ===\n`);
  process.exit(okAll ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
