import "server-only";
import { runA, type RunAInput, type RunAResult } from "@/lib/generators/A/runA";
import { geoLint } from "@/utils/geo-lint";
import { numberCrossCheck } from "@/utils/number-crosscheck";
import { createDraftPR } from "@/utils/frandoor-pr";

export type GeneratorId = "A" | "B" | "C" | "D" | "E";

export interface PipelineResult {
  ok: boolean;
  generator: GeneratorId;
  input: RunAInput;
  logs: string[];
  gates: {
    generate: { ok: boolean; error?: string };
    lint: { ok: boolean; errors: number; warns: number; detail: string[] };
    crossCheck: { ok: boolean; unmatched: string[]; matched: number };
    pr: { ok: boolean; url?: string; dryRunLog?: string; error?: string };
  };
  sample?: { slug: string; md: string };
}

function slugOf(input: RunAInput): string {
  const ym = new Date().toISOString().slice(0, 7);
  const norm = (s: string) =>
    s.toLowerCase().replace(/[^a-z0-9가-힣]+/g, "-").replace(/^-|-$/g, "").slice(0, 50);
  return `${ym}-${norm(input.brand)}-${norm(input.category)}`;
}

export async function runWithGates(
  generator: GeneratorId,
  input: RunAInput,
): Promise<PipelineResult> {
  const logs: string[] = [];
  const result: PipelineResult = {
    ok: false,
    generator,
    input,
    logs,
    gates: {
      generate: { ok: false },
      lint: { ok: false, errors: 0, warns: 0, detail: [] },
      crossCheck: { ok: false, unmatched: [], matched: 0 },
      pr: { ok: false },
    },
  };

  if (generator !== "A") {
    result.gates.generate = { ok: false, error: `Generator ${generator} 미구현 (T3 스프린트에서 A만)` };
    return result;
  }

  let run: RunAResult;
  try {
    run = await runA(input);
    logs.push(...run.logs);
    result.gates.generate = { ok: true };
  } catch (e) {
    result.gates.generate = { ok: false, error: e instanceof Error ? e.message : String(e) };
    logs.push(`[pipeline:generate] 실패: ${result.gates.generate.error}`);
    return result;
  }

  const lint = geoLint({
    frontmatter: run.sonnet.frontmatter as unknown as Record<string, unknown>,
    body: run.sonnet.body,
    facts: run.facts,
  });
  result.gates.lint = {
    ok: lint.ok,
    errors: lint.errors.length,
    warns: lint.warns.length,
    detail: [...lint.errors.map(e => `ERROR ${e.code} ${e.msg}`), ...lint.warns.map(w => `WARN ${w.code} ${w.msg}`)],
  };
  logs.push(`[gate:verify:lint] errors=${lint.errors.length} warns=${lint.warns.length}`);
  if (!lint.ok) return result;

  const cc = numberCrossCheck(run.sonnet.body, run.facts);
  result.gates.crossCheck = { ok: cc.ok, unmatched: cc.unmatched, matched: cc.matchedCount };
  logs.push(`[gate:verify:crosscheck] matched=${cc.matchedCount} unmatched=${cc.unmatched.length}`);
  if (!cc.ok) return result;

  const slug = slugOf(input);
  try {
    const pr = await createDraftPR({
      slug,
      content: run.md,
      lintSummary: `ERROR 0 / WARN ${lint.warns.length}`,
      crossCheckSummary: `matched ${cc.matchedCount} / unmatched 0`,
      dryRun: true,
    });
    result.gates.pr = { ok: true, url: pr.url, dryRunLog: pr.dryRunLog };
    logs.push(`[pipeline:pr] dryRun ok`);
  } catch (e) {
    result.gates.pr = { ok: false, error: e instanceof Error ? e.message : String(e) };
    logs.push(`[pipeline:pr] 실패: ${result.gates.pr.error}`);
    return result;
  }

  result.sample = { slug, md: run.md };
  result.ok = true;
  return result;
}
