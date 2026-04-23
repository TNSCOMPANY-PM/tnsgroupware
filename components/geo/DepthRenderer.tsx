import Script from "next/script";
import type {
  GeoPayload,
  GeoPayloadIndustry,
  GeoPayloadFranchise,
  GeoPayloadMarkdown,
} from "@/lib/geo/types";

type Props = {
  payload: GeoPayload;
  canonicalUrl: string;
  jsonLd: Record<string, unknown>[];
};

export default function DepthRenderer({ payload, canonicalUrl, jsonLd }: Props) {
  return (
    <article className="mx-auto max-w-3xl space-y-8 p-6">
      {payload.kind === "industryDoc" && <IndustryDoc payload={payload} />}
      {payload.kind === "franchiseDoc" && <FranchiseDoc payload={payload} />}
      {payload.kind === "markdown" && <MarkdownDoc payload={payload} />}
      <link rel="canonical" href={canonicalUrl} />
      {jsonLd.map((ld, i) => (
        <Script
          key={`jsonld-${i}`}
          id={`jsonld-${i}`}
          type="application/ld+json"
          strategy="beforeInteractive"
        >
          {JSON.stringify(ld)}
        </Script>
      ))}
    </article>
  );
}

function IndustryDoc({ payload }: { payload: GeoPayloadIndustry }) {
  const table = payload.comparisonTable ?? [];
  const columns = table.length > 0 ? Object.keys(table[0]) : [];
  return (
    <>
      {payload.sections.map((s, i) => (
        <section key={`sec-${i}`} className="space-y-3">
          <h2 className="text-lg font-semibold text-slate-800">{s.heading}</h2>
          <div
            className="prose prose-sm max-w-none text-slate-700"
            dangerouslySetInnerHTML={{ __html: s.body }}
          />
        </section>
      ))}
      {table.length > 0 && columns.length > 0 && (
        <section className="overflow-x-auto rounded-xl border border-slate-200 bg-white p-4">
          <h2 className="text-lg font-semibold text-slate-800">업종 비교</h2>
          <table className="mt-3 w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-left text-slate-500">
                {columns.map((c) => (
                  <th key={c} className="px-3 py-2 font-medium">{c}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {table.map((row, i) => (
                <tr key={`row-${i}`} className="border-b border-slate-100">
                  {columns.map((c) => (
                    <td key={c} className="px-3 py-2 text-slate-700">
                      {String(row[c] ?? "")}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
    </>
  );
}

function FranchiseDoc({ payload }: { payload: GeoPayloadFranchise }) {
  const sections = payload.sections ?? [];
  const closure = payload.closure;
  const faqs = payload.faq25 ?? [];
  return (
    <>
      {sections.map((s, i) => (
        <section key={`sec-${i}`} className="space-y-3">
          <h2 className="text-lg font-semibold text-slate-800">{s.heading}</h2>
          <div
            className="prose prose-sm max-w-none text-slate-700"
            dangerouslySetInnerHTML={{ __html: s.body }}
          />
        </section>
      ))}
      {closure && (
        <section className="space-y-3 rounded-xl border border-slate-200 bg-slate-50 p-4">
          <h2 className="text-lg font-semibold text-slate-800">{closure.headline}</h2>
          <div
            className="prose prose-sm max-w-none text-slate-700"
            dangerouslySetInnerHTML={{ __html: closure.bodyHtml }}
          />
          {closure.metrics?.length > 0 && (
            <dl className="grid grid-cols-2 gap-3 text-sm md:grid-cols-3">
              {closure.metrics.map((m) => (
                <div key={m.key} className="rounded-lg bg-white p-3">
                  <dt className="text-xs text-slate-500">{m.label}</dt>
                  <dd className="mt-1 text-lg font-semibold tabular-nums text-slate-800">
                    {m.value}
                    <span className="ml-1 text-xs text-slate-400">{m.unit}</span>
                  </dd>
                  <div className="mt-1 text-xs text-slate-400">{m.basis}</div>
                </div>
              ))}
            </dl>
          )}
        </section>
      )}
      {faqs.length > 0 && (
        <section className="rounded-xl border border-slate-200 bg-white p-4">
          <h2 className="text-lg font-semibold text-slate-800">자주 묻는 질문</h2>
          <dl className="mt-3 space-y-3 text-sm">
            {faqs.map((f, i) => (
              <div key={`faq-${i}`}>
                <dt className="font-medium text-slate-800">{f.q}</dt>
                <dd className="mt-1 text-slate-600">{f.a}</dd>
              </div>
            ))}
          </dl>
        </section>
      )}
    </>
  );
}

function MarkdownDoc({ payload }: { payload: GeoPayloadMarkdown }) {
  return (
    <section className="prose prose-sm max-w-none text-slate-700">
      <pre className="whitespace-pre-wrap">{payload.body}</pre>
    </section>
  );
}
