/* PR030 T7.2 — 오공김밥 D3 파일럿 (generate() 직접 호출). 운영 전 품질 검증용. */
import Module from "node:module";
const ModAny = Module as unknown as { _load: (req: string, ...rest: unknown[]) => unknown };
const origLoad = ModAny._load;
ModAny._load = function (req: string, ...rest: unknown[]) {
  if (req === "server-only") return {};
  return origLoad.call(this, req, ...rest);
};
import * as fs from "node:fs";
import * as path from "node:path";
const envPath = path.resolve(process.cwd(), ".env.local");
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const m = line.match(/^([A-Z0-9_]+)=([\s\S]*)$/); if (!m) continue;
    let v = m[2];
    if (v.startsWith("'") && v.endsWith("'")) v = v.slice(1,-1);
    if (v.startsWith('"') && v.endsWith('"')) v = v.slice(1,-1);
    if (!process.env[m[1]]) process.env[m[1]] = v;
  }
}

async function main() {
  const { generate } = await import("../lib/geo");
  const input = {
    depth: "D3" as const,
    brandId: "82c7ffc9-ed53-44bf-859d-a9a72b147b20",
    brand: "오공김밥",
    tiers: ["A","B","C"] as const,
  };
  console.log("[pilot] start D3 오공김밥");
  const t0 = Date.now();
  try {
    const out: any = await generate(input as any);
    console.log("[pilot] done in " + (Date.now()-t0) + "ms");
    const outPath = path.resolve(process.cwd(), "pilot_result.json");
    fs.writeFileSync(outPath, JSON.stringify(out, null, 2), "utf8");
    console.log("[pilot] saved full payload:", outPath);
    const p = out.payload;
    console.log("[pilot] kind:", p?.kind);
    console.log("[pilot] title:", p?.meta?.title);
    console.log("[pilot] sections:", p?.sections?.length, "FAQ:", p?.faq25?.length);
    const chars = (p?.sections ?? []).reduce((s:number,x:any)=>s+(x.body?.length??0),0);
    console.log("[pilot] body chars:", chars);
    console.log("[pilot] lint:", JSON.stringify(out.lint ?? null));
    console.log("[pilot] cc.unmatched:", JSON.stringify(out.crosscheck?.unmatched ?? null));
    const mdPath = path.resolve(process.cwd(), "pilot_result.md");
    const md = (p?.sections ?? []).map((s:any)=>`## ${s.heading}\n\n${s.body}`).join("\n\n") +
      "\n\n## Closure (headline only; html 은 DB meta.closure_html 에 저장)\n\n" + (p?.closure?.headline ?? "") +
      "\n\n## FAQ\n\n" + (p?.faq25 ?? []).map((f:any)=>`**Q: ${f.q}**\n\nA: ${f.a}`).join("\n\n");
    const tags = Array.isArray(p?.meta?.tags) ? p.meta.tags.join(", ") : "(미지정)";
    fs.writeFileSync(mdPath, `# ${p?.meta?.title ?? "오공김밥 D3"}\n\n**tags:** ${tags}\n\n${md}\n`, "utf8");
    console.log("[pilot] saved markdown:", mdPath);
  } catch (e: any) {
    console.error("[pilot] FAIL", e?.code ?? "", e?.message ?? e);
    if (e?.stats) console.error("[pilot] stats:", e.stats);
    process.exit(1);
  }
}
main().catch(e=>{console.error(e); process.exit(1);});
