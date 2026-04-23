"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";

type Row = {
  id: string;
  brand_id: string | null;
  channel: string;
  title: string;
  status: string;
  target_date: string | null;
  published_url: string | null;
  created_at: string;
  content_type: string;
  geo_brands?: { name?: string } | null;
};

type Brand = { id: string; name: string };

const TYPE_LABEL: Record<string, string> = {
  brand: "브랜드(D3)",
  compare: "카테고리(D1/D2)",
  guide: "가이드(D0)",
  trend: "트렌드",
  external: "외부채널",
  datasheet: "데이터시트",
};

export default function PostsPage() {
  const [rows, setRows] = useState<Row[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize] = useState(20);
  const [loading, setLoading] = useState(false);
  const [brands, setBrands] = useState<Brand[]>([]);

  const [contentType, setContentType] = useState("");
  const [brandId, setBrandId] = useState("");
  const [platform, setPlatform] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  useEffect(() => {
    fetch("/api/geo/brands").then(r => r.ok ? r.json() : []).then(b => setBrands(b ?? []));
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    const qs = new URLSearchParams();
    qs.set("page", String(page));
    qs.set("pageSize", String(pageSize));
    if (contentType) qs.set("content_type", contentType);
    if (brandId) qs.set("brand_id", brandId);
    if (platform) qs.set("platform", platform);
    if (from) qs.set("from", from);
    if (to) qs.set("to", to);
    const res = await fetch(`/api/geo/blog-posts?${qs.toString()}`);
    if (res.ok) {
      const data = await res.json();
      setRows(data.rows ?? []);
      setTotal(data.total ?? 0);
    }
    setLoading(false);
  }, [page, pageSize, contentType, brandId, platform, from, to]);

  useEffect(() => { load(); }, [load]);

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-slate-200 bg-white p-4 grid grid-cols-1 md:grid-cols-5 gap-2">
        <select value={contentType} onChange={e => { setContentType(e.target.value); setPage(1); }}
          className="text-xs border border-slate-200 rounded-md px-2 py-1.5">
          <option value="">전체 타입</option>
          <option value="brand">브랜드 (A)</option>
          <option value="compare">비교 (B)</option>
          <option value="guide">가이드 (C)</option>
          <option value="trend">트렌드 (D)</option>
          <option value="external">외부채널</option>
          <option value="datasheet">데이터시트</option>
        </select>
        <select value={brandId} onChange={e => { setBrandId(e.target.value); setPage(1); }}
          className="text-xs border border-slate-200 rounded-md px-2 py-1.5">
          <option value="">전체 브랜드</option>
          {brands.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
        </select>
        <select value={platform} onChange={e => { setPlatform(e.target.value); setPage(1); }}
          className="text-xs border border-slate-200 rounded-md px-2 py-1.5">
          <option value="">전체 플랫폼</option>
          <option value="frandoor">frandoor</option>
          <option value="tistory">티스토리</option>
          <option value="naver">네이버</option>
          <option value="medium">Medium</option>
        </select>
        <input type="date" value={from} onChange={e => { setFrom(e.target.value); setPage(1); }}
          className="text-xs border border-slate-200 rounded-md px-2 py-1.5" />
        <input type="date" value={to} onChange={e => { setTo(e.target.value); setPage(1); }}
          className="text-xs border border-slate-200 rounded-md px-2 py-1.5" />
      </div>

      <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
        <table className="w-full text-xs">
          <thead className="bg-slate-50 text-slate-500">
            <tr>
              <th className="px-3 py-2 text-left font-medium">날짜</th>
              <th className="px-3 py-2 text-left font-medium">타입</th>
              <th className="px-3 py-2 text-left font-medium">브랜드</th>
              <th className="px-3 py-2 text-left font-medium">플랫폼</th>
              <th className="px-3 py-2 text-left font-medium">제목</th>
              <th className="px-3 py-2 text-left font-medium">상태</th>
              <th className="px-3 py-2 text-left font-medium">URL</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={7} className="px-3 py-6 text-center text-slate-400">로딩…</td></tr>
            ) : rows.length === 0 ? (
              <tr><td colSpan={7} className="px-3 py-6 text-center text-slate-400">조회된 글이 없습니다</td></tr>
            ) : rows.map(r => (
              <tr key={r.id} className="border-t border-slate-100">
                <td className="px-3 py-2 text-slate-600">{r.created_at?.slice(0, 10)}</td>
                <td className="px-3 py-2">
                  <span className="inline-block text-[10px] bg-slate-100 text-slate-600 px-2 py-0.5 rounded">
                    {TYPE_LABEL[r.content_type] ?? r.content_type}
                  </span>
                </td>
                <td className="px-3 py-2 text-slate-700">{r.content_type === "brand" ? (r.geo_brands?.name ?? "-") : "-"}</td>
                <td className="px-3 py-2 text-slate-600">{r.channel}</td>
                <td className="px-3 py-2 text-slate-800 font-medium truncate max-w-[280px]">
                  <Link href={`/content/posts/${r.id}`} className="hover:underline">
                    {r.title || "(제목 없음)"}
                  </Link>
                </td>
                <td className="px-3 py-2">
                  <span className={"text-[10px] px-2 py-0.5 rounded " + (r.status === "published" ? "bg-emerald-50 text-emerald-600" : "bg-slate-100 text-slate-500")}>
                    {r.status}
                  </span>
                </td>
                <td className="px-3 py-2">
                  {r.published_url ? (
                    <a href={r.published_url} target="_blank" rel="noreferrer" className="text-blue-500 hover:underline">열기 ↗</a>
                  ) : <span className="text-slate-300">—</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between text-xs text-slate-500">
        <span>총 {total}개 · {page}/{totalPages} 페이지</span>
        <div className="flex gap-1">
          <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page <= 1}
            className="px-3 py-1 border border-slate-200 rounded-md disabled:opacity-40">이전</button>
          <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page >= totalPages}
            className="px-3 py-1 border border-slate-200 rounded-md disabled:opacity-40">다음</button>
        </div>
      </div>

      <div className="text-[10px] text-slate-400">
        <Link href="/content/editor" className="hover:underline">새 콘텐츠 작성하러 가기 →</Link>
      </div>
    </div>
  );
}
