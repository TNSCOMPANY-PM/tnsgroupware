"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

/**
 * PR047 — HTML 박스 폐기 후 순수 마크다운 렌더러.
 * frontmatter (YAML) 가 본문 시작에 있으면 회색 박스로 표시.
 *
 * v2-19 hotfix:
 *  · splitFrontmatter 견고화 (BOM·앞공백 trim + regex 정확 매칭)
 *  · 한국어 긴 줄 wrap 보강 (모든 텍스트 컴포넌트 break-words break-keep)
 *  · 부모 컨테이너 max-w-full overflow-hidden 으로 가로 삐져나옴 차단
 *
 * v2-23 hotfix:
 *  · 외부 ``` 코드펜스 wrap 을 frontmatter 추출 전 strip (LLM 이 종종 ``` 으로 감쌈)
 *  · pre / code 커스텀 컴포넌트 — overflow-x-auto + whitespace-pre-wrap + break-words
 *  · 본문 div min-w-0 + w-full + overflow-x-hidden 으로 잘림 차단
 */

function splitFrontmatter(raw: string): { fm: string | null; body: string } {
  // BOM (U+FEFF) 제거 + 앞공백 trim
  let trimmed = raw.replace(/^﻿/, "").replace(/^\s+/, "");
  // 외부 ``` 코드펜스 strip (LLM 이 출력 형식 ``` 을 그대로 둘 때)
  const fence = trimmed.match(/^```[a-zA-Z]*\s*\n([\s\S]*?)\n```\s*$/);
  if (fence) trimmed = fence[1].trim();
  const m = trimmed.match(/^---\s*\n([\s\S]*?)\n---\s*(?:\n([\s\S]*))?$/);
  if (!m) return { fm: null, body: trimmed || raw };
  const fm = `---\n${m[1]}\n---`;
  const body = (m[2] ?? "").replace(/^[\r\n]+/, "");
  return { fm, body };
}

export default function PostBodyMarkdown({ body }: { body: string }) {
  const { fm, body: md } = splitFrontmatter(body);
  return (
    <div className="space-y-4 max-w-full min-w-0 overflow-x-hidden">
      {fm && (
        <details className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-xs">
          <summary className="cursor-pointer font-semibold text-slate-700">
            발행 frontmatter (YAML)
          </summary>
          <pre className="mt-2 whitespace-pre-wrap break-words font-mono text-[11px] text-slate-700 max-w-full">
            {fm}
          </pre>
        </details>
      )}
      <div className="text-sm leading-relaxed break-words break-keep min-w-0 w-full max-w-full">
        <ReactMarkdown
          remarkPlugins={[remarkGfm]}
          components={{
            h2: ({ children, ...props }) => (
              <h2
                {...props}
                className="text-base font-semibold text-slate-900 mt-6 mb-3 break-words break-keep"
              >
                {children}
              </h2>
            ),
            h3: ({ children, ...props }) => (
              <h3
                {...props}
                className="text-sm font-semibold text-slate-800 mt-4 mb-2 break-words break-keep"
              >
                {children}
              </h3>
            ),
            p: ({ children, ...props }) => (
              <p
                {...props}
                className="text-slate-700 my-3 leading-relaxed break-words break-keep"
              >
                {children}
              </p>
            ),
            blockquote: ({ children, ...props }) => (
              <blockquote
                {...props}
                className="border-l-4 border-slate-300 bg-slate-50 pl-4 py-2 my-3 text-slate-700 break-words break-keep"
              >
                {children}
              </blockquote>
            ),
            pre: ({ children, ...props }) => (
              <pre
                {...props}
                className="overflow-x-auto whitespace-pre-wrap break-words rounded bg-slate-50 p-3 my-3 text-xs font-mono text-slate-700 max-w-full"
              >
                {children}
              </pre>
            ),
            code: ({ children, className, ...props }) => {
              const isBlock = className?.includes("language-");
              if (isBlock) {
                return (
                  <code {...props} className={className + " whitespace-pre-wrap break-words"}>
                    {children}
                  </code>
                );
              }
              return (
                <code
                  {...props}
                  className="bg-slate-100 rounded px-1 py-0.5 text-xs font-mono break-all"
                >
                  {children}
                </code>
              );
            },
            table: ({ children, ...props }) => (
              <div className="overflow-x-auto my-4 max-w-full">
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
                className="border border-slate-200 bg-slate-50 px-3 py-2 text-left font-semibold text-slate-700 break-words break-keep"
              >
                {children}
              </th>
            ),
            td: ({ children, ...props }) => (
              <td
                {...props}
                className="border border-slate-200 px-3 py-2 text-slate-700 break-words break-keep"
              >
                {children}
              </td>
            ),
            ul: ({ children, ...props }) => (
              <ul
                {...props}
                className="list-disc pl-6 my-3 space-y-1 text-slate-700 break-words break-keep"
              >
                {children}
              </ul>
            ),
            ol: ({ children, ...props }) => (
              <ol
                {...props}
                className="list-decimal pl-6 my-3 space-y-1 text-slate-700 break-words break-keep"
              >
                {children}
              </ol>
            ),
            li: ({ children, ...props }) => (
              <li {...props} className="break-words break-keep">
                {children}
              </li>
            ),
            a: ({ children, href, ...props }) => (
              <a
                {...props}
                href={href}
                rel="nofollow noopener"
                target="_blank"
                className="text-blue-600 hover:underline break-all"
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
