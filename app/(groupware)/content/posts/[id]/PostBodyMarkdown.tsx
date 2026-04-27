"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeRaw from "rehype-raw";
import rehypeSanitize, { defaultSchema } from "rehype-sanitize";
import type { Schema } from "hast-util-sanitize";
import { OG_WRAP_CSS } from "@/lib/geo/write/blocks";

const ALLOWED_CLASS = [
  "og-wrap",
  "answer-box",
  "stat-row",
  "stat-box",
  "info-box",
  "warn",
  "conclusion-box",
  "formula-box",
  "q",
  "a",
  "detail",
  "num",
  "lbl",
  "title",
  "body",
  "cta",
];

const customSchema: Schema = {
  ...defaultSchema,
  attributes: {
    ...(defaultSchema.attributes ?? {}),
    "*": [...(defaultSchema.attributes?.["*"] ?? []), ["className", ...ALLOWED_CLASS], "style"],
    div: [...((defaultSchema.attributes?.div as unknown as string[]) ?? []), "className", "style"],
    span: [...((defaultSchema.attributes?.span as unknown as string[]) ?? []), "className", "style"],
    a: [
      ...((defaultSchema.attributes?.a as unknown as string[]) ?? []),
      "href",
      "rel",
      "target",
    ],
  },
};

export default function PostBodyMarkdown({ body }: { body: string }) {
  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: OG_WRAP_CSS }} />
      <div className="og-wrap geo-post-body text-sm leading-relaxed">
        <ReactMarkdown
          remarkPlugins={[remarkGfm]}
          rehypePlugins={[rehypeRaw, [rehypeSanitize, customSchema]]}
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
          }}
        >
          {body}
        </ReactMarkdown>
      </div>
    </>
  );
}
