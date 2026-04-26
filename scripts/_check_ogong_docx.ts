/* PR043 T5 — 오공김밥 fact_data __official_data__ 검증 */
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

async function main() {
  const { fetchFrandoorDocx, extractHomepageFacts } = await import("../lib/geo/prefetch/frandoorDocx");
  const d = await fetchFrandoorDocx("82c7ffc9-ed53-44bf-859d-a9a72b147b20");
  console.log("brand:", d?.brand_name);
  console.log("official_data:", d?.official_data);
  console.log("raw_chunks:", d?.raw_text_chunks?.length);
  console.log("file_url:", d?.file_url);
  if (d?.raw_text_chunks) {
    const hp = extractHomepageFacts(d.raw_text_chunks);
    console.log("homepage_extracted:", hp);
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
