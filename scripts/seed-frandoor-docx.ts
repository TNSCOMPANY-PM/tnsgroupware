/**
 * PR053 — geo_brands.fact_data 의 __comparison_tables__ / __data_tables__ entry 갱신.
 * docx 파일을 mammoth 로 풀-파싱 후 fact_data 배열에 삽입.
 *
 * 사용법:
 *   npx tsx scripts/seed-frandoor-docx.ts --brand=오공김밥
 *   npx tsx scripts/seed-frandoor-docx.ts --brand-id=82c7ffc9-...
 *   npx tsx scripts/seed-frandoor-docx.ts --all   (fact_file_url 가용한 전 브랜드)
 */

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
    const m = line.match(/^([A-Z0-9_]+)=([\s\S]*)$/);
    if (!m) continue;
    let v = m[2];
    if (v.startsWith("'") && v.endsWith("'")) v = v.slice(1, -1);
    if (v.startsWith('"') && v.endsWith('"')) v = v.slice(1, -1);
    if (!process.env[m[1]]) process.env[m[1]] = v;
  }
}

type Args = {
  brand?: string;
  brandId?: string;
  all?: boolean;
  file?: string;
  /** PR058 — 휴리스틱 매핑 실패 셀에 LLM fallback 적용. */
  llmClassify?: boolean;
};

function parseArgs(): Args {
  const a: Args = {};
  for (const arg of process.argv.slice(2)) {
    if (arg === "--all") a.all = true;
    else if (arg === "--llm-classify") a.llmClassify = true;
    else if (arg.startsWith("--brand=")) a.brand = arg.slice("--brand=".length);
    else if (arg.startsWith("--brand-id=")) a.brandId = arg.slice("--brand-id=".length);
    else if (arg.startsWith("--file=")) a.file = arg.slice("--file=".length);
  }
  return a;
}

async function downloadDocx(url: string): Promise<Buffer> {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`docx fetch ${r.status} ${url}`);
  const ab = await r.arrayBuffer();
  return Buffer.from(ab);
}

function extractFileUrl(raw: unknown): string | null {
  if (typeof raw === "string") {
    if (raw.startsWith("http")) return raw;
    try {
      const arr = JSON.parse(raw);
      if (Array.isArray(arr) && arr[0]?.url) return String(arr[0].url);
    } catch {
      return null;
    }
  }
  return null;
}

async function processBrand(opts: {
  id: string;
  name: string;
  factData: Array<Record<string, unknown>>;
  fileBuffer: Buffer;
  llmClassify?: boolean;
}) {
  const { parseDocxFull } = await import("../lib/geo/prefetch/docxParser");
  const parsed = await parseDocxFull(opts.fileBuffer);

  // PR058 — 휴리스틱 매핑 실패 셀에 LLM fallback 적용 (옵션).
  const unmappedMetrics: Array<{
    cell_text: string;
    headers: string[];
    section: string;
    reason: string;
  }> = [];
  let llmCalls = 0;
  let llmHits = 0;
  if (opts.llmClassify) {
    const { llmClassifyMetric } = await import("../lib/geo/prefetch/llmMetricClassifier");
    for (const tbl of parsed.comparison_tables) {
      for (const row of tbl.rows) {
        if (row.metric_id != null) continue;
        if (!row.metric || !row.metric.trim()) continue;
        llmCalls++;
        const r = await llmClassifyMetric({
          cell_text: row.metric,
          context_headers: tbl.headers,
          context_section: tbl.section,
          sample_value: row.official_value ?? null,
        });
        if (r.metric_id) {
          row.metric_id = r.metric_id;
          row.confidence = r.confidence === "high" ? "low" : "low"; // LLM = low confidence (휴리스틱 high/medium 보다 약함)
          llmHits++;
        } else {
          unmappedMetrics.push({
            cell_text: row.metric,
            headers: tbl.headers,
            section: tbl.section,
            reason: r.reason ?? "LLM skip",
          });
        }
      }
    }
  } else {
    // LLM 비활성 — 휴리스틱 unmapped 셀을 unmappedMetrics 에 그대로 보존.
    for (const tbl of parsed.comparison_tables) {
      for (const row of tbl.rows) {
        if (row.metric_id != null) continue;
        if (!row.metric || !row.metric.trim()) continue;
        unmappedMetrics.push({
          cell_text: row.metric,
          headers: tbl.headers,
          section: tbl.section,
          reason: "휴리스틱 미매칭 (LLM 비활성)",
        });
      }
    }
  }

  const compStr = JSON.stringify(parsed.comparison_tables);
  const dataStr = JSON.stringify(parsed.data_tables);
  const unmappedStr = JSON.stringify(parsed.unmapped_tables);
  const suspectStr = JSON.stringify(parsed.suspect_tables);
  const unmappedMetricsStr = JSON.stringify(unmappedMetrics);

  // factData 안 entry 교체 또는 추가.
  const fd = opts.factData.filter(
    (x) =>
      x?.label !== "__comparison_tables__" &&
      x?.label !== "__data_tables__" &&
      x?.label !== "__unmapped_tables__" &&
      x?.label !== "__suspect_tables__" &&
      x?.label !== "__unmapped_metrics__",
  );
  fd.push({ label: "__comparison_tables__", keyword: compStr });
  fd.push({ label: "__data_tables__", keyword: dataStr });
  fd.push({ label: "__unmapped_tables__", keyword: unmappedStr });
  fd.push({ label: "__suspect_tables__", keyword: suspectStr });
  fd.push({ label: "__unmapped_metrics__", keyword: unmappedMetricsStr });

  return {
    fact_data: fd,
    sections: parsed.sections.length,
    comparison: parsed.comparison_tables.length,
    data: parsed.data_tables.length,
    unmapped: parsed.unmapped_tables.length,
    suspect: parsed.suspect_tables.length,
    unmapped_metrics: unmappedMetrics.length,
    llm_calls: llmCalls,
    llm_hits: llmHits,
  };
}

