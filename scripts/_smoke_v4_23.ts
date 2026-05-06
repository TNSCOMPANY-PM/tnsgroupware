/**
 * v4-23 smoke — photorealism prompt 강화 + post 페이지 썸네일 표시.
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
  console.log("\n=== v4-23 smoke ===\n");

  const fs = await import("node:fs/promises");

  // T1 — build_image_prompt photorealism 강화
  console.log("[T1] buildIndustryImagePrompt — photorealism 강화");
  const { buildIndustryImagePrompt } = await import("../lib/geo/v4/build_image_prompt");
  const p = buildIndustryImagePrompt({ industry: "치킨" });
  check(`Hyperrealistic 키워드`, p.includes("Hyperrealistic"));
  check(`DSLR + 렌즈 spec`, p.includes("DSLR") && p.includes("Canon EOS R5") && p.includes("50mm f/2.8"));
  check(`shallow depth of field`, p.includes("shallow depth of field"));
  check(`8K resolution`, p.includes("8K resolution"));
  check(`steam / condensation / oil sheen`, p.includes("steam") && p.includes("condensation") && p.includes("oil sheen"));
  check(`Korean restaurant interior`, p.includes("Korean restaurant interior"));
  check(`★ "not illustration / not 3D render" — 실사 강제`, p.includes("not illustration") && p.includes("not 3D render"));
  check(`"not AI-generated look"`, p.includes("not AI-generated look"));
  check(`"no text or labels visible"`, p.includes("no text or labels visible"));
  // 이전 v4-22 prompt 의 비실사 키워드 제거 검증
  check(`이전 약한 prompt "Top-down food photography of" 유지`, p.includes("top-down food photography"));

  // 분식, 한식 도 동일 photorealism 적용
  const p2 = buildIndustryImagePrompt({ industry: "분식" });
  check(`분식 photorealism`, p2.includes("Hyperrealistic") && p2.includes("not illustration"));
  const p3 = buildIndustryImagePrompt({ industry: "한식" });
  check(`한식 photorealism`, p3.includes("Hyperrealistic") && p3.includes("not illustration"));

  // T2 + T4 — post 페이지 썸네일 표시 + fallback
  console.log("\n[T2+T4] post 페이지 — 썸네일 표시 + frontmatter image fallback");
  const postSrc = await fs.readFile("app/(groupware)/content/posts/[id]/page.tsx", "utf-8");
  check(`thumbnail_url SELECT 추가`, postSrc.includes(", thumbnail_url,"));
  check(`thumbnail_url type 정의`, postSrc.includes("thumbnail_url: string | null"));
  check(`extractImageFromFrontmatter 헬퍼`, postSrc.includes("function extractImageFromFrontmatter"));
  check(`imageUrl fallback (thumbnail_url ?? frontmatter)`, postSrc.includes("draft.thumbnail_url ?? extractImageFromFrontmatter"));
  check(`<img> 본문 위 표시`, postSrc.includes("imageUrl && ("));
  check(`alt = title fallback`, postSrc.includes('alt={draft.title ?? "industry thumbnail"}'));
  check(`max-w-2xl rounded-lg`, postSrc.includes("max-w-2xl") && postSrc.includes("rounded-lg"));
  check(`loading="lazy"`, postSrc.includes('loading="lazy"'));

  console.log(`\n=== ${okAll ? "ALL PASS" : "SOME FAILED"} ===\n`);
  process.exit(okAll ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
