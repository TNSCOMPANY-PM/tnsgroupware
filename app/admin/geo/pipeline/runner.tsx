"use client";

import { useState } from "react";

type Pipeline = {
  ok: boolean;
  generator: string;
  input: { brand: string; category: string };
  logs: string[];
  gates: {
    generate: { ok: boolean; error?: string };
    lint: { ok: boolean; errors: number; warns: number; detail: string[] };
    crossCheck: { ok: boolean; unmatched: string[]; matched: number };
    pr: { ok: boolean; url?: string; dryRunLog?: string; error?: string };
  };
  sample?: { slug: string; md: string };
};

export default function PipelineRunner() {
  const [brand, setBrand] = useState("메가MGC커피");
  const [category, setCategory] = useState("관심도 랭킹");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Pipeline | { error: string } | null>(null);

  const run = async () => {
    setBusy(true);
    setResult(null);
    try {
      const res = await fetch("/api/admin/geo/pipeline/dryrun", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ brand, category }),
      });
      setResult(await res.json());
    } catch (e) {
      setResult({ error: e instanceof Error ? e.message : "실패" });
    }
    setBusy(false);
  };

  const isPipeline = (v: unknown): v is Pipeline =>
    !!v && typeof v === "object" && "gates" in (v as Record<string, unknown>);

  return (
    <div className="mt-4 space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-xs text-slate-500">Brand</label>
          <input value={brand} onChange={e => setBrand(e.target.value)}
            className="mt-1 w-full rounded-md border border-slate-200 px-3 py-2 text-sm" />
        </div>
        <div>
          <label className="text-xs text-slate-500">Category</label>
          <input value={category} onChange={e => setCategory(e.target.value)}
            className="mt-1 w-full rounded-md border border-slate-200 px-3 py-2 text-sm"
            placeholder="관심도 랭킹 / 점포수 랭킹 / ..." />
        </div>
      </div>
      <button onClick={run} disabled={busy}
        className="rounded-md bg-indigo-600 px-4 py-2 text-sm text-white disabled:opacity-50 hover:bg-indigo-700">
        {busy ? "실행 중..." : "드라이런 실행"}
      </button>

      {result && "error" in result && (
        <pre className="rounded-lg bg-red-50 p-3 text-xs text-red-700">{result.error}</pre>
      )}

      {result && isPipeline(result) && (
        <div className="space-y-3 text-sm">
          <div className="rounded-lg border border-slate-200 p-3">
            <h3 className="font-semibold">게이트 결과</h3>
            <table className="mt-2 w-full text-xs">
              <tbody>
                <tr><td className="py-1 pr-3 text-slate-500">generate</td>
                  <td className={result.gates.generate.ok ? "text-emerald-600" : "text-red-600"}>
                    {result.gates.generate.ok ? "PASS" : `FAIL ${result.gates.generate.error}`}
                  </td></tr>
                <tr><td className="py-1 pr-3 text-slate-500">lint</td>
                  <td className={result.gates.lint.ok ? "text-emerald-600" : "text-red-600"}>
                    ERROR {result.gates.lint.errors} / WARN {result.gates.lint.warns}
                  </td></tr>
                <tr><td className="py-1 pr-3 text-slate-500">crossCheck</td>
                  <td className={result.gates.crossCheck.ok ? "text-emerald-600" : "text-red-600"}>
                    matched {result.gates.crossCheck.matched} / unmatched {result.gates.crossCheck.unmatched.length}
                  </td></tr>
                <tr><td className="py-1 pr-3 text-slate-500">pr(dryRun)</td>
                  <td className={result.gates.pr.ok ? "text-emerald-600" : "text-red-600"}>
                    {result.gates.pr.ok ? "PASS" : `FAIL ${result.gates.pr.error}`}
                  </td></tr>
              </tbody>
            </table>
          </div>

          {result.gates.lint.detail.length > 0 && (
            <details className="rounded-lg border border-slate-200 p-3">
              <summary className="text-xs font-medium">Lint detail ({result.gates.lint.detail.length})</summary>
              <ul className="mt-2 space-y-1 text-[11px] text-slate-600">
                {result.gates.lint.detail.map((d, i) => <li key={i} className="font-mono">{d}</li>)}
              </ul>
            </details>
          )}

          {result.gates.crossCheck.unmatched.length > 0 && (
            <details className="rounded-lg border border-slate-200 p-3">
              <summary className="text-xs font-medium">CrossCheck unmatched ({result.gates.crossCheck.unmatched.length})</summary>
              <ul className="mt-2 space-y-1 text-[11px] text-slate-600">
                {result.gates.crossCheck.unmatched.map((d, i) => <li key={i} className="font-mono">{d}</li>)}
              </ul>
            </details>
          )}

          {result.gates.pr.dryRunLog && (
            <details className="rounded-lg border border-slate-200 p-3">
              <summary className="text-xs font-medium">PR dryRun log</summary>
              <pre className="mt-2 overflow-x-auto text-[11px] text-slate-600">{result.gates.pr.dryRunLog}</pre>
            </details>
          )}

          {result.sample && (
            <details className="rounded-lg border border-slate-200 p-3">
              <summary className="text-xs font-medium">Sample .md (slug: {result.sample.slug})</summary>
              <pre className="mt-2 max-h-96 overflow-auto whitespace-pre-wrap text-[11px] text-slate-700">{result.sample.md}</pre>
            </details>
          )}

          <details className="rounded-lg border border-slate-200 p-3">
            <summary className="text-xs font-medium">Logs ({result.logs.length})</summary>
            <pre className="mt-2 max-h-64 overflow-auto text-[11px] text-slate-600">{result.logs.join("\n")}</pre>
          </details>
        </div>
      )}
    </div>
  );
}
