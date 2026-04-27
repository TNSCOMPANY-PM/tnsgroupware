"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

/**
 * PR047 — HTML 박스 폐기 후 순수 마크다운 렌더러.
 * frontmatter (YAML) 가 본문 시작에 있으면 회색 박스로 표시 (가이드의 자동 처리 시뮬레이션).
 */

function splitFrontmatter(raw: string): { fm: string | null; body: string } {
  if (!raw.startsWith("---")) return { fm: null, body: raw };
  const closeIdx = raw.indexOf("\n---", 3);
  if (closeIdx < 0) return { fm: null, body: raw };
  const fm = raw.slice(0, closeIdx + 4).trim();
  let body = raw.slice(closeIdx + 4);
  body = body.replace(/^[\r\n]+/, "");
  return { fm, body };
}

export default function PostBodyMarkdown({ body }: { body: string }) {
  const { fm, body: md } = splitFrontmatter(body);
  return (
    <div className="space-y-4">
      {fm && (
        <details className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-xs">
          <summary className="cursor-pointer font-semibold text-slate-700">
            발행 frontmatter (YAML)
          </summary>
          <pre className="mt-2 whitespace-pre-wrap font-mono text-[11px] text-slate-700">{fm}</pre>
        </details>
      )}
      <div className="text-sm leading-relaxed">
        <ReactMarkdown
          remarkPlugins={[remarkGfm]}
          components={{
            h2: ({ children, ...props }) => (
              <h2
                {...props}
                className="text-base font-semibold text-slate-900 mt-6 mb-3"
              >
                {children}
              </h2>
            ),
            h3: ({ children, ...props }) => (
              <h3 {...props} className="text-sm font-semibold text-slate-800 mt-4 mb-2">
                {children}
              </h3>
            ),
            p: ({ children, ...props }) => (
              <p {...props} className="text-slate-700 my-3 leading-relaxed">
                {children}
              </p>
            ),
            blockquote: ({ children, ...props }) => (
              <blockquote
                {...props}
                className="border-l-4 border-slate-300 bg-slate-50 pl-4 py-2 my-3 text-slate-700"
              >
                {children}
              </blockquote>
            ),
            table: ({ children, ...props }) => (
              <div className="overflow-x-auto my-4">
                <table
                  {...props}
                  className="min-w-full border-collapse border border-slate-200 text-sm"
                >
                  {children}
                </table>
              </div>
            ),
            th: ({ children, ...props }) => (
              <th
                {...props}
                className="border border-slate-200 bg-slate-50 px-3 py-2 text-left font-semibold text-slate-700"
              >
                {children}
              </th>
            ),
            td: ({ children, ...props }) => (
              <td {...props} className="border border-slate-200 px-3 py-2 text-slate-700">
                {children}
              </td>
            ),
            ul: ({ children, ...props }) => (
              <ul {...props} className="list-disc pl-6 my-3 space-y-1 text-slate-700">
                {children}
              </ul>
            ),
            ol: ({ children, ...props }) => (
              <ol {...props} className="list-decimal pl-6 my-3 space-y-1 text-slate-700">
                {children}
              </ol>
            ),
            a: ({ children, href, ...props }) => (
              <a
                {...props}
                href={href}
                rel="nofollow noopener"
                target="_blank"
                className="text-blue-600 hover:underline"
              >
                {children}
              </a>
            ),
          }}
        >
          {md}
        </ReactMarkdown>
      </div>
    </div>
  );
}
