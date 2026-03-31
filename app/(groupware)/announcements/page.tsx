"use client";

import { useState, useEffect, useMemo } from "react";
import { format, parseISO } from "date-fns";
import { ko } from "date-fns/locale";
import { Plus, Search, ChevronLeft, Pencil, Trash2, Pin } from "lucide-react";
import { cn } from "@/lib/utils";
import type { DashboardAnnouncement } from "@/lib/dashboardAnnouncementStorage";
import { usePermission } from "@/contexts/PermissionContext";

function mapRow(row: Record<string, unknown>): DashboardAnnouncement {
  return {
    id: row.id as string,
    title: row.title as string,
    body: (row.body as string) ?? undefined,
    date: row.date as string,
    isImportant: !!(row.is_important),
    authorId: (row.author_id as string) ?? undefined,
    authorName: (row.author_name as string) ?? undefined,
  };
}

function sortAnnouncements(list: DashboardAnnouncement[]): DashboardAnnouncement[] {
  return [...list].sort((a, b) => {
    if (a.isImportant && !b.isImportant) return -1;
    if (!a.isImportant && b.isImportant) return 1;
    return b.date.localeCompare(a.date);
  });
}

export default function AnnouncementsPage() {
  const { isCLevel, currentUserName, currentUserId } = usePermission();
  const [announcements, setAnnouncements] = useState<DashboardAnnouncement[]>([]);
  const [selected, setSelected] = useState<DashboardAnnouncement | null>(null);
  const [tab, setTab] = useState<"all" | "important">("all");
  const [search, setSearch] = useState("");

  // 새 글 / 수정 폼
  const [formOpen, setFormOpen] = useState(false);
  const [formMode, setFormMode] = useState<"new" | "edit">("new");
  const [formId, setFormId] = useState<string | null>(null);
  const [formTitle, setFormTitle] = useState("");
  const [formBody, setFormBody] = useState("");
  const [formImportant, setFormImportant] = useState(false);
  const [formSaving, setFormSaving] = useState(false);

  async function reload() {
    const rows = await fetch("/api/announcements").then((r) => r.ok ? r.json() : []).catch(() => []);
    if (Array.isArray(rows)) {
      setAnnouncements(sortAnnouncements((rows as Record<string, unknown>[]).map(mapRow)));
    }
  }

  useEffect(() => { reload(); }, []);

  const filtered = useMemo(() => {
    let list = announcements;
    if (tab === "important") list = list.filter((a) => a.isImportant);
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter((a) => a.title.toLowerCase().includes(q) || a.body?.toLowerCase().includes(q));
    }
    return list;
  }, [announcements, tab, search]);

  function openNew() {
    setFormMode("new");
    setFormId(null);
    setFormTitle("");
    setFormBody("");
    setFormImportant(false);
    setFormOpen(true);
  }

  function openEdit(ann: DashboardAnnouncement) {
    setFormMode("edit");
    setFormId(ann.id);
    setFormTitle(ann.title);
    setFormBody(ann.body ?? "");
    setFormImportant(!!ann.isImportant);
    setFormOpen(true);
  }

  async function handleSave() {
    if (!formTitle.trim()) return;
    setFormSaving(true);
    if (formMode === "new") {
      await fetch("/api/announcements", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: formTitle.trim(),
          body: formBody.trim() || null,
          date: format(new Date(), "yyyy-MM-dd"),
          isImportant: formImportant,
          authorId: currentUserId || null,
          authorName: currentUserName || null,
        }),
      });
    } else {
      await fetch(`/api/announcements/${formId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: formTitle.trim(), body: formBody.trim() || null, isImportant: formImportant }),
      });
      if (selected?.id === formId) setSelected(null);
    }
    setFormSaving(false);
    setFormOpen(false);
    await reload();
  }

  async function handleDelete(id: string) {
    if (!confirm("이 공지사항을 삭제할까요?")) return;
    await fetch(`/api/announcements/${id}`, { method: "DELETE" });
    if (selected?.id === id) setSelected(null);
    await reload();
  }

  async function handleToggleImportant(ann: DashboardAnnouncement) {
    await fetch(`/api/announcements/${ann.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isImportant: !ann.isImportant }),
    });
    if (selected?.id === ann.id) setSelected({ ...ann, isImportant: !ann.isImportant });
    await reload();
  }

  // 상세 보기 화면
  if (selected) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-8">
        <button
          onClick={() => setSelected(null)}
          className="mb-6 flex items-center gap-1 text-sm text-slate-500 hover:text-slate-800"
        >
          <ChevronLeft className="size-4" /> 목록으로
        </button>

        <div className={cn(
          "rounded-2xl border p-8",
          selected.isImportant ? "border-indigo-100 bg-indigo-50/30" : "border-slate-100 bg-white"
        )}>
          <div className="mb-4 flex items-start justify-between gap-4">
            <div>
              {selected.isImportant && (
                <span className="mb-2 inline-flex items-center gap-1 rounded-full bg-indigo-100 px-2.5 py-0.5 text-xs font-semibold text-indigo-700">
                  <Pin className="size-3" /> 필독
                </span>
              )}
              <h1 className="text-xl font-bold text-slate-900">{selected.title}</h1>
              <p className="mt-1.5 text-xs text-slate-400">
                {format(parseISO(selected.date), "yyyy년 M월 d일 (eee)", { locale: ko })}
                {selected.authorName && ` · ${selected.authorName}`}
              </p>
            </div>
            {isCLevel && (
              <div className="flex shrink-0 items-center gap-2">
                <button
                  onClick={() => handleToggleImportant(selected)}
                  className={cn(
                    "rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors",
                    selected.isImportant
                      ? "border-indigo-200 bg-indigo-50 text-indigo-600 hover:bg-indigo-100"
                      : "border-slate-200 bg-white text-slate-500 hover:bg-slate-50"
                  )}
                >
                  {selected.isImportant ? "필독 해제" : "📌 필독"}
                </button>
                <button
                  onClick={() => { setSelected(null); openEdit(selected); }}
                  className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50"
                >
                  수정
                </button>
                <button
                  onClick={() => handleDelete(selected.id)}
                  className="rounded-lg border border-rose-200 bg-white px-3 py-1.5 text-xs font-medium text-rose-600 hover:bg-rose-50"
                >
                  삭제
                </button>
              </div>
            )}
          </div>
          <hr className="border-slate-100 mb-6" />
          {selected.body ? (
            <p className="text-sm text-slate-700 whitespace-pre-wrap leading-7">{selected.body}</p>
          ) : (
            <p className="text-sm text-slate-400">내용이 없습니다.</p>
          )}
        </div>
      </div>
    );
  }

  // 목록 화면
  return (
    <div className="mx-auto max-w-4xl px-4 py-8">
      {/* 헤더 */}
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">공지사항</h1>
        {isCLevel && (
          <button
            onClick={openNew}
            className="flex items-center gap-1.5 rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-700"
          >
            <Plus className="size-4" /> 새 공지 작성
          </button>
        )}
      </div>

      {/* 탭 + 검색 */}
      <div className="mb-4 flex items-center justify-between gap-3">
        <div className="flex gap-1">
          {(["all", "important"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={cn(
                "rounded-lg px-3 py-1.5 text-sm font-medium transition-colors",
                tab === t ? "bg-slate-900 text-white" : "text-slate-500 hover:bg-slate-100"
              )}
            >
              {t === "all" ? "전체" : "📌 필독"}
            </button>
          ))}
        </div>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-slate-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="검색"
            className="rounded-lg border border-slate-200 bg-white py-1.5 pl-8 pr-3 text-sm text-slate-700 placeholder:text-slate-400 focus:border-slate-400 focus:outline-none w-48"
          />
        </div>
      </div>

      {/* 게시판 */}
      <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
        {/* 테이블 헤더 */}
        <div className="grid grid-cols-[48px_1fr_80px_90px] border-b border-slate-100 bg-slate-50 px-4 py-2.5 text-xs font-semibold text-slate-500">
          <span className="text-center">번호</span>
          <span>제목</span>
          <span className="text-center">작성자</span>
          <span className="text-center">날짜</span>
        </div>

        {filtered.length === 0 ? (
          <div className="py-16 text-center text-sm text-slate-400">
            {search ? "검색 결과가 없습니다." : "등록된 공지사항이 없습니다."}
          </div>
        ) : (
          <ul className="divide-y divide-slate-100">
            {filtered.map((ann, idx) => (
              <li
                key={ann.id}
                onClick={() => setSelected(ann)}
                className={cn(
                  "grid grid-cols-[48px_1fr_80px_90px] cursor-pointer items-center px-4 py-3.5 transition-colors hover:bg-slate-50",
                  ann.isImportant && "bg-indigo-50/40 hover:bg-indigo-50/70"
                )}
              >
                <span className="text-center text-xs text-slate-400">
                  {ann.isImportant ? <Pin className="size-3.5 text-indigo-500 mx-auto" /> : filtered.length - idx}
                </span>
                <div className="min-w-0 pr-4">
                  <div className="flex items-center gap-2">
                    {ann.isImportant && (
                      <span className="shrink-0 rounded-full bg-indigo-100 px-1.5 py-0.5 text-[10px] font-semibold text-indigo-700">필독</span>
                    )}
                    <span className={cn("truncate text-sm text-slate-800", ann.isImportant && "font-semibold")}>
                      {ann.title}
                    </span>
                  </div>
                  {ann.body && (
                    <p className="mt-0.5 truncate text-xs text-slate-400">{ann.body}</p>
                  )}
                </div>
                <span className="text-center text-xs text-slate-500">{ann.authorName ?? "-"}</span>
                <span className="text-center text-xs text-slate-400">
                  {format(parseISO(ann.date), "yy.M.d", { locale: ko })}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <p className="mt-3 text-right text-xs text-slate-400">총 {filtered.length}건</p>

      {/* 새 글 / 수정 모달 */}
      {formOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4" onClick={() => setFormOpen(false)}>
          <div className="w-full max-w-lg rounded-2xl bg-white shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
              <h2 className="text-base font-bold text-slate-900">{formMode === "new" ? "새 공지 작성" : "공지사항 수정"}</h2>
              <button onClick={() => setFormOpen(false)} className="text-slate-400 hover:text-slate-700">✕</button>
            </div>
            <div className="px-6 py-5 space-y-4">
              <div>
                <label className="text-xs font-medium text-slate-600">제목 *</label>
                <input
                  value={formTitle}
                  onChange={(e) => setFormTitle(e.target.value)}
                  placeholder="공지 제목을 입력하세요"
                  className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-slate-400 focus:outline-none"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-slate-600">내용</label>
                <textarea
                  value={formBody}
                  onChange={(e) => setFormBody(e.target.value)}
                  rows={8}
                  placeholder="내용을 입력하세요"
                  className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-slate-400 focus:outline-none resize-none leading-relaxed"
                />
              </div>
              <label className="flex cursor-pointer items-center gap-2">
                <input
                  type="checkbox"
                  checked={formImportant}
                  onChange={(e) => setFormImportant(e.target.checked)}
                  className="size-4 rounded"
                />
                <span className="text-sm text-slate-700">📌 필독 공지로 설정</span>
              </label>
            </div>
            <div className="flex justify-end gap-2 border-t border-slate-100 px-6 py-4">
              <button onClick={() => setFormOpen(false)} className="rounded-lg border px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50">취소</button>
              <button
                onClick={handleSave}
                disabled={!formTitle.trim() || formSaving}
                className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-700 disabled:opacity-40"
              >
                {formSaving ? "저장 중…" : "저장"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
