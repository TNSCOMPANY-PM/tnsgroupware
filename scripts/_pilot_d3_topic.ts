/* PR035 T7/T8 — D3 토픽 분기 파일럿 + 회귀. */
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
    if (v.startsWith("'") && v.endsWith("'")) v = v.slice(1, -1);
    if (v.startsWith('"') && v.endsWith('"')) v = v.slice(1, -1);
    if (!process.env[m[1]]) process.env[m[1]] = v;
  }
}

async function runOne(label: string, input: unknown) {
  const { generate } = await import("../lib/geo");
  console.log(`\n========== [${label}] start ==========`);
  const t0 = Date.now();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const out: any = await generate(input as any);
  console.log(`[${label}] done in ${Date.now() - t0}ms`);
  const p = out.payload;
  const slug = label.replace(/[^a-z0-9_]/gi, "_").toLowerCase();
  fs.writeFileSync(
    path.resolve(process.cwd(), `pilot_topic_${slug}.json`),
    JSON.stringify(out, null, 2),
    "utf8",
  );
  console.log(`[${label}] title:`, p?.meta?.title);
  console.log(`[${label}] stance:`, p?.meta?.stance, "tier:", p?.meta?.tier);
  console.log(`[${label}] sections:`, p?.sections?.length, "FAQ:", p?.faq25?.length);
  const topicLogs = (out.logs ?? []).filter((l: string) => l.includes("[topic]"));
  console.log(`[${label}] topic logs:`, topicLogs);
  console.log(`[${label}] first H2:`, p?.sections?.[0]?.heading);
  console.log(`[${label}] FAQ Q1:`, p?.faq25?.[0]?.q);
  console.log(`[${label}] FAQ Q2:`, p?.faq25?.[1]?.q);
  const chars = (p?.sections ?? []).reduce(
    (s: number, x: { body?: string }) => s + (x.body?.length ?? 0),
    0,
  );
  console.log(`[${label}] body chars:`, chars);
  console.log(`[${label}] lint err:`, out.lint?.errors?.length, "unmatched:", out.crosscheck?.unmatched?.length);
  return out;
}

async function main() {
  const baseInput = {
    depth: "D3" as const,
    brandId: "82c7ffc9-ed53-44bf-859d-a9a72b147b20",
    brand: "오공김밥",
    tiers: ["A", "B", "C"] as const,
  };
  // T7 — topic present
  await runOne("T7_topic", {
    ...baseInput,
    topic: "오공김밥 vs 분식 프랜차이즈 평균 폐점률 비교 분석",
  });
  // T8 — regression (no topic)
  await runOne("T8_notopic", baseInput);
}
main().catch((e) => { console.error(e); process.exit(1); });
