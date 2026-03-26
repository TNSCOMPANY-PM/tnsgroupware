"use client";

import { useState, useEffect } from "react";
import { format, parseISO } from "date-fns";
import { ko } from "date-fns/locale";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Pencil, Trash2 } from "lucide-react";
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
  const { isCLevel } = usePermission();
  const [announcements, setAnnouncements] = useState<DashboardAnnouncement[]>([]);
  const [selected, setSelected] = useState<DashboardAnnouncement | null>(null);

  // edit state
  const [editId, setEditId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editBody, setEditBody] = useState("");
  const [editImportant, setEditImportant] = useState(false);
  const [editOpen, setEditOpen] = useState(false);

  async function reload() {
    const rows = await fetch("/api/announcements").then((r) => r.ok ? r.json() : []).catch(() => []);
    if (Array.isArray(rows)) {
      setAnnouncements(sortAnnouncements((rows as Record<string, unknown>[]).map(mapRow)));
    }
  }

  useEffect(() => { reload(); }, []);

  function openEdit(ann: DashboardAnnouncement) {
    setEditId(ann.id);
    setEditTitle(ann.title);
    setEditBody(ann.body ?? "");
    setEditImportant(!!ann.isImportant);
    setEditOpen(true);
  }

  async function handleSave() {
    if (!editId || !editTitle.trim()) return;
    await fetch(`/api/announcements/${editId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: editTitle.trim(), body: editBody.trim() || null, isImportant: editImportant }),
    });
    setEditOpen(false);
    // update detail view if open
    if (selected?.id === editId) setSelected(null);
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

  return (
    <div className="mx-auto max-w-2xl px-4 py-8">
      <h1 className="mb-6 text-2xl font-bold tracking-tighter text-slate-900">공지사항</h1>
      {announcements.length === 0 ? (
        <p className="text-sm text-slate-400">등록된 공지사항이 없습니다.</p>
      ) : (
        <ul className="space-y-2">
          {announcements.map((ann) => (
            <li
              key={ann.id}
              onClick={() => setSelected(ann)}
              className={cn(
                "cursor-pointer rounded-xl px-4 py-3.5 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[0_4px_12px_rgb(0,0,0,0.06)]",
                ann.isImportant
                  ? "bg-gradient-to-r from-indigo-50/80 to-violet-50/50 border border-indigo-100/60"
                  : "bg-white/80 border border-slate-100/80"
              )}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <p className={cn("text-sm text-slate-800", ann.isImportant && "font-bold")}>
                    {ann.title}
                  </p>
                  {ann.body && (
                    <p className="mt-0.5 line-clamp-2 text-xs text-slate-500">{ann.body}</p>
                  )}
                  {ann.isImportant && (
                    <span className="mt-1.5 inline-block rounded-full bg-indigo-100 px-2 py-0.5 text-xs font-medium text-indigo-700">
                      📌 필독
                    </span>
                  )}
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1.5" onClick={(e) => e.stopPropagation()}>
                  <span className="text-xs text-slate-400">
                    {format(parseISO(ann.date), "yyyy.M.d", { locale: ko })}
                  </span>
                  {ann.authorName && (
                    <p className="text-xs text-slate-400">{ann.authorName}</p>
                  )}
                  {isCLevel && (
                    <div className="flex items-center gap-1 pt-0.5">
                      <button
                        type="button"
                        onClick={() => handleToggleImportant(ann)}
                        title={ann.isImportant ? "필독 해제" : "필독 설정"}
                        className={cn(
                          "rounded border px-1.5 py-0.5 text-[10px] font-medium transition-colors",
                          ann.isImportant
                            ? "border-indigo-200 bg-indigo-50 text-indigo-600 hover:bg-indigo-100"
                            : "border-slate-200 bg-white text-slate-500 hover:bg-slate-50"
                        )}
                      >
                        {ann.isImportant ? "📌 필독 해제" : "📌 필독"}
                      </button>
                      <button
                        type="button"
                        onClick={() => openEdit(ann)}
                        className="rounded border border-slate-200 bg-white p-1 text-slate-500 hover:bg-slate-50"
                      >
                        <Pencil className="size-3" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDelete(ann.id)}
                        className="rounded border border-rose-200 bg-white p-1 text-rose-500 hover:bg-rose-50"
                      >
                        <Trash2 className="size-3" />
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}

      {/* 상세 보기 */}
      <Dialog open={!!selected} onOpenChange={(open) => { if (!open) setSelected(null); }}>
        <DialogContent className="max-w-[520px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 pr-8">
              {selected?.isImportant && (
                <span className="shrink-0 rounded-full bg-indigo-100 px-2 py-0.5 text-xs font-medium text-indigo-700">📌 필독</span>
              )}
              <span>{selected?.title}</span>
            </DialogTitle>
          </DialogHeader>
          <div className="py-1">
            <p className="mb-3 text-xs text-slate-400">
              {selected?.date && format(parseISO(selected.date), "yyyy년 M월 d일", { locale: ko })}
              {selected?.authorName && ` · ${selected.authorName}`}
            </p>
            {selected?.body ? (
              <p className="text-sm text-slate-700 whitespace-pre-wrap leading-relaxed">{selected.body}</p>
            ) : (
              <p className="text-sm text-slate-400">내용 없음</p>
            )}
          </div>
          {isCLevel && selected && (
            <DialogFooter className="gap-2 sm:justify-start">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => handleToggleImportant(selected)}
              >
                {selected.isImportant ? "📌 필독 해제" : "📌 필독 설정"}
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => { setSelected(null); openEdit(selected); }}
              >
                수정
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="border-rose-200 text-rose-600 hover:bg-rose-50"
                onClick={() => handleDelete(selected.id)}
              >
                삭제
              </Button>
            </DialogFooter>
          )}
        </DialogContent>
      </Dialog>

      {/* 수정 모달 */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="max-w-[520px]">
          <DialogHeader>
            <DialogTitle>공지사항 수정</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="grid gap-2">
              <Label htmlFor="edit-title">제목</Label>
              <Input
                id="edit-title"
                value={editTitle}
                onChange={(e) => setEditTitle(e.target.value)}
                placeholder="제목을 입력하세요"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="edit-body">내용 (선택)</Label>
              <textarea
                id="edit-body"
                value={editBody}
                onChange={(e) => setEditBody(e.target.value)}
                rows={4}
                placeholder="내용을 입력하세요"
                className="flex w-full rounded-md border border-[var(--border)] bg-transparent px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              />
            </div>
            <label className="flex cursor-pointer items-center gap-2">
              <input
                type="checkbox"
                checked={editImportant}
                onChange={(e) => setEditImportant(e.target.checked)}
                className="size-4 rounded border-[var(--border)]"
              />
              <span className="text-sm font-medium text-slate-700">필독 공지로 표시</span>
            </label>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditOpen(false)}>취소</Button>
            <Button onClick={handleSave} disabled={!editTitle.trim()}>저장</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