async function main() {
  const args = parseArgs();
  const { createAdminClient } = await import("../utils/supabase/admin");
  const sb = createAdminClient();

  const targets: Array<{ id: string; name: string }> = [];
  if (args.brandId) {
    const { data } = await sb.from("geo_brands").select("id,name").eq("id", args.brandId).maybeSingle();
    if (data) targets.push({ id: data.id, name: data.name });
  } else if (args.brand) {
    const { data } = await sb.from("geo_brands").select("id,name").eq("name", args.brand).maybeSingle();
    if (data) targets.push({ id: data.id, name: data.name });
  } else if (args.all) {
    const { data } = await sb
      .from("geo_brands")
      .select("id,name,fact_file_url")
      .not("fact_file_url", "is", null);
    if (data) {
      for (const r of data) targets.push({ id: r.id, name: r.name });
    }
  } else {
    console.error("Usage: --brand=<name> | --brand-id=<uuid> | --all | --file=<path> with --brand-id");
    process.exit(1);
  }

  for (const t of targets) {
    const { data } = await sb
      .from("geo_brands")
      .select("id,name,fact_data,fact_file_url")
      .eq("id", t.id)
      .maybeSingle();
    if (!data) {
      console.warn(`[skip] ${t.name}: not found`);
      continue;
    }
    let buffer: Buffer;
    if (args.file) {
      buffer = fs.readFileSync(path.resolve(process.cwd(), args.file));
    } else {
      const url = extractFileUrl(data.fact_file_url);
      if (!url) {
        console.warn(`[skip] ${t.name}: fact_file_url 없음`);
        continue;
      }
      buffer = await downloadDocx(url);
    }
    const factData = Array.isArray(data.fact_data)
      ? (data.fact_data as Array<Record<string, unknown>>)
      : [];
    try {
      const r = await processBrand({
        id: t.id,
        name: t.name,
        factData,
        fileBuffer: buffer,
        llmClassify: args.llmClassify,
      });
      const { error } = await sb
        .from("geo_brands")
        .update({ fact_data: r.fact_data })
        .eq("id", t.id);
      if (error) {
        console.error(`[fail] ${t.name}: update`, error.message);
      } else {
        const llmInfo = args.llmClassify ? ` llm_calls=${r.llm_calls} hits=${r.llm_hits}` : "";
        console.log(
          `[ok] ${t.name} — sections=${r.sections} comparison=${r.comparison} data=${r.data} unmapped=${r.unmapped} suspect=${r.suspect} unmapped_metrics=${r.unmapped_metrics}${llmInfo}`,
        );
      }
    } catch (e) {
      console.error(`[fail] ${t.name}:`, e instanceof Error ? e.message : e);
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
