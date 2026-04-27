import Link from "next/link";
import { notFound } from "next/navigation";
import { createAdminClient } from "@/utils/supabase/admin";
import DeleteDraftButton from "./DeleteDraftButton";
import PostBodyMarkdown from "./PostBodyMarkdown";
import DownloadMdButton from "./DownloadMdButton";

const TYPE_LABEL: Record<string, string> = {
  brand: "브랜드(D3)",
  compare: "카테고리(D1/D2)",
  guide: "가이드(D0)",
  trend: "트렌드",
  external: "외부채널",
  datasheet: "데이터시트",
};

type DraftRow = {
  id: string;
  brand_id: string | null;
  channel: string | null;
  title: string | null;
  status: string | null;
  target_date: string | null;
  published_url: string | null;
  created_at: string | null;
  content_type: string | null;
  content: string | null;
  faq: unknown;
  geo_brands?: { name?: string } | null;
};

type FaqItem = { q: string; a: string };

function parseFaq(raw: unknown): FaqItem[] {
  if (Array.isArray(raw)) {
    return raw
      .filter((x): x is Record<string, unknown> => typeof x === "object" && x !== null)
      .map((x) => ({ q: String(x.q ?? ""), a: String(x.a ?? "") }))
      .filter((x) => x.q || x.a);
  }
  if (typeof raw === "string") {
    try { return parseFaq(JSON.parse(raw)); } catch { return []; }
  }
  return [];
}

export default async function PostDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("frandoor_blog_drafts")
    .select("id, brand_id, channel, title, status, target_date, published_url, created_at, content_type, content, faq, geo_brands(name)")
    .eq("id", id)
    .maybeSingle();

  if (error || !data) notFound();
  const draft = data as unknown as DraftRow;
  const faq = parseFaq(draft.faq);
  const typeLabel = draft.content_type ? (TYPE_LABEL[draft.content_type] ?? draft.content_type) : "-";

  return (
    <div className="space-y-4 max-w-4xl">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <Link href="/content/posts" className="text-xs text-slate-500 hover:text-slate-800">
          ← 목록으로
        </Link>
        <div className="flex items-center gap-2">
          {draft.content && (
            <DownloadMdButton content={draft.content} fallbackName={draft.id.slice(0, 8)} />
          )}
          <DeleteDraftButton id={draft.id} />
        </div>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-6 space-y-3">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="inline-block text-[11px] bg-slate-100 text-slate-600 px-2 py-0.5 rounded">
            {typeLabel}
          </span>
          <span className={"text-[11px] px-2 py-0.5 rounded " + (draft.status === "published" ? "bg-emerald-50 text-emerald-600" : "bg-slate-100 text-slate-500")}>
            {draft.status ?? "-"}
          </span>
          {draft.channel && (
            <span className="text-[11px] text-slate-500">{draft.channel}</span>
          )}
          {draft.geo_brands?.name && (
            <span className="text-[11px] text-slate-500">· {draft.geo_brands.name}</span>
          )}
          <span className="text-[11px] text-slate-400 ml-auto">
            {draft.created_at?.slice(0, 10) ?? "-"}
          </span>
        </div>
        <h1 className="text-lg font-semibold text-slate-900">
          {draft.title || "(제목 없음)"}
        </h1>
        {draft.published_url && (
          <a href={draft.published_url} target="_blank" rel="noreferrer"
            className="text-xs text-blue-600 hover:underline">
            발행 URL 열기 ↗
          </a>
        )}
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-6">
        <h2 className="text-xs font-semibold text-slate-500 mb-3">본문</h2>
        {draft.content ? (
          <PostBodyMarkdown body={draft.content} />
        ) : (
          <p className="text-sm text-slate-400">본문 없음</p>
        )}
      </div>

      {faq.length > 0 && (
        <div className="rounded-xl border border-slate-200 bg-white p-6">
          <h2 className="text-xs font-semibold text-slate-500 mb-3">FAQ ({faq.length}문항)</h2>
          <dl className="space-y-3 text-sm">
            {faq.map((f, i) => (
              <div key={i} className="border-t border-slate-100 pt-3 first:border-0 first:pt-0">
                <dt className="font-medium text-slate-800">Q. {f.q}</dt>
                <dd className="mt-1 text-slate-600 whitespace-pre-wrap">A. {f.a}</dd>
              </div>
            ))}
          </dl>
        </div>
      )}
    </div>
  );
}
